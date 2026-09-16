// POST /api/cron/notification-triggers — Phase 8 (E9, PRD §11 N01-N04).
//
// Daily cron (18:00 UTC — Sénégal, the PRD pilot market, is UTC+0
// year-round, so this is genuinely 18:00 Dakar time). Checks all 4
// notification triggers for every profile that hasn't opted out
// entirely (notificationLevel != NONE). N01/N02/N04 use batched
// queries (no N+1). N03 (weekly summary) additionally needs each
// profile's full Insights eligibility, computed the same way
// GET /api/insights does — that per-user fan-out only runs on Mondays.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { todayUtcDate } from '@/lib/server/cycles/date-utils';
import { createNotification } from '@/lib/server/notifications';
import {
  checkPeriodReminder,
  checkJournalReminder,
  checkWeeklySummary,
  checkFertilityReminder,
  type ProfileRow,
  type PredictionRow,
} from '@/lib/server/notifications/triggers';
import { deriveInsights, type InsightsInput } from '@/lib/server/insights/compute-insights';

const log = createLogger();
const LEASE_TTL_MS = 120_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let sent = 0;

    await withLease(redis ?? undefined, 'notification-triggers', LEASE_TTL_MS, async () => {
      const today = todayUtcDate();

      const profiles: ProfileRow[] = await prisma.profile.findMany({
        where: { notificationLevel: { not: 'NONE' } },
        select: { userId: true, notificationLevel: true, goal: true },
      });

      if (profiles.length === 0) {
        log.info('notification-triggers tick: no eligible profiles', {
          requestId: ctx.requestId,
        });
        return;
      }

      const userIds = profiles.map((p) => p.userId);

      const [predictionRows, todayLogRows] = await Promise.all([
        prisma.prediction.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, expectedPeriodStart: true, fertileWindowStart: true },
        }),
        prisma.dailyLog.findMany({
          where: { userId: { in: userIds }, date: today },
          select: { userId: true },
        }),
      ]);

      const predictionByUser = new Map<string, PredictionRow>(
        predictionRows.map((p) => [p.userId, p]),
      );
      const loggedTodayUsers = new Set(todayLogRows.map((l) => l.userId));
      const isMonday = today.getUTCDay() === 1;

      for (const profile of profiles) {
        const prediction = predictionByUser.get(profile.userId);
        const hasTodayLog = loggedTodayUsers.has(profile.userId);

        const toSend = [
          checkPeriodReminder(profile, prediction, today),
          checkJournalReminder(profile, hasTodayLog, today),
          checkFertilityReminder(profile, prediction, today),
        ];

        if (isMonday) {
          const [cycles, dailyLogs, periodEvents] = await Promise.all([
            prisma.cycle.findMany({
              where: { userId: profile.userId },
              orderBy: { startDate: 'asc' },
              select: { startDate: true, endDate: true, length: true, isOutlier: true },
            }),
            prisma.dailyLog.findMany({
              where: { userId: profile.userId },
              orderBy: { date: 'asc' },
              include: { symptoms: true },
            }),
            prisma.periodEvent.findMany({
              where: { userId: profile.userId },
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

          const { eligible } = deriveInsights(insightsInput);
          toSend.push(checkWeeklySummary(profile, eligible, today));
        }

        for (const input of toSend) {
          if (!input) continue;
          const created = await createNotification(prisma, input);
          if (created) sent += 1;
        }
      }

      log.info('notification-triggers tick', {
        sent,
        profiles: profiles.length,
        requestId: ctx.requestId,
      });
    });

    return NextResponse.json({ ok: true, sent }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
