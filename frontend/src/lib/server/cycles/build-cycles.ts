import 'server-only';
import { daysBetween, addDays } from './date-utils';
import type { Episode } from './episodes';

export interface ComputedCycle {
  startDate: Date;
  endDate: Date | null;
  length: number | null;
  isOutlier: boolean;
}

const MIN_COMPLETE_CYCLES_FOR_OUTLIER_CHECK = 3;
const OUTLIER_MIN_ABS_DAYS = 7;
const OUTLIER_RELATIVE_FRACTION = 0.3;

/**
 * Pairs consecutive episode starts into `Cycle` rows. The most recent
 * episode always becomes an open cycle (`endDate`/`length` null). Runs
 * outlier detection (see `markOutliers`) once >=3 complete cycles exist.
 */
export function buildCycles(episodes: Episode[]): ComputedCycle[] {
  if (episodes.length === 0) return [];

  const cycles: ComputedCycle[] = [];
  for (let i = 0; i < episodes.length - 1; i++) {
    const current = episodes[i]!;
    const next = episodes[i + 1]!;
    cycles.push({
      startDate: current.start,
      endDate: addDays(next.start, -1),
      length: daysBetween(current.start, next.start),
      isOutlier: false,
    });
  }

  const lastEpisode = episodes[episodes.length - 1]!;
  cycles.push({ startDate: lastEpisode.start, endDate: null, length: null, isOutlier: false });

  markOutliers(cycles);
  return cycles;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Marks each complete cycle whose length deviates from the median of the
 * OTHER complete cycles' lengths by more than `max(7, 30% of that
 * median)`. This exact threshold is this codebase's own design decision
 * (not PRD-specified) — see the Phase 3 spec's "Cycle-detection
 * algorithm" section. Mutates `cycles` in place.
 */
function markOutliers(cycles: ComputedCycle[]): void {
  const completeIndices = cycles
    .map((c, i) => (c.length !== null ? i : -1))
    .filter((i) => i !== -1);

  if (completeIndices.length < MIN_COMPLETE_CYCLES_FOR_OUTLIER_CHECK) return;

  const lengths = completeIndices.map((i) => cycles[i]!.length!);

  completeIndices.forEach((cycleIndex, pos) => {
    const othersLengths = lengths.filter((_, p) => p !== pos);
    const med = median(othersLengths);
    const threshold = Math.max(OUTLIER_MIN_ABS_DAYS, OUTLIER_RELATIVE_FRACTION * med);
    const length = cycles[cycleIndex]!.length!;
    cycles[cycleIndex]!.isOutlier = Math.abs(length - med) > threshold;
  });
}
