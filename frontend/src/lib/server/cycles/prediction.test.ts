import { describe, it, expect } from 'vitest';
import { computePrediction, ALGORITHM_VERSION } from './prediction';
import type { ComputedCycle } from './build-cycles';
import type { Episode } from './episodes';

function d(iso: string): Date {
  return new Date(iso);
}

function completeCycle(startIso: string, length: number, isOutlier = false): ComputedCycle {
  const start = d(startIso);
  return {
    startDate: start,
    endDate: new Date(start.getTime() + (length - 1) * 86400000),
    length,
    isOutlier,
  };
}

function openCycle(startIso: string): ComputedCycle {
  return { startDate: d(startIso), endDate: null, length: null, isOutlier: false };
}

function episode(startIso: string, length = 5): Episode {
  const start = d(startIso);
  return { start, end: new Date(start.getTime() + (length - 1) * 86400000), length };
}

describe('computePrediction — 0 complete cycles', () => {
  it('returns null when no usualCycleLength is declared', () => {
    const cycles = [openCycle('2026-01-01')];
    const episodes = [episode('2026-01-01')];
    const result = computePrediction(cycles, episodes, {
      usualCycleLength: null,
      usualPeriodLength: null,
    });
    expect(result).toBeNull();
  });

  it('uses the declared usualCycleLength, confidence LOW', () => {
    const cycles = [openCycle('2026-01-01')];
    const episodes = [episode('2026-01-01', 5)];
    const result = computePrediction(cycles, episodes, {
      usualCycleLength: 30,
      usualPeriodLength: null,
    });
    expect(result?.confidence).toBe('LOW');
    expect(result?.algorithmVersion).toBe(ALGORITHM_VERSION);
    expect(result?.expectedPeriodStart.toISOString().slice(0, 10)).toBe('2026-01-31');
    // periodLength falls back to the median of observed episode lengths (5)
    expect(result?.expectedPeriodEnd.toISOString().slice(0, 10)).toBe('2026-02-04');
  });

  it('uses Profile.usualPeriodLength over the episode-length fallback when declared', () => {
    const cycles = [openCycle('2026-01-01')];
    const episodes = [episode('2026-01-01', 5)];
    const result = computePrediction(cycles, episodes, {
      usualCycleLength: 30,
      usualPeriodLength: 7,
    });
    expect(result?.expectedPeriodEnd.toISOString().slice(0, 10)).toBe('2026-02-06');
  });
});

describe('computePrediction — 1-2 complete cycles', () => {
  it('averages a single complete cycle, confidence LOW', () => {
    const cycles = [completeCycle('2026-01-01', 30), openCycle('2026-01-31')];
    const episodes = [episode('2026-01-01'), episode('2026-01-31')];
    const result = computePrediction(cycles, episodes, {
      usualCycleLength: null,
      usualPeriodLength: null,
    });
    expect(result?.confidence).toBe('LOW');
    expect(result?.expectedPeriodStart.toISOString().slice(0, 10)).toBe('2026-03-02');
  });

  it('averages two complete cycles regardless of their variance, confidence LOW', () => {
    const cycles = [
      completeCycle('2026-01-01', 28),
      completeCycle('2026-01-29', 32),
      openCycle('2026-03-01'),
    ];
    const episodes = [episode('2026-01-01'), episode('2026-01-29'), episode('2026-03-01')];
    const result = computePrediction(cycles, episodes, {
      usualCycleLength: null,
      usualPeriodLength: null,
    });
    expect(result?.confidence).toBe('LOW');
    // average(28, 32) = 30
    expect(result?.expectedPeriodStart.toISOString().slice(0, 10)).toBe('2026-03-31');
  });
});

describe('computePrediction — 3-5 complete cycles', () => {
  it('weighted average with low CV yields MEDIUM confidence', () => {
    const cycles = [
      completeCycle('2026-01-01', 28),
      completeCycle('2026-01-29', 28),
      completeCycle('2026-02-26', 30),
      openCycle('2026-03-28'),
    ];
    const episodes = cycles.map((c) => episode(c.startDate.toISOString().slice(0, 10)));
    const result = computePrediction(cycles, episodes, {
      usualCycleLength: null,
      usualPeriodLength: null,
    });
    expect(result?.confidence).toBe('MEDIUM');
    // weighted average of [28,28,30] with weights [1,2,3] = 174/6 = 29
    expect(result?.expectedPeriodStart.toISOString().slice(0, 10)).toBe('2026-04-26');
  });

  it('weighted average with high CV yields LOW confidence', () => {
    const cycles = [
      completeCycle('2026-01-01', 20),
      completeCycle('2026-01-21', 28),
      completeCycle('2026-02-18', 40),
      openCycle('2026-03-30'),
    ];
    const episodes = cycles.map((c) => episode(c.startDate.toISOString().slice(0, 10)));
    const result = computePrediction(cycles, episodes, {
      usualCycleLength: null,
      usualPeriodLength: null,
    });
    expect(result?.confidence).toBe('LOW');
  });
});

describe('computePrediction — 6+ complete cycles', () => {
  it('median with low CV and <=1 outlier in the window yields HIGH confidence', () => {
    const lengths = [28, 28, 29, 28, 27, 28];
    let cursor = d('2026-01-01');
    const cycles: ComputedCycle[] = [];
    for (const length of lengths) {
      cycles.push(completeCycle(cursor.toISOString().slice(0, 10), length));
      cursor = new Date(cursor.getTime() + length * 86400000);
    }
    cycles.push(openCycle(cursor.toISOString().slice(0, 10)));
    const episodes = cycles.map((c) => episode(c.startDate.toISOString().slice(0, 10)));

    const result = computePrediction(cycles, episodes, {
      usualCycleLength: null,
      usualPeriodLength: null,
    });
    expect(result?.confidence).toBe('HIGH');
  });

  it('median with CV >= 0.15 and 0 outliers yields MEDIUM confidence', () => {
    const lengths = [20, 28, 36, 22, 34, 28];
    let cursor = d('2026-01-01');
    const cycles: ComputedCycle[] = [];
    for (const length of lengths) {
      cycles.push(completeCycle(cursor.toISOString().slice(0, 10), length));
      cursor = new Date(cursor.getTime() + length * 86400000);
    }
    cycles.push(openCycle(cursor.toISOString().slice(0, 10)));
    const episodes = cycles.map((c) => episode(c.startDate.toISOString().slice(0, 10)));

    const result = computePrediction(cycles, episodes, {
      usualCycleLength: null,
      usualPeriodLength: null,
    });
    expect(result?.confidence).toBe('MEDIUM');
  });

  it('more than 1 outlier in the window forces MEDIUM even with 0 residual CV', () => {
    // isOutlier flags are set directly (this test exercises computePrediction's own
    // confidence logic in isolation from build-cycles' outlier detection).
    const cycles: ComputedCycle[] = [
      completeCycle('2026-01-01', 28),
      completeCycle('2026-01-29', 28),
      completeCycle('2026-02-26', 28),
      completeCycle('2026-03-26', 28),
      completeCycle('2026-04-23', 70, true),
      completeCycle('2026-07-02', 5, true),
      openCycle('2026-07-07'),
    ];
    const episodes = cycles.map((c) => episode(c.startDate.toISOString().slice(0, 10)));

    const result = computePrediction(cycles, episodes, {
      usualCycleLength: null,
      usualPeriodLength: null,
    });
    expect(result?.confidence).toBe('MEDIUM');
  });

  it('forces LOW when CV > 0.30 even though the base table would say MEDIUM', () => {
    const cycles: ComputedCycle[] = [
      completeCycle('2026-01-01', 15),
      completeCycle('2026-01-16', 45),
      completeCycle('2026-03-02', 15),
      completeCycle('2026-03-17', 45),
      completeCycle('2026-05-01', 15),
      completeCycle('2026-05-16', 45),
      openCycle('2026-06-30'),
    ];
    const episodes = cycles.map((c) => episode(c.startDate.toISOString().slice(0, 10)));

    const result = computePrediction(cycles, episodes, {
      usualCycleLength: null,
      usualPeriodLength: null,
    });
    expect(result?.confidence).toBe('LOW');
  });
});
