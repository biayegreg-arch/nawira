import 'server-only';
import type { Prisma } from '@prisma/client';
import { groupIntoEpisodes } from './episodes';
import { buildCycles } from './build-cycles';
import { computePrediction } from './prediction';

/**
 * Re-derives every `Cycle` row and the single `Prediction` row for a
 * user from their `PeriodEvent` history. Call this inside the SAME
 * transaction as any `PeriodEvent` write (see `POST /api/period-events`
 * and `POST /api/onboarding/complete`) — never outside a transaction,
 * and never from a cron/background job (Phase 3 spec: event-driven,
 * materialized computation, no outbox).
 */
export async function recomputeCyclesAndPrediction(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const [periodEvents, profile] = await Promise.all([
    tx.periodEvent.findMany({
      where: { userId },
      orderBy: { date: 'asc' },
      select: { date: true },
    }),
    tx.profile.findUnique({
      where: { userId },
      select: { usualCycleLength: true, usualPeriodLength: true },
    }),
  ]);

  const episodes = groupIntoEpisodes(periodEvents.map((e) => e.date));
  const cycles = buildCycles(episodes);

  for (const cycle of cycles) {
    await tx.cycle.upsert({
      where: { userId_startDate: { userId, startDate: cycle.startDate } },
      create: {
        userId,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        length: cycle.length,
        isOutlier: cycle.isOutlier,
      },
      update: {
        endDate: cycle.endDate,
        length: cycle.length,
        isOutlier: cycle.isOutlier,
      },
    });
  }

  const prediction = computePrediction(cycles, episodes, {
    usualCycleLength: profile?.usualCycleLength ?? null,
    usualPeriodLength: profile?.usualPeriodLength ?? null,
  });

  if (prediction) {
    await tx.prediction.upsert({
      where: { userId },
      create: {
        userId,
        algorithmVersion: prediction.algorithmVersion,
        confidence: prediction.confidence,
        expectedPeriodStart: prediction.expectedPeriodStart,
        expectedPeriodEnd: prediction.expectedPeriodEnd,
        computedAt: new Date(),
      },
      update: {
        algorithmVersion: prediction.algorithmVersion,
        confidence: prediction.confidence,
        expectedPeriodStart: prediction.expectedPeriodStart,
        expectedPeriodEnd: prediction.expectedPeriodEnd,
        computedAt: new Date(),
      },
    });
  } else {
    await tx.prediction.deleteMany({ where: { userId } });
  }
}
