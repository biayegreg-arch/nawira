import 'server-only';
import { computeDailyCycleScore } from './cycle-score';
import { classifyPhase, type CyclePhase } from './cycle-phase';
import { groupIntoEpisodes } from '../cycles/episodes';
import { daysBetween, todayUtcDate } from '../cycles/date-utils';

export interface CycleInput {
  startDate: Date;
  endDate: Date | null;
  length: number | null;
  isOutlier: boolean;
}

export interface DailyLogInput {
  date: Date;
  mood: string | null;
  energy: string | null;
  sleepQuality: string | null;
  painLevel: number | null;
  symptoms: string[];
}

export interface InsightsInput {
  cycles: CycleInput[]; // ascending by startDate
  dailyLogs: DailyLogInput[]; // ascending by date
  periodEventDates: Date[]; // ascending
}

export type InsightType =
  | 'AVG_CYCLE_LENGTH'
  | 'AVG_PERIOD_LENGTH'
  | 'CYCLE_VARIABILITY'
  | 'TOP_SYMPTOMS'
  | 'CYCLE_COMPARISON'
  | 'CYCLE_SCORE_TREND';

export interface AvgCycleLengthInsight {
  type: 'AVG_CYCLE_LENGTH';
  evidenceCount: number;
  data: { average: number; min: number; max: number; outliersExcluded: number };
}

export interface AvgPeriodLengthInsight {
  type: 'AVG_PERIOD_LENGTH';
  evidenceCount: number;
  data: { average: number; min: number; max: number };
}

export interface CycleVariabilityInsight {
  type: 'CYCLE_VARIABILITY';
  evidenceCount: number;
  data: { stddev: number; label: 'REGULAR' | 'SOMEWHAT_VARIABLE' | 'IRREGULAR' };
}

export interface TopSymptomsInsight {
  type: 'TOP_SYMPTOMS';
  evidenceCount: number;
  data: {
    byPhase: Record<CyclePhase, Array<{ symptom: string; count: number; frequency: number }>>;
    daysLogged: Record<CyclePhase, number>;
  };
}

export interface CycleComparisonInsight {
  type: 'CYCLE_COMPARISON';
  evidenceCount: number;
  data: {
    current: {
      daysElapsed: number;
      periodLengthSoFar: number | null;
      symptomCount: number;
      avgCycleScore: number | null;
    } | null;
    previous: {
      length: number;
      periodLength: number | null;
      symptomCount: number;
      avgCycleScore: number | null;
    };
  };
}

export interface CycleScoreTrendInsight {
  type: 'CYCLE_SCORE_TREND';
  evidenceCount: number;
  data: { current: number | null; previous: number | null };
}

export type Insight =
  | AvgCycleLengthInsight
  | AvgPeriodLengthInsight
  | CycleVariabilityInsight
  | TopSymptomsInsight
  | CycleComparisonInsight
  | CycleScoreTrendInsight;

export interface InsightsResult {
  eligible: boolean;
  cycleScoreToday: number | null;
  insights: Insight[];
  meta: {
    completeCyclesAnalyzed: number;
    dailyLogsAnalyzed: number;
  };
}

interface CompleteCycle {
  startDate: Date;
  endDate: Date;
  length: number;
  isOutlier: boolean;
}

const MIN_COMPLETE_CYCLES = 2;
const MIN_DAILY_LOGS_FOR_SYMPTOMS = 5;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values: number[]): number {
  const mean = average(values) ?? 0;
  const variance = average(values.map((v) => (v - mean) ** 2)) ?? 0;
  return Math.sqrt(variance);
}

function scoresFor(logs: DailyLogInput[]): number[] {
  return logs
    .map((l) =>
      computeDailyCycleScore({
        mood: l.mood,
        energy: l.energy,
        sleepQuality: l.sleepQuality,
        painLevel: l.painLevel,
        symptomCount: l.symptoms.length,
      }),
    )
    .filter((s): s is number => s !== null);
}

function symptomCountFor(logs: DailyLogInput[]): number {
  return logs.reduce((sum, l) => sum + l.symptoms.length, 0);
}

function logsInRange(dailyLogs: DailyLogInput[], start: Date, end: Date): DailyLogInput[] {
  return dailyLogs.filter(
    (l) => l.date.getTime() >= start.getTime() && l.date.getTime() <= end.getTime(),
  );
}

// Mirrors the private `nonOutlierLengths` in cycles/prediction.ts (line 53-56):
// exclude isOutlier-flagged cycles from length-based math, but fall back to the
// full unfiltered list if excluding outliers would leave nothing to work with.
function nonOutlierLengths(cycles: CompleteCycle[]): number[] {
  const nonOutlier = cycles.filter((c) => !c.isOutlier).map((c) => c.length);
  return nonOutlier.length > 0 ? nonOutlier : cycles.map((c) => c.length);
}

/**
 * Pure orchestrator — see
 * docs/superpowers/specs/2026-09-08-phase6-insights-cycle-score-design.md
 * §5-§6 for the full rationale behind each insight type and the two
 * independent minimum-data gates (cycleScoreToday's own 2-dimension
 * gate inside computeDailyCycleScore vs. the 2-complete-cycles /
 * 5-daily-logs gates below).
 */
export function deriveInsights(input: InsightsInput): InsightsResult {
  const { cycles, dailyLogs, periodEventDates } = input;

  const completeCycles: CompleteCycle[] = cycles
    .filter((c) => c.endDate !== null && c.length !== null)
    .map((c) => ({
      startDate: c.startDate,
      endDate: c.endDate!,
      length: c.length!,
      isOutlier: c.isOutlier,
    }));
  const openCycle = cycles.find((c) => c.endDate === null) ?? null;
  const episodes = groupIntoEpisodes(periodEventDates);

  const today = todayUtcDate();
  const todayLog = dailyLogs.find((l) => l.date.getTime() === today.getTime()) ?? null;
  const cycleScoreToday = todayLog
    ? computeDailyCycleScore({
        mood: todayLog.mood,
        energy: todayLog.energy,
        sleepQuality: todayLog.sleepQuality,
        painLevel: todayLog.painLevel,
        symptomCount: todayLog.symptoms.length,
      })
    : null;

  const insights: Insight[] = [];

  if (completeCycles.length >= MIN_COMPLETE_CYCLES) {
    const filteredLengths = nonOutlierLengths(completeCycles);
    insights.push({
      type: 'AVG_CYCLE_LENGTH',
      evidenceCount: completeCycles.length,
      data: {
        average: round1(average(filteredLengths)!),
        min: Math.min(...filteredLengths),
        max: Math.max(...filteredLengths),
        outliersExcluded: completeCycles.length - filteredLengths.length,
      },
    });

    const completeStartTimes = new Set(completeCycles.map((c) => c.startDate.getTime()));
    const periodLengths = episodes
      .filter((e) => completeStartTimes.has(e.start.getTime()))
      .map((e) => e.length);
    if (periodLengths.length > 0) {
      insights.push({
        type: 'AVG_PERIOD_LENGTH',
        evidenceCount: periodLengths.length,
        data: {
          average: round1(average(periodLengths)!),
          min: Math.min(...periodLengths),
          max: Math.max(...periodLengths),
        },
      });
    }

    const sd = stddev(filteredLengths);
    const label = sd <= 2 ? 'REGULAR' : sd <= 5 ? 'SOMEWHAT_VARIABLE' : 'IRREGULAR';
    insights.push({
      type: 'CYCLE_VARIABILITY',
      evidenceCount: completeCycles.length,
      data: { stddev: round1(sd), label },
    });

    const previousCycle = completeCycles[completeCycles.length - 1]!;
    const previousEpisode =
      episodes.find((e) => e.start.getTime() === previousCycle.startDate.getTime()) ?? null;
    const previousLogs = logsInRange(dailyLogs, previousCycle.startDate, previousCycle.endDate);
    const previousScoreAvg = average(scoresFor(previousLogs));
    const previousData = {
      length: previousCycle.length,
      periodLength: previousEpisode?.length ?? null,
      symptomCount: symptomCountFor(previousLogs),
      avgCycleScore: previousScoreAvg !== null ? Math.round(previousScoreAvg) : null,
    };

    let currentData: CycleComparisonInsight['data']['current'] = null;
    if (openCycle) {
      const currentEpisode =
        episodes.find((e) => e.start.getTime() === openCycle.startDate.getTime()) ?? null;
      const currentLogs = dailyLogs.filter(
        (l) => l.date.getTime() >= openCycle.startDate.getTime(),
      );
      const currentScoreAvg = average(scoresFor(currentLogs));
      currentData = {
        daysElapsed: daysBetween(openCycle.startDate, today) + 1,
        periodLengthSoFar: currentEpisode?.length ?? null,
        symptomCount: symptomCountFor(currentLogs),
        avgCycleScore: currentScoreAvg !== null ? Math.round(currentScoreAvg) : null,
      };
    }

    insights.push({
      type: 'CYCLE_COMPARISON',
      evidenceCount: completeCycles.length,
      data: { current: currentData, previous: previousData },
    });

    insights.push({
      type: 'CYCLE_SCORE_TREND',
      evidenceCount: completeCycles.length,
      data: { current: currentData?.avgCycleScore ?? null, previous: previousData.avgCycleScore },
    });
  }

  if (dailyLogs.length >= MIN_DAILY_LOGS_FOR_SYMPTOMS) {
    const counts: Record<CyclePhase, Map<string, number>> = {
      MENSTRUAL: new Map(),
      FOLLICULAR: new Map(),
      OVULATORY: new Map(),
      LUTEAL: new Map(),
    };
    const daysLogged: Record<CyclePhase, number> = {
      MENSTRUAL: 0,
      FOLLICULAR: 0,
      OVULATORY: 0,
      LUTEAL: 0,
    };
    const bleedingSet = new Set(periodEventDates.map((d) => d.getTime()));

    for (const c of completeCycles) {
      for (const l of logsInRange(dailyLogs, c.startDate, c.endDate)) {
        const phase = classifyPhase(l.date, c, bleedingSet);
        daysLogged[phase] += 1;
        for (const symptom of l.symptoms) {
          counts[phase].set(symptom, (counts[phase].get(symptom) ?? 0) + 1);
        }
      }
    }

    const byPhase: Record<
      CyclePhase,
      Array<{ symptom: string; count: number; frequency: number }>
    > = {
      MENSTRUAL: [],
      FOLLICULAR: [],
      OVULATORY: [],
      LUTEAL: [],
    };
    (Object.keys(counts) as CyclePhase[]).forEach((phase) => {
      if (daysLogged[phase] === 0) return;
      byPhase[phase] = [...counts[phase].entries()]
        .map(([symptom, count]) => ({
          symptom,
          count,
          frequency: round1(count / daysLogged[phase]),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
    });

    const classifiedLogCount = (Object.values(daysLogged) as number[]).reduce(
      (sum, n) => sum + n,
      0,
    );

    if (classifiedLogCount > 0) {
      insights.push({
        type: 'TOP_SYMPTOMS',
        evidenceCount: classifiedLogCount,
        data: { byPhase, daysLogged },
      });
    }
  }

  return {
    eligible: insights.length > 0,
    cycleScoreToday,
    insights,
    meta: {
      completeCyclesAnalyzed: completeCycles.length,
      dailyLogsAnalyzed: dailyLogs.length,
    },
  };
}
