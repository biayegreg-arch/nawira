// GET /api/fertility-signals/recent — Banani reconciliation pass (E5 UI).
// Read-only. Returns the caller's last 3 LH_TEST signals strictly before
// today, most recent first — feeds /app/baby's "Historique récent" list
// (Banani source LHTestTracker). Today's own signal is excluded since
// TodaySignalsCard already shows/edits it directly.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { todayUtcDate } from '@/lib/server/cycles/date-utils';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const RECENT_SIGNALS_LIMIT = 3;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const signals = await prisma.fertilitySignal.findMany({
      where: { userId: auth.user.sub, type: 'LH_TEST', date: { lt: todayUtcDate() } },
      orderBy: { date: 'desc' },
      take: RECENT_SIGNALS_LIMIT,
      select: { date: true, lhResult: true },
    });

    return NextResponse.json(
      {
        entries: signals.map((s) => ({
          date: s.date.toISOString().slice(0, 10),
          lhResult: s.lhResult,
        })),
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
