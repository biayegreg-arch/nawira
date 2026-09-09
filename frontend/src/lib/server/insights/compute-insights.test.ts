import { describe, it, expect, vi, afterEach } from 'vitest';
import { deriveInsights, type CycleInput, type DailyLogInput } from './compute-insights';

function cycle(overrides: Partial<CycleInput>): CycleInput {
  return {
    startDate: new Date('2026-01-01'),
    endDate: null,
    length: null,
    isOutlier: false,
    ...overrides,
  };
}

function log(overrides: Partial<DailyLogInput>): DailyLogInput {
  return {
    date: new Date('2026-01-01'),
    mood: null,
    energy: null,
    sleepQuality: null,
    painLevel: null,
    symptoms: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('deriveInsights', () => {
  it('returns not eligible with all-zero meta when there is no data at all', () => {
    const result = deriveInsights({ cycles: [], dailyLogs: [], periodEventDates: [] });
    expect(result).toEqual({
      eligible: false,
      cycleScoreToday: null,
      insights: [],
      meta: { completeCyclesAnalyzed: 0, dailyLogsAnalyzed: 0 },
    });
  });

  it('stays not eligible with exactly 1 complete cycle, but still computes cycleScoreToday when today qualifies', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T12:00:00Z'));

    const result = deriveInsights({
      cycles: [
        cycle({ startDate: new Date('2026-01-01'), endDate: new Date('2026-01-28'), length: 28 }),
      ],
      dailyLogs: [log({ date: new Date('2026-02-01'), mood: 'GOOD', energy: 'HIGH' })],
      periodEventDates: [],
    });

    expect(result.eligible).toBe(false);
    expect(result.insights).toEqual([]);
    expect(result.cycleScoreToday).toBe(75); // mood GOOD=75, energy HIGH=75, average=75
    expect(result.meta).toEqual({ completeCyclesAnalyzed: 1, dailyLogsAnalyzed: 1 });
  });

  it('becomes eligible with exactly 2 complete cycles and computes all 5 cycle-dependent insight types', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));

    const periodEventDates = [
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
      '2026-01-05',
      '2026-01-29',
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ].map((d) => new Date(d));

    const result = deriveInsights({
      cycles: [
        cycle({ startDate: new Date('2026-01-01'), endDate: new Date('2026-01-28'), length: 28 }),
        cycle({ startDate: new Date('2026-01-29'), endDate: new Date('2026-02-27'), length: 30 }),
        cycle({ startDate: new Date('2026-02-28'), endDate: null, length: null }),
      ],
      dailyLogs: [],
      periodEventDates,
    });

    expect(result.eligible).toBe(true);
    expect(result.cycleScoreToday).toBeNull();
    expect(result.meta).toEqual({ completeCyclesAnalyzed: 2, dailyLogsAnalyzed: 0 });

    const byType = new Map(result.insights.map((i) => [i.type, i]));
    expect(byType.size).toBe(5); // TOP_SYMPTOMS excluded: 0 dailyLogs < 5

    expect(byType.get('AVG_CYCLE_LENGTH')).toMatchObject({
      evidenceCount: 2,
      data: { average: 29, min: 28, max: 30, outliersExcluded: 0 },
    });
    expect(byType.get('AVG_PERIOD_LENGTH')).toMatchObject({
      evidenceCount: 2,
      data: { average: 4.5, min: 4, max: 5 },
    });
    expect(byType.get('CYCLE_VARIABILITY')).toMatchObject({
      evidenceCount: 2,
      data: { stddev: 1, label: 'REGULAR' },
    });
    expect(byType.get('CYCLE_COMPARISON')).toMatchObject({
      evidenceCount: 2,
      data: {
        current: { daysElapsed: 11, periodLengthSoFar: 3, symptomCount: 0, avgCycleScore: null },
        previous: { length: 30, periodLength: 4, symptomCount: 0, avgCycleScore: null },
      },
    });
    // Never 0 for a cycle with no scoreable days -- null, distinguishable from a real low score.
    expect(byType.get('CYCLE_SCORE_TREND')).toMatchObject({
      evidenceCount: 2,
      data: { current: null, previous: null },
    });
  });

  it('includes TOP_SYMPTOMS with real per-phase data once >=5 daily logs exist, even with only 1 complete cycle', () => {
    // Same 28-day cycle as cycle-phase.test.ts: ovulationDay = 2026-01-15.
    const completeCycle = cycle({
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-28'),
      length: 28,
    });
    const periodEventDates = [
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
      '2026-01-05',
    ].map((d) => new Date(d));
    const dailyLogs = [
      log({ date: new Date('2026-01-02'), symptoms: ['CRAMPS'] }), // MENSTRUAL
      log({ date: new Date('2026-01-03'), symptoms: ['CRAMPS'] }), // MENSTRUAL
      log({ date: new Date('2026-01-15'), symptoms: ['ACNE'] }), // OVULATORY
      log({ date: new Date('2026-01-20'), symptoms: ['FATIGUE'] }), // LUTEAL
      log({ date: new Date('2026-01-21'), symptoms: ['FATIGUE'] }), // LUTEAL
    ];

    const result = deriveInsights({ cycles: [completeCycle], dailyLogs, periodEventDates });

    expect(result.eligible).toBe(true);
    expect(result.insights).toHaveLength(1); // only TOP_SYMPTOMS -- 1 complete cycle < 2
    const topSymptoms = result.insights[0]!;
    expect(topSymptoms.type).toBe('TOP_SYMPTOMS');
    expect(topSymptoms.evidenceCount).toBe(5);
    expect(topSymptoms.data).toEqual({
      byPhase: {
        MENSTRUAL: [{ symptom: 'CRAMPS', count: 2, frequency: 1 }],
        FOLLICULAR: [],
        OVULATORY: [{ symptom: 'ACNE', count: 1, frequency: 1 }],
        LUTEAL: [{ symptom: 'FATIGUE', count: 2, frequency: 1 }],
      },
      daysLogged: { MENSTRUAL: 2, FOLLICULAR: 0, OVULATORY: 1, LUTEAL: 2 },
    });
  });

  it('excludes TOP_SYMPTOMS below the 5-daily-log threshold', () => {
    const completeCycle = cycle({
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-28'),
      length: 28,
    });
    const dailyLogs = [
      log({ date: new Date('2026-01-02'), symptoms: ['CRAMPS'] }),
      log({ date: new Date('2026-01-03'), symptoms: ['CRAMPS'] }),
      log({ date: new Date('2026-01-15'), symptoms: ['ACNE'] }),
      log({ date: new Date('2026-01-20'), symptoms: ['FATIGUE'] }),
    ]; // only 4

    const result = deriveInsights({ cycles: [completeCycle], dailyLogs, periodEventDates: [] });

    expect(result.eligible).toBe(false);
    expect(result.insights).toEqual([]);
  });

  it('includes MOOD_DISTRIBUTION with fixed display order and correct percentages once >=5 daily logs have a mood set', () => {
    const dailyLogs = [
      log({ date: new Date('2026-01-01'), mood: 'GOOD' }),
      log({ date: new Date('2026-01-02'), mood: 'GOOD' }),
      log({ date: new Date('2026-01-03'), mood: 'VERY_GOOD' }),
      log({ date: new Date('2026-01-04'), mood: 'TIRED' }),
      log({ date: new Date('2026-01-05'), mood: 'GOOD' }),
      log({ date: new Date('2026-01-06'), mood: null }), // no mood logged that day
    ];

    const result = deriveInsights({ cycles: [], dailyLogs, periodEventDates: [] });

    const moodDistribution = result.insights.find((i) => i.type === 'MOOD_DISTRIBUTION')!;
    expect(moodDistribution.evidenceCount).toBe(5); // 5 logs had a mood set, not 6
    expect(moodDistribution.data).toEqual({
      distribution: [
        { mood: 'VERY_GOOD', count: 1, percentage: 20 },
        { mood: 'GOOD', count: 3, percentage: 60 },
        { mood: 'TIRED', count: 1, percentage: 20 },
        { mood: 'STRESSED', count: 0, percentage: 0 },
        { mood: 'LOW', count: 0, percentage: 0 },
      ],
    });
  });

  it('excludes MOOD_DISTRIBUTION when fewer than 5 daily logs have a mood set', () => {
    const dailyLogs = [
      log({ date: new Date('2026-01-01'), mood: 'GOOD' }),
      log({ date: new Date('2026-01-02'), mood: 'GOOD' }),
      log({ date: new Date('2026-01-03'), mood: null }),
      log({ date: new Date('2026-01-04'), mood: null }),
      log({ date: new Date('2026-01-05'), mood: null }),
    ]; // only 2 with a real mood value

    const result = deriveInsights({ cycles: [], dailyLogs, periodEventDates: [] });

    expect(result.insights.some((i) => i.type === 'MOOD_DISTRIBUTION')).toBe(false);
  });

  it('labels CYCLE_VARIABILITY at the REGULAR/SOMEWHAT_VARIABLE/IRREGULAR stddev boundaries', () => {
    const cases: Array<{ lengths: [number, number]; label: string; stddev: number }> = [
      { lengths: [26, 30], label: 'REGULAR', stddev: 2 }, // boundary: sd <= 2
      { lengths: [23, 33], label: 'SOMEWHAT_VARIABLE', stddev: 5 }, // boundary: sd <= 5
      { lengths: [20, 36], label: 'IRREGULAR', stddev: 8 },
    ];

    for (const { lengths, label, stddev } of cases) {
      const result = deriveInsights({
        cycles: [
          cycle({
            startDate: new Date('2026-01-01'),
            endDate: new Date('2026-01-01'),
            length: lengths[0],
          }),
          cycle({
            startDate: new Date('2026-02-01'),
            endDate: new Date('2026-02-01'),
            length: lengths[1],
          }),
        ],
        dailyLogs: [],
        periodEventDates: [],
      });
      const variability = result.insights.find((i) => i.type === 'CYCLE_VARIABILITY')!;
      expect(variability.data).toEqual({ stddev, label });
    }
  });

  it('stays not eligible (no empty-payload TOP_SYMPTOMS) with 5+ daily logs but 0 complete cycles', () => {
    const dailyLogs = [
      log({ date: new Date('2026-01-01'), symptoms: ['CRAMPS'] }),
      log({ date: new Date('2026-01-02'), symptoms: ['CRAMPS'] }),
      log({ date: new Date('2026-01-03'), symptoms: ['ACNE'] }),
      log({ date: new Date('2026-01-04'), symptoms: ['FATIGUE'] }),
      log({ date: new Date('2026-01-05'), symptoms: ['FATIGUE'] }),
    ];

    const result = deriveInsights({ cycles: [], dailyLogs, periodEventDates: [] });

    expect(result.eligible).toBe(false);
    expect(result.insights).toEqual([]);
    expect(result.meta).toEqual({ completeCyclesAnalyzed: 0, dailyLogsAnalyzed: 5 });
  });

  it('sets CYCLE_COMPARISON.current to null (not fabricated zeros) when there is no open cycle, and periodLength to null when there is no matching episode', () => {
    const result = deriveInsights({
      cycles: [
        cycle({ startDate: new Date('2026-01-01'), endDate: new Date('2026-01-28'), length: 28 }),
        cycle({ startDate: new Date('2026-01-29'), endDate: new Date('2026-02-27'), length: 30 }),
      ],
      dailyLogs: [],
      periodEventDates: [], // no period events -> previousEpisode is null -> periodLength: null
    });

    expect(result.eligible).toBe(true);

    const comparison = result.insights.find((i) => i.type === 'CYCLE_COMPARISON')!;
    expect(comparison.data).toEqual({
      current: null,
      previous: { length: 30, periodLength: null, symptomCount: 0, avgCycleScore: null },
    });

    // CYCLE_SCORE_TREND behavior is unchanged: still null-not-zero when there's no open cycle.
    const trend = result.insights.find((i) => i.type === 'CYCLE_SCORE_TREND')!;
    expect(trend.data).toEqual({ current: null, previous: null });
  });

  it('excludes isOutlier-flagged cycles from AVG_CYCLE_LENGTH/CYCLE_VARIABILITY and reports outliersExcluded', () => {
    const result = deriveInsights({
      cycles: [
        cycle({ startDate: new Date('2026-01-01'), endDate: new Date('2026-01-28'), length: 28 }),
        cycle({
          startDate: new Date('2026-01-29'),
          endDate: new Date('2026-04-01'),
          length: 62,
          isOutlier: true,
        }),
        cycle({ startDate: new Date('2026-04-02'), endDate: new Date('2026-04-30'), length: 29 }),
      ],
      dailyLogs: [],
      periodEventDates: [],
    });

    const avgLen = result.insights.find((i) => i.type === 'AVG_CYCLE_LENGTH')!;
    expect(avgLen.evidenceCount).toBe(3); // raw complete-cycle count, unaffected by filtering
    expect(avgLen.data).toEqual({ average: 28.5, min: 28, max: 29, outliersExcluded: 1 });

    const variability = result.insights.find((i) => i.type === 'CYCLE_VARIABILITY')!;
    expect(variability.evidenceCount).toBe(3);
    expect(variability.data).toEqual({ stddev: 0.5, label: 'REGULAR' });
  });

  it('falls back to using all complete cycles when every one is flagged isOutlier', () => {
    const result = deriveInsights({
      cycles: [
        cycle({
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-01-28'),
          length: 28,
          isOutlier: true,
        }),
        cycle({
          startDate: new Date('2026-01-29'),
          endDate: new Date('2026-02-27'),
          length: 30,
          isOutlier: true,
        }),
      ],
      dailyLogs: [],
      periodEventDates: [],
    });

    const avgLen = result.insights.find((i) => i.type === 'AVG_CYCLE_LENGTH')!;
    expect(avgLen.data).toEqual({ average: 29, min: 28, max: 30, outliersExcluded: 0 });
  });
});
