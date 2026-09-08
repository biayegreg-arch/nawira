import 'server-only';
import type { Prisma } from '@prisma/client';
import { groupIntoEpisodes } from './episodes';
import { buildCycles } from './build-cycles';
import { computePrediction } from './prediction';
import { computeFertilityWindow } from './fertility-window';

/**
 * Re-derives the user's `Cycle` rows and single `Prediction` row from
 * their `PeriodEvent` history. Call this inside the SAME transaction as
 * any `PeriodEvent` write (see `POST /api/period-events` and
 * `POST /api/onboarding/complete`) — never outside a transaction, and
 * never from a cron/background job (Phase 3 spec: event-driven,
 * materialized computation, no outbox).
 *
 * Derivation covers the whole history, but only rows whose derived state
 * actually CHANGED are written: existing `Cycle` rows are read once and
 * diffed, so a typical "log today" call issues at most one or two
 * `cycle.upsert` round-trips instead of one per historical cycle. That
 * matters because this all runs inside a single transaction, against
 * Neon's ~2s transaction ceiling.
 *
 * Orphan pruning: free-date logging (a backfilled period range) can merge
 * two previously separate episodes into one, which shifts or removes a
 * previous episode's startDate. Any existing `Cycle` row whose `startDate`
 * no longer matches a current episode is deleted in one `deleteMany` — this
 * runs on every call, not only ones triggered by range logging, since a
 * cheap `Set` diff against rows already fetched above costs nothing extra.
 */
export async function recomputeCyclesAndPrediction(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const [periodEvents, profile, existingCycles] = await Promise.all([
    tx.periodEvent.findMany({
      where: { userId },
      orderBy: { date: 'asc' },
      select: { date: true },
    }),
    tx.profile.findUnique({
      where: { userId },
      select: { usualCycleLength: true, usualPeriodLength: true },
    }),
    tx.cycle.findMany({
      where: { userId },
      select: { startDate: true, endDate: true, length: true, isOutlier: true },
    }),
  ]);

  const episodes = groupIntoEpisodes(periodEvents.map((e) => e.date));
  const cycles = buildCycles(episodes);

  const existingByStart = new Map(existingCycles.map((c) => [c.startDate.getTime(), c]));

  const currentStarts = new Set(cycles.map((c) => c.startDate.getTime()));
  const orphanStarts = existingCycles
    .filter((c) => !currentStarts.has(c.startDate.getTime()))
    .map((c) => c.startDate);
  if (orphanStarts.length > 0) {
    await tx.cycle.deleteMany({ where: { userId, startDate: { in: orphanStarts } } });
  }

  for (const cycle of cycles) {
    const prev = existingByStart.get(cycle.startDate.getTime());
    const unchanged =
      prev !== undefined &&
      prev.length === cycle.length &&
      prev.isOutlier === cycle.isOutlier &&
      (prev.endDate?.getTime() ?? null) === (cycle.endDate?.getTime() ?? null);
    if (unchanged) continue;

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
  const fertilityWindow = computeFertilityWindow(prediction);

  if (prediction) {
    await tx.prediction.upsert({
      where: { userId },
      create: {
        userId,
        algorithmVersion: prediction.algorithmVersion,
        confidence: prediction.confidence,
        expectedPeriodStart: prediction.expectedPeriodStart,
        expectedPeriodEnd: prediction.expectedPeriodEnd,
        ovulationEstimate: fertilityWindow?.ovulationEstimate ?? null,
        fertileWindowStart: fertilityWindow?.fertileWindowStart ?? null,
        fertileWindowEnd: fertilityWindow?.fertileWindowEnd ?? null,
        computedAt: new Date(),
      },
      update: {
        algorithmVersion: prediction.algorithmVersion,
        confidence: prediction.confidence,
        expectedPeriodStart: prediction.expectedPeriodStart,
        expectedPeriodEnd: prediction.expectedPeriodEnd,
        ovulationEstimate: fertilityWindow?.ovulationEstimate ?? null,
        fertileWindowStart: fertilityWindow?.fertileWindowStart ?? null,
        fertileWindowEnd: fertilityWindow?.fertileWindowEnd ?? null,
        computedAt: new Date(),
      },
    });
  } else {
    await tx.prediction.deleteMany({ where: { userId } });
  }
}
