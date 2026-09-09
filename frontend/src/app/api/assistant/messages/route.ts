// POST /api/assistant/messages — Phase 7 (E10 AI Assistant).
//
// Streaming chat endpoint backed by Claude (client.ts). Two-layer
// guardrails: the fixed system prompt (system-prompt.ts) plus a
// rule-based output filter (output-filter.ts) applied to the complete
// response before it's forwarded. Conversation persistence is gated by
// the ASSISTANT_HISTORY consent (spec §2) — when not granted, the client
// resends the full conversation on every call and nothing is written here.
//
// `eligible` and `cycleScoreToday` (from deriveInsights) are independent:
// a brand-new user can still get a real, personalized reply even with no
// cycle history — formatUserContext() returns an honest "not enough data"
// sentence rather than fabricating context.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { deriveInsights, type InsightsInput } from '@/lib/server/insights/compute-insights';
import { buildSystemPrompt } from '@/lib/server/assistant/system-prompt';
import {
  formatUserContext,
  type PredictionForContext,
} from '@/lib/server/assistant/context-summary';
import { filterAssistantOutput } from '@/lib/server/assistant/output-filter';
import { classifyIntent } from '@/lib/server/assistant/intent-classifier';
import { checkAndConsumeQuota } from '@/lib/server/assistant/quota';
import { sendAssistantMessage, AssistantNotConfiguredError } from '@/lib/server/assistant/client';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const Body = z.object({
  conversationId: z.string().optional(),
  message: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(['USER', 'ASSISTANT']), content: z.string() }))
    .optional(),
});

function jsonError(
  code: string,
  status: number,
  requestId: string,
  message?: string,
): NextResponse {
  const res = NextResponse.json({ error: code, ...(message ? { message } : {}) }, { status });
  res.headers.set('x-request-id', requestId);
  return res;
}

function chunkText(text: string, size = 40): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks.length > 0 ? chunks : [''];
}

export async function POST(req: NextRequest): Promise<Response> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) {
      csrfFail.headers.set('x-request-id', ctx.requestId);
      return csrfFail;
    }

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }
    const userId = auth.user.sub;

    let body: z.infer<typeof Body>;
    try {
      const text = await req.text();
      const json: unknown = text.trim().length > 0 ? JSON.parse(text) : {};
      body = Body.parse(json);
    } catch {
      return jsonError('VALIDATION_FAILED', 400, ctx.requestId, 'Invalid request body');
    }

    const quota = await checkAndConsumeQuota(userId);
    if (!quota.allowed) {
      return jsonError('ASSISTANT_QUOTA_EXCEEDED', 429, ctx.requestId);
    }

    const consent = await prisma.consent.findFirst({
      where: { userId, type: 'ASSISTANT_HISTORY', revokedAt: null },
    });
    const historyEnabled = consent !== null;

    let conversationId: string | null = null;
    let historyForModel: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    if (historyEnabled) {
      if (body.conversationId) {
        const existing = await prisma.assistantConversation.findUnique({
          where: { id: body.conversationId },
          include: { messages: { orderBy: { createdAt: 'asc' } } },
        });
        if (!existing || existing.userId !== userId) {
          return jsonError('CONVERSATION_NOT_FOUND', 404, ctx.requestId);
        }
        conversationId = existing.id;
        historyForModel = existing.messages.map((m) => ({
          role: m.role === 'USER' ? ('user' as const) : ('assistant' as const),
          content: m.content,
        }));
      } else {
        const created = await prisma.assistantConversation.create({
          data: { userId, title: body.message.slice(0, 80) },
        });
        conversationId = created.id;
      }
    } else {
      historyForModel = (body.history ?? []).map((m) => ({
        role: m.role === 'USER' ? ('user' as const) : ('assistant' as const),
        content: m.content,
      }));
    }

    const [prediction, cycles, dailyLogs, periodEvents] = await Promise.all([
      prisma.prediction.findUnique({ where: { userId } }),
      prisma.cycle.findMany({
        where: { userId },
        orderBy: { startDate: 'asc' },
        select: { startDate: true, endDate: true, length: true, isOutlier: true },
      }),
      prisma.dailyLog.findMany({
        where: { userId },
        orderBy: { date: 'asc' },
        include: { symptoms: true },
      }),
      prisma.periodEvent.findMany({
        where: { userId },
        orderBy: { date: 'asc' },
        select: { date: true },
      }),
    ]);

    const insightsInput: InsightsInput = {
      cycles,
      dailyLogs: dailyLogs.map((l) => ({
        date: l.date,
        mood: l.mood,
        energy: l.energy,
        sleepQuality: l.sleepQuality,
        painLevel: l.painLevel,
        symptoms: l.symptoms.map((s) => s.symptom),
      })),
      periodEventDates: periodEvents.map((e) => e.date),
    };
    const insights = deriveInsights(insightsInput);

    const predictionForContext: PredictionForContext | null = prediction
      ? {
          confidence: prediction.confidence as PredictionForContext['confidence'],
          expectedPeriodStart: prediction.expectedPeriodStart.toISOString().slice(0, 10),
          ovulationEstimate: prediction.ovulationEstimate
            ? prediction.ovulationEstimate.toISOString().slice(0, 10)
            : null,
          fertileWindowStart: prediction.fertileWindowStart
            ? prediction.fertileWindowStart.toISOString().slice(0, 10)
            : null,
          fertileWindowEnd: prediction.fertileWindowEnd
            ? prediction.fertileWindowEnd.toISOString().slice(0, 10)
            : null,
        }
      : null;

    const contextSummary = formatUserContext({ prediction: predictionForContext, insights });
    const userMessageForModel = `${contextSummary}\n\nQuestion : ${body.message}`;

    let responseText: string;
    try {
      responseText = await sendAssistantMessage({
        systemPrompt: buildSystemPrompt(),
        history: historyForModel,
        userMessage: userMessageForModel,
      });
    } catch (err) {
      if (err instanceof AssistantNotConfiguredError) {
        return jsonError('AI_NOT_CONFIGURED', 503, ctx.requestId);
      }
      log.error('assistant upstream error', {
        error: err instanceof Error ? err.message : String(err),
      });
      return jsonError('ASSISTANT_UPSTREAM_ERROR', 502, ctx.requestId);
    }

    const filteredText = filterAssistantOutput(responseText);
    const intentCategory = classifyIntent(body.message);

    let messageId: string | null = null;
    if (historyEnabled && conversationId) {
      await prisma.assistantMessage.create({
        data: { conversationId, role: 'USER', content: body.message, intentCategory },
      });
      const assistantMsg = await prisma.assistantMessage.create({
        data: { conversationId, role: 'ASSISTANT', content: filteredText },
      });
      messageId = assistantMsg.id;
      await prisma.assistantConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunkText(filteredText)) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`),
          );
        }
        controller.enqueue(
          encoder.encode(`event: done\ndata: ${JSON.stringify({ conversationId, messageId })}\n\n`),
        );
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'x-request-id': ctx.requestId,
      },
    });
  });
}
