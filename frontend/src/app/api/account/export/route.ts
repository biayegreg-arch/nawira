// GET /api/account/export — droit à la portabilité (E8 part A). Returns
// every piece of the caller's own data as a single downloadable JSON file.
// Read-only: the only write is the DATA_EXPORTED AccountActivity row logged
// on success. No CSRF (GET is exempt from this project's CSRF policy).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { enforceExportRateLimit } from '@/lib/server/account/export-rate-limit';
import { logAccountActivity } from '@/lib/server/account/activity';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const limited = await enforceExportRateLimit(auth.user.sub);
    if (limited) {
      limited.headers.set('x-request-id', ctx.requestId);
      return limited;
    }

    const userId = auth.user.sub;

    // Assistant history is only exported if the user currently has an
    // active (non-revoked) ASSISTANT_HISTORY consent — defense-in-depth
    // documentation of the existing rule that conversations aren't
    // persisted at all without that consent (so the query would already
    // return [] in practice; this makes the rule explicit rather than
    // implicit).
    const activeAssistantConsent = await prisma.consent.findFirst({
      where: { userId, type: 'ASSISTANT_HISTORY', revokedAt: null },
      select: { id: true },
    });

    const [
      user,
      profile,
      consents,
      periodEvents,
      cycles,
      dailyLogs,
      symptomLogs,
      fertilitySignals,
      predictions,
      insights,
      notifications,
      notificationPreferences,
      assistantConversations,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, createdAt: true },
      }),
      prisma.profile.findUnique({ where: { userId } }),
      prisma.consent.findMany({ where: { userId }, orderBy: { grantedAt: 'desc' } }),
      prisma.periodEvent.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.cycle.findMany({ where: { userId }, orderBy: { startDate: 'desc' } }),
      prisma.dailyLog.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        include: { symptoms: true },
      }),
      prisma.symptomLog.findMany({ where: { dailyLog: { userId } } }),
      prisma.fertilitySignal.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.prediction.findUnique({ where: { userId } }),
      prisma.insight.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      prisma.notificationPreferences.findUnique({ where: { userId } }),
      activeAssistantConsent
        ? prisma.assistantConversation.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: { messages: true },
          })
        : Promise.resolve([]),
    ]);

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      user,
      profile,
      consents,
      periodEvents,
      cycles,
      dailyLogs,
      symptomLogs,
      fertilitySignals,
      predictions,
      insights,
      notifications,
      notificationPreferences,
      assistantConversations,
    };

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const userAgent = req.headers.get('user-agent') ?? undefined;
    try {
      await logAccountActivity(prisma, {
        userId,
        type: 'DATA_EXPORTED',
        ...(ip !== undefined ? { ip } : {}),
        ...(userAgent !== undefined ? { userAgent } : {}),
      });
    } catch (err) {
      log.warn('account activity log failed', { err: String(err), userId, type: 'DATA_EXPORTED' });
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const res = NextResponse.json(exportPayload, { headers: { 'x-request-id': ctx.requestId } });
    res.headers.set('Content-Disposition', `attachment; filename="nawira-export-${dateStr}.json"`);
    return res;
  });
}
