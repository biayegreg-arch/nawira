// GET /api/cycles — Phase 3. Read-only: returns the caller's full Cycle
// history (no pagination — a user's history is a few dozen rows even
// after years of use) plus `todayLogged`, the one boolean the Home
// screen's logging CTA needs to know whether to show itself.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { todayUtcDate } from '@/lib/server/cycles/date-utils';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const [cycles, todayEvent] = await Promise.all([
      prisma.cycle.findMany({
        where: { userId: auth.user.sub },
        orderBy: { startDate: 'desc' },
        select: { startDate: true, endDate: true, length: true, isOutlier: true },
      }),
      prisma.periodEvent.findUnique({
        where: { userId_date: { userId: auth.user.sub, date: todayUtcDate() } },
        select: { userId: true },
      }),
    ]);

    return NextResponse.json(
      {
        cycles: cycles.map((c) => ({
          startDate: c.startDate.toISOString().slice(0, 10),
          endDate: c.endDate ? c.endDate.toISOString().slice(0, 10) : null,
          length: c.length,
          isOutlier: c.isOutlier,
        })),
        todayLogged: todayEvent !== null,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
