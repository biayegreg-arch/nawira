import 'server-only';
import { addDays, daysBetween } from '../cycles/date-utils';

export type CyclePhase = 'MENSTRUAL' | 'FOLLICULAR' | 'OVULATORY' | 'LUTEAL';

export interface CompleteCycleForPhase {
  startDate: Date;
  endDate: Date; // non-null — caller only passes complete cycles
}

const LUTEAL_PHASE_DAYS = 14; // matches fertility-window.ts's own constant
const OVULATORY_WINDOW_DAYS = 1; // ovulation day +/- this many days

/**
 * Classifies an arbitrary historical `date` into a phase relative to the
 * COMPLETE `cycle` it falls inside. This is deliberately NOT
 * `CycleContextCard`'s `derivePhase()` — that function classifies
 * *today* relative to the single current `Prediction` row; this one
 * classifies a historical date using only that cycle's own known
 * start/end (no `Prediction` row exists per historical cycle).
 *
 * `bleedingDates` are this cycle's actual `PeriodEvent` dates (precise —
 * no estimation needed, unlike ovulation). Ovulation is back-calculated
 * from `endDate` the same way `computeFertilityWindow` back-calculates
 * it from a *predicted* next period start: for a COMPLETE cycle,
 * `endDate + 1 day` **is** the (already-known, not predicted) next
 * period's actual start, so the same `-14 days` luteal-phase constant
 * applies without needing a `Prediction` row at all.
 */
export function classifyPhase(
  date: Date,
  cycle: CompleteCycleForPhase,
  bleedingDates: Set<number>,
): CyclePhase {
  if (bleedingDates.has(date.getTime())) return 'MENSTRUAL';

  const ovulationDay = addDays(cycle.endDate, 1 - LUTEAL_PHASE_DAYS);
  const daysFromOvulation = daysBetween(ovulationDay, date);

  if (Math.abs(daysFromOvulation) <= OVULATORY_WINDOW_DAYS) return 'OVULATORY';
  return daysFromOvulation < 0 ? 'FOLLICULAR' : 'LUTEAL';
}
