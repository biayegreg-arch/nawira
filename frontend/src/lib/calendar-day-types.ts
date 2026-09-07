import type { CalendarDayType } from '@/components/calendar/MonthGrid';

interface CycleSummary {
  startDate: string;
  endDate: string | null;
}

interface PredictionSummary {
  expectedPeriodStart: string;
  fertileWindowStart?: string | null;
  fertileWindowEnd?: string | null;
  ovulationEstimate?: string | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Today's date as `YYYY-MM-DD`. Senegal (NAWIRA's pilot market) is UTC+0, so this matches the backend's UTC-day convention exactly. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoRange(startIso: string, endIso: string): string[] {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const days: string[] = [];
  for (let d = start.getTime(); d <= end.getTime(); d += MS_PER_DAY) {
    days.push(new Date(d).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Derives per-day calendar markers from the Phase 3/5 API responses.
 * Precedence when a date matches more than one type: today > observed >
 * predicted > ovulation > fertile (assignment order below, later wins) —
 * real logged data always beats an estimate, and estimates never override
 * each other by accident (ovulation is a single day inside the fertile
 * range, so it's assigned after so it stays visible on that one day).
 */
export function buildDayTypes(
  cycles: CycleSummary[],
  prediction: PredictionSummary | null,
  today: string,
): Record<string, CalendarDayType> {
  const dayTypes: Record<string, CalendarDayType> = {};

  if (prediction?.fertileWindowStart && prediction.fertileWindowEnd) {
    for (const iso of isoRange(prediction.fertileWindowStart, prediction.fertileWindowEnd)) {
      dayTypes[iso] = 'fertile';
    }
  }

  if (prediction?.ovulationEstimate) {
    dayTypes[prediction.ovulationEstimate] = 'ovulation';
  }

  if (prediction) {
    dayTypes[prediction.expectedPeriodStart] = 'predicted';
  }

  for (const cycle of cycles) {
    const end = cycle.endDate ?? today;
    for (const iso of isoRange(cycle.startDate, end)) {
      dayTypes[iso] = 'observed';
    }
  }

  dayTypes[today] = 'today';

  return dayTypes;
}
