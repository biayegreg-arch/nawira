// GET/PUT /api/daily-logs/today — Phase 4 (E4 daily journal).
//
// Today-only: both handlers operate on todayUtcDate(), no date param
// accepted. PUT is a full-replace upsert, not a partial patch — every
// body field is required-but-nullable, matching how the /app/log form
// always submits the complete current state of the whole form in one
// save. No call to recomputeCyclesAndPrediction — DailyLog is
// completely independent of cycle computation (Phase 3).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { todayUtcDate } from '@/lib/server/cycles/date-utils';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const SYMPTOMS = [
  'CRAMPS',
  'HEADACHE',
  'BLOATING',
  'NAUSEA',
  'ACNE',
  'TENDER_BREASTS',
  'FATIGUE',
  'BACK_PAIN',
  'CONSTIPATION',
  'DIARRHEA',
  'FOOD_CRAVINGS',
  'LIBIDO_CHANGE',
] as const;

const Body = z.object({
  painLevel: z.number().int().min(0).max(10).nullable(),
  painLocation: z.string().max(100).nullable(),
  mood: z.enum(['VERY_GOOD', 'GOOD', 'TIRED', 'STRESSED', 'LOW']).nullable(),
  energy: z.enum(['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']).nullable(),
  sleepQuality: z.enum(['POOR', 'FAIR', 'GOOD', 'EXCELLENT']).nullable(),
  sleepHours: z.number().min(0).max(24).nullable(),
  note: z.string().max(1000).nullable(),
  symptoms: z.array(z.enum(SYMPTOMS)),
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const dailyLog = await prisma.dailyLog.findUnique({
      where: { userId_date: { userId: auth.user.sub, date: todayUtcDate() } },
      include: { symptoms: true },
    });

    return NextResponse.json(
      {
        log: dailyLog
          ? {
              painLevel: dailyLog.painLevel,
              painLocation: dailyLog.painLocation,
              mood: dailyLog.mood,
              energy: dailyLog.energy,
              sleepQuality: dailyLog.sleepQuality,
              sleepHours: dailyLog.sleepHours,
              note: dailyLog.note,
              symptoms: dailyLog.symptoms.map((s) => s.symptom),
            }
          : null,
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
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

    let body: z.infer<typeof Body>;
    try {
      const text = await req.text();
      const json: unknown = text.trim().length > 0 ? JSON.parse(text) : {};
      body = Body.parse(json);
    } catch {
      return jsonError('VALIDATION_FAILED', 400, ctx.requestId, 'Invalid request body');
    }

    const profile = await prisma.profile.findUnique({
      where: { userId: auth.user.sub },
      select: { userId: true },
    });
    if (!profile) {
      return jsonError('PROFILE_NOT_FOUND', 404, ctx.requestId);
    }

    const today = todayUtcDate();
    const uniqueSymptoms = [...new Set(body.symptoms)];

    await prisma.$transaction(async (tx) => {
      const dailyLog = await tx.dailyLog.upsert({
        where: { userId_date: { userId: auth.user.sub, date: today } },
        create: {
          userId: auth.user.sub,
          date: today,
          painLevel: body.painLevel,
          painLocation: body.painLocation,
          mood: body.mood,
          energy: body.energy,
          sleepQuality: body.sleepQuality,
          sleepHours: body.sleepHours,
          note: body.note,
        },
        update: {
          painLevel: body.painLevel,
          painLocation: body.painLocation,
          mood: body.mood,
          energy: body.energy,
          sleepQuality: body.sleepQuality,
          sleepHours: body.sleepHours,
          note: body.note,
        },
      });

      await tx.symptomLog.deleteMany({ where: { dailyLogId: dailyLog.id } });
      await tx.symptomLog.createMany({
        data: uniqueSymptoms.map((symptom) => ({ dailyLogId: dailyLog.id, symptom })),
      });
    });

    log.info('daily log saved', { userId: auth.user.sub });
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
