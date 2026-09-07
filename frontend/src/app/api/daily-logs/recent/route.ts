// GET /api/daily-logs/recent — Phase 6 (Banani reconciliation pass).
// Read-only. Returns the caller's last 3 daily logs strictly before
// today, most recent first — feeds /app/log's "Dernières saisies"
// sidebar card (Banani source AddDataPage). Today's own log is excluded
// since it's what the form on that page is currently editing.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { todayUtcDate } from '@/lib/server/cycles/date-utils';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const RECENT_LOGS_LIMIT = 3;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const logs = await prisma.dailyLog.findMany({
      where: { userId: auth.user.sub, date: { lt: todayUtcDate() } },
      orderBy: { date: 'desc' },
      take: RECENT_LOGS_LIMIT,
      include: { symptoms: true },
    });

    return NextResponse.json(
      {
        entries: logs.map((log) => ({
          date: log.date.toISOString().slice(0, 10),
          mood: log.mood,
          symptoms: log.symptoms.map((s) => s.symptom),
        })),
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
