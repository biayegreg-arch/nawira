import 'server-only';
import { addDays } from './date-utils';
import type { ComputedCycle } from './build-cycles';
import type { Episode } from './episodes';

export const ALGORITHM_VERSION = 'v1';

const CV_MEDIUM_THRESHOLD = 0.15;
const CV_FORCE_LOW_THRESHOLD = 0.3;
const SLIDING_WINDOW_SIZE = 6;
const DEFAULT_PERIOD_LENGTH_DAYS = 5;
const MEDIUM_TIER_MAX_COMPLETE = 5;

export interface PredictionResult {
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  expectedPeriodStart: Date;
  expectedPeriodEnd: Date;
  algorithmVersion: string;
}

interface ProfileLengths {
  usualCycleLength: number | null;
  usualPeriodLength: number | null;
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Linearly increasing weights: oldest (index 0) = weight 1, ... newest = weight n. `values` MUST be chronologically ascending. */
function weightedAverage(values: number[]): number {
  const weights = values.map((_, i) => i + 1);
  const weightedSum = values.reduce((sum, v, i) => sum + v * weights[i]!, 0);
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  return weightedSum / weightSum;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = average(values);
  if (mean === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/** Non-outlier lengths, or all lengths if every cycle in `group` is flagged (never return an empty array). */
function nonOutlierLengths(group: ComputedCycle[]): number[] {
  const nonOutlier = group.filter((c) => !c.isOutlier).map((c) => c.length!);
  return nonOutlier.length > 0 ? nonOutlier : group.map((c) => c.length!);
}

/**
 * Period length in days: the declared `Profile.usualPeriodLength` when set,
 * otherwise the median of the SETTLED episodes' lengths, otherwise
 * `DEFAULT_PERIOD_LENGTH_DAYS`.
 *
 * The most recent episode is deliberately excluded from the median: it is
 * still in progress at recompute time (the only writer logs today), so its
 * length is a partial count, not an observation. Onboarding's single
 * `lastPeriodDate` row is likewise structurally always length 1 and never a
 * real measurement — including it would predict a 1-day period for every
 * brand-new user.
 */
function resolvePeriodLengthDays(usualPeriodLength: number | null, episodes: Episode[]): number {
  if (usualPeriodLength !== null) return usualPeriodLength;
  const settled = episodes.slice(0, -1);
  if (settled.length === 0) return DEFAULT_PERIOD_LENGTH_DAYS;
  return Math.round(median(settled.map((e) => e.length)));
}

/**
 * Implements the Phase 3 spec's 4-tier prediction algorithm (PRD §7.2)
 * plus the CV-based confidence rules (§7.3, thresholds fixed by this
 * codebase — see the spec's "Prediction algorithm" section). Returns
 * `null` when no prediction can be computed (0 complete cycles and no
 * declared `usualCycleLength`) — callers must delete any existing
 * `Prediction` row in that case, not leave a stale one.
 */
export function computePrediction(
  cycles: ComputedCycle[],
  episodes: Episode[],
  profile: ProfileLengths,
): PredictionResult | null {
  const mostRecentEpisode = episodes[episodes.length - 1];
  if (!mostRecentEpisode) return null;

  const allComplete = cycles.filter((c) => c.length !== null);
  const completeCount = allComplete.length;

  let cycleLengthEstimate: number;
  let confidence: 'LOW' | 'MEDIUM' | 'HIGH';

  if (completeCount === 0) {
    if (profile.usualCycleLength === null) return null;
    cycleLengthEstimate = profile.usualCycleLength;
    confidence = 'LOW';
  } else if (completeCount <= 2) {
    cycleLengthEstimate = average(nonOutlierLengths(allComplete));
    confidence = 'LOW';
  } else if (completeCount <= MEDIUM_TIER_MAX_COMPLETE) {
    const lengths = nonOutlierLengths(allComplete);
    cycleLengthEstimate = weightedAverage(lengths);
    const cv = coefficientOfVariation(lengths);
    confidence = cv < CV_MEDIUM_THRESHOLD ? 'MEDIUM' : 'LOW';
  } else {
    const window = allComplete.slice(-SLIDING_WINDOW_SIZE);
    const nonOutlierInWindow = window.filter((c) => !c.isOutlier);
    const outlierCountInWindow = window.length - nonOutlierInWindow.length;
    const lengths = nonOutlierLengths(window);
    cycleLengthEstimate = median(lengths);
    const cv = coefficientOfVariation(lengths);
    confidence = cv < CV_MEDIUM_THRESHOLD && outlierCountInWindow <= 1 ? 'HIGH' : 'MEDIUM';
    // The >=6 tier is the only one where this override changes the
    // outcome: the table above already resolves every CV >= 0.15 to LOW
    // at the 1-2 and 3-5 tiers (a superset of CV > 0.30), so re-checking
    // it there would be dead code.
    if (cv > CV_FORCE_LOW_THRESHOLD) confidence = 'LOW';
  }

  const periodLengthDays = resolvePeriodLengthDays(profile.usualPeriodLength, episodes);
  const expectedPeriodStart = addDays(mostRecentEpisode.start, Math.round(cycleLengthEstimate));
  const expectedPeriodEnd = addDays(expectedPeriodStart, periodLengthDays - 1);

  return {
    confidence,
    expectedPeriodStart,
    expectedPeriodEnd,
    algorithmVersion: ALGORITHM_VERSION,
  };
}
