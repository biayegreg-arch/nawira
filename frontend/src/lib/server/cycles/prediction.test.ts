import { describe, it, expect } from 'vitest';
import { computePrediction, ALGORITHM_VERSION } from './prediction';
import { buildCycles, type ComputedCycle } from './build-cycles';
import { groupIntoEpisodes, type Episode } from './episodes';

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

// `length` is intentionally REQUIRED: a default here would hide the fact that
// real in-progress episodes are short (often 1 day), which is exactly what the
// period-length median must not be derived from.
function episode(startIso: string, length: number): Episode {
  const start = d(startIso);
  return { start, end: new Date(start.getTime() + (length - 1) * 86400000), length };
}

describe('computePrediction — 0 complete cycles', () => {
  it('returns null when no usualCycleLength is declared', () => {
    const cycles = [openCycle('2026-01-01')];
    const episodes = [episode('2026-01-01', 5)];
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
    // The single episode is the in-progress one, so there is no settled episode
    // to median: periodLength falls back to DEFAULT_PERIOD_LENGTH_DAYS (5).
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
    const episodes = [episode('2026-01-01', 5), episode('2026-01-31', 5)];
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
    const episodes = [episode('2026-01-01', 5), episode('2026-01-29', 5), episode('2026-03-01', 5)];
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
    const episodes = cycles.map((c) => episode(c.startDate.toISOString().slice(0, 10), 5));
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
    const episodes = cycles.map((c) => episode(c.startDate.toISOString().slice(0, 10), 5));
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
    const episodes = cycles.map((c) => episode(c.startDate.toISOString().slice(0, 10), 5));

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
    const episodes = cycles.map((c) => episode(c.startDate.toISOString().slice(0, 10), 5));

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
    const episodes = cycles.map((c) => episode(c.startDate.toISOString().slice(0, 10), 5));

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
    const episodes = cycles.map((c) => episode(c.startDate.toISOString().slice(0, 10), 5));

    const result = computePrediction(cycles, episodes, {
      usualCycleLength: null,
      usualPeriodLength: null,
    });
    expect(result?.confidence).toBe('LOW');
  });
});

describe('computePrediction — composed pipeline (regression for the in-progress-episode bug)', () => {
  it('produces a sensible period window on the very first logged day', () => {
    const episodes = groupIntoEpisodes([d('2026-09-06')]);
    const cycles = buildCycles(episodes);

    const result = computePrediction(cycles, episodes, {
      usualCycleLength: 30,
      usualPeriodLength: null,
    });

    expect(result?.expectedPeriodStart.toISOString().slice(0, 10)).toBe('2026-10-06');
    // 5-day DEFAULT, NOT the 1-day length of the in-progress episode.
    expect(result?.expectedPeriodEnd.toISOString().slice(0, 10)).toBe('2026-10-10');
  });

  it('excludes only the in-progress episode from the period-length median, not settled ones', () => {
    const episodes = groupIntoEpisodes([
      // 3-day settled episode
      d('2026-01-01'),
      d('2026-01-02'),
      d('2026-01-03'),
      // 7-day settled episode
      d('2026-02-01'),
      d('2026-02-02'),
      d('2026-02-03'),
      d('2026-02-04'),
      d('2026-02-05'),
      d('2026-02-06'),
      d('2026-02-07'),
      // 1-day in-progress episode
      d('2026-03-01'),
    ]);
    const cycles = buildCycles(episodes);
    expect(episodes.map((e) => e.length)).toEqual([3, 7, 1]);

    const result = computePrediction(cycles, episodes, {
      usualCycleLength: null,
      usualPeriodLength: null,
    });

    // settled episode lengths = [3, 7] -> median 5. Including the in-progress
    // 1-day episode would give median([3, 7, 1]) = 3 instead.
    const days =
      Math.round(
        (result!.expectedPeriodEnd.getTime() - result!.expectedPeriodStart.getTime()) / 86400000,
      ) + 1;
    expect(days).toBe(5);
    // cycle lengths [31, 28] -> average 29.5 -> round 30 days after 2026-03-01
    expect(result?.expectedPeriodStart.toISOString().slice(0, 10)).toBe('2026-03-31');
    expect(result?.expectedPeriodEnd.toISOString().slice(0, 10)).toBe('2026-04-04');
  });
});
