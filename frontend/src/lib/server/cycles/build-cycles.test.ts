import { describe, it, expect } from 'vitest';
import { buildCycles } from './build-cycles';
import type { Episode } from './episodes';

function d(iso: string): Date {
  return new Date(iso);
}

function episode(startIso: string): Episode {
  const start = d(startIso);
  return { start, end: start, length: 1 };
}

describe('buildCycles', () => {
  it('returns an empty array for no episodes', () => {
    expect(buildCycles([])).toEqual([]);
  });

  it('returns a single open cycle for one episode', () => {
    const result = buildCycles([episode('2026-01-01')]);
    expect(result).toEqual([
      { startDate: d('2026-01-01'), endDate: null, length: null, isOutlier: false },
    ]);
  });

  it('builds one complete cycle plus one open cycle for two episodes', () => {
    const result = buildCycles([episode('2026-01-01'), episode('2026-01-29')]);
    expect(result).toEqual([
      { startDate: d('2026-01-01'), endDate: d('2026-01-28'), length: 28, isOutlier: false },
      { startDate: d('2026-01-29'), endDate: null, length: null, isOutlier: false },
    ]);
  });

  it('does not run outlier detection with fewer than 3 complete cycles', () => {
    // 3 episodes -> 2 complete cycles with wildly different lengths (10, 90)
    const result = buildCycles([
      episode('2026-01-01'),
      episode('2026-01-11'),
      episode('2026-04-11'),
    ]);
    expect(result[0]?.isOutlier).toBe(false);
    expect(result[1]?.isOutlier).toBe(false);
  });

  it('flags a cycle whose length deviates from the median of the others beyond max(7, 30%)', () => {
    // Episode starts 28 days apart, except one 60-day gap -> complete lengths [28, 28, 60, 28]
    const episodes: Episode[] = [
      episode('2026-01-01'),
      episode('2026-01-29'), // +28
      episode('2026-02-26'), // +28
      episode('2026-04-27'), // +60
      episode('2026-05-25'), // +28 (this episode becomes the open cycle)
    ];

    const result = buildCycles(episodes);

    expect(result).toEqual([
      { startDate: d('2026-01-01'), endDate: d('2026-01-28'), length: 28, isOutlier: false },
      { startDate: d('2026-01-29'), endDate: d('2026-02-25'), length: 28, isOutlier: false },
      { startDate: d('2026-02-26'), endDate: d('2026-04-26'), length: 60, isOutlier: true },
      { startDate: d('2026-04-27'), endDate: d('2026-05-24'), length: 28, isOutlier: false },
      { startDate: d('2026-05-25'), endDate: null, length: null, isOutlier: false },
    ]);
  });
});
