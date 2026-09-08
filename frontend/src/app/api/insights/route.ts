// GET /api/insights — Phase 6 (E6 Insights & Cycle Score).
//
// Read-only, no CSRF. Computes everything live from already-existing
// DailyLog/SymptomLog/Cycle/PeriodEvent rows — no new table, no
// materialization (spec §1). An authenticated user with no Profile/data
// yet gets a normal 200 with eligible:false, never a 404 — "not enough
// data" is not an error.
//
// `eligible` and `cycleScoreToday` are independent: a brand-new user can
// have `eligible: false` (not enough cycle/log history for trend
// insights) while still getting a real `cycleScoreToday` from today's own
// data. Do not hide cycleScoreToday just because eligible is false.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { deriveInsights, type InsightsInput } from '@/lib/server/insights/compute-insights';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const userId = auth.user.sub;
    const [cycles, dailyLogs, periodEvents] = await Promise.all([
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

    const input: InsightsInput = {
      cycles,
      dailyLogs: dailyLogs.map((log) => ({
        date: log.date,
        mood: log.mood,
        energy: log.energy,
        sleepQuality: log.sleepQuality,
        painLevel: log.painLevel,
        symptoms: log.symptoms.map((s) => s.symptom),
      })),
      periodEventDates: periodEvents.map((e) => e.date),
    };

    const result = deriveInsights(input);

    return NextResponse.json(result, { headers: { 'x-request-id': ctx.requestId } });
  });
}
