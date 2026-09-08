import { describe, it, expect, vi, afterEach } from 'vitest';
import { deriveInsights, type CycleInput, type DailyLogInput } from './compute-insights';

function cycle(overrides: Partial<CycleInput>): CycleInput {
  return { startDate: new Date('2026-01-01'), endDate: null, length: null, ...overrides };
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
      data: { average: 29, min: 28, max: 30 },
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
});
