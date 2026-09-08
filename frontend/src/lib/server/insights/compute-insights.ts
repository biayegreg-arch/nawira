import 'server-only';
import { computeDailyCycleScore } from './cycle-score';
import { classifyPhase, type CyclePhase } from './cycle-phase';
import { groupIntoEpisodes } from '../cycles/episodes';
import { daysBetween, todayUtcDate } from '../cycles/date-utils';

export interface CycleInput {
  startDate: Date;
  endDate: Date | null;
  length: number | null;
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

export interface Insight {
  type: InsightType;
  evidenceCount: number;
  data: Record<string, unknown>;
}

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
    .map((c) => ({ startDate: c.startDate, endDate: c.endDate!, length: c.length! }));
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
    const lengths = completeCycles.map((c) => c.length);
    insights.push({
      type: 'AVG_CYCLE_LENGTH',
      evidenceCount: completeCycles.length,
      data: {
        average: round1(average(lengths)!),
        min: Math.min(...lengths),
        max: Math.max(...lengths),
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

    const sd = stddev(lengths);
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
      periodLength: previousEpisode?.length ?? 0,
      symptomCount: symptomCountFor(previousLogs),
      avgCycleScore: previousScoreAvg !== null ? Math.round(previousScoreAvg) : null,
    };

    let currentData: {
      daysElapsed: number;
      periodLengthSoFar: number;
      symptomCount: number;
      avgCycleScore: number | null;
    };
    if (openCycle) {
      const currentEpisode =
        episodes.find((e) => e.start.getTime() === openCycle.startDate.getTime()) ?? null;
      const currentLogs = dailyLogs.filter(
        (l) => l.date.getTime() >= openCycle.startDate.getTime(),
      );
      const currentScoreAvg = average(scoresFor(currentLogs));
      currentData = {
        daysElapsed: daysBetween(openCycle.startDate, today) + 1,
        periodLengthSoFar: currentEpisode?.length ?? 0,
        symptomCount: symptomCountFor(currentLogs),
        avgCycleScore: currentScoreAvg !== null ? Math.round(currentScoreAvg) : null,
      };
    } else {
      currentData = { daysElapsed: 0, periodLengthSoFar: 0, symptomCount: 0, avgCycleScore: null };
    }

    insights.push({
      type: 'CYCLE_COMPARISON',
      evidenceCount: completeCycles.length,
      data: { current: currentData, previous: previousData },
    });

    insights.push({
      type: 'CYCLE_SCORE_TREND',
      evidenceCount: completeCycles.length,
      data: { current: currentData.avgCycleScore, previous: previousData.avgCycleScore },
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

    insights.push({
      type: 'TOP_SYMPTOMS',
      evidenceCount: dailyLogs.length,
      data: { byPhase },
    });
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
