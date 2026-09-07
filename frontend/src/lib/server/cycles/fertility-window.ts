import 'server-only';
import { addDays } from './date-utils';
import type { PredictionResult } from './prediction';

const LUTEAL_PHASE_DAYS = 14;
const FERTILE_WINDOW_BEFORE_OVULATION_DAYS = 5;
const FERTILE_WINDOW_AFTER_OVULATION_DAYS = 1;

export interface FertilityWindowResult {
  ovulationEstimate: Date;
  fertileWindowStart: Date;
  fertileWindowEnd: Date;
}

/**
 * Standard calendar/luteal-phase back-calculation: ovulation is estimated
 * as `LUTEAL_PHASE_DAYS` before the next predicted period start, NOT a
 * fixed "day 14 of the cycle" (PRD §8.1 explicitly forbids that
 * generalization — a 26-day and a 32-day cycle get different ovulation
 * days here because `expectedPeriodStart` differs, even though the
 * luteal-phase constant itself does not). The luteal phase (post-
 * ovulation) is clinically far more stable across women than the
 * follicular phase (pre-ovulation), which is why this direction of
 * back-calculation is the standard approach.
 *
 * Returns `null` when `prediction` is `null` — PRD §8.1: "uniquement si
 * le cycle attendu est calculable."
 */
export function computeFertilityWindow(
  prediction: PredictionResult | null,
): FertilityWindowResult | null {
  if (!prediction) return null;

  const ovulationEstimate = addDays(prediction.expectedPeriodStart, -LUTEAL_PHASE_DAYS);

  return {
    ovulationEstimate,
    fertileWindowStart: addDays(ovulationEstimate, -FERTILE_WINDOW_BEFORE_OVULATION_DAYS),
    fertileWindowEnd: addDays(ovulationEstimate, FERTILE_WINDOW_AFTER_OVULATION_DAYS),
  };
}
