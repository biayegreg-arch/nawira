// GET /api/admin/analytics/overview — E12 KPI dashboard data. Real counts
// only, straight off the AnalyticsEvent table built for the event pipeline
// (lib/server/analytics/track.ts) — no fabricated metrics, matching this
// project's "no fake data" discipline (see .planning/banani/admin.md).
//
// Every number here is an event count, not a "user metric": checkout_started
// / subscription_activated / subscription_cancelled / privacy_export_requested
// / account_delete_requested are schema-declared but never fired anywhere in
// the app (payments were pruned entirely; export/delete don't call trackEvent)
// — they will always read 0 here, which is the honest answer, not a bug.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { ANALYTICS_EVENT_TYPES, type AnalyticsEventType } from '@/lib/analytics/events';

const DEFAULT_WINDOW_DAYS = 30;
const MIN_WINDOW_DAYS = 1;
const MAX_WINDOW_DAYS = 90;

function parseWindowDays(raw: string | null): number {
  const n = raw === null ? DEFAULT_WINDOW_DAYS : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_WINDOW_DAYS;
  return Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, Math.trunc(n)));
}

async function countsByType(
  windowStart: Date,
  windowEnd: Date,
): Promise<Record<AnalyticsEventType, number>> {
  const rows = await prisma.analyticsEvent.groupBy({
    by: ['type'],
    where: { createdAt: { gte: windowStart, lt: windowEnd } },
    _count: { _all: true },
  });
  const byType = new Map(rows.map((r) => [r.type, r._count._all]));
  return Object.fromEntries(
    ANALYTICS_EVENT_TYPES.map((type) => [type, byType.get(type) ?? 0]),
  ) as Record<AnalyticsEventType, number>;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const days = parseWindowDays(req.nextUrl.searchParams.get('days'));
    const now = new Date();
    const windowStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const prevWindowStart = new Date(windowStart.getTime() - days * 24 * 60 * 60 * 1000);

    const [current, previous, activeUserGroups] = await Promise.all([
      countsByType(windowStart, now),
      countsByType(prevWindowStart, windowStart),
      prisma.analyticsEvent.groupBy({
        by: ['userId'],
        where: { createdAt: { gte: windowStart, lt: now } },
      }),
    ]);

    const started = current.onboarding_started;
    const goalSelected = current.goal_selected;
    const completed = current.onboarding_completed;

    return NextResponse.json(
      {
        windowDays: days,
        activeUsers: activeUserGroups.length,
        eventCounts: current,
        previousEventCounts: previous,
        onboardingFunnel: {
          started,
          goalSelected,
          completed,
          startedToGoalRate: started > 0 ? goalSelected / started : null,
          goalToCompletedRate: goalSelected > 0 ? completed / goalSelected : null,
          startedToCompletedRate: started > 0 ? completed / started : null,
        },
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
