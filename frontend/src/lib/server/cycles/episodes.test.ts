import { describe, it, expect } from 'vitest';
import { groupIntoEpisodes } from './episodes';

function d(iso: string): Date {
  return new Date(iso);
}

describe('groupIntoEpisodes', () => {
  it('returns an empty array for no dates', () => {
    expect(groupIntoEpisodes([])).toEqual([]);
  });

  it('groups a single date into one one-day episode', () => {
    const result = groupIntoEpisodes([d('2026-01-01')]);
    expect(result).toEqual([{ start: d('2026-01-01'), end: d('2026-01-01'), length: 1 }]);
  });

  it('groups consecutive dates into a single episode', () => {
    const result = groupIntoEpisodes([d('2026-01-01'), d('2026-01-02'), d('2026-01-03')]);
    expect(result).toEqual([{ start: d('2026-01-01'), end: d('2026-01-03'), length: 3 }]);
  });

  it('starts a new episode after a gap of more than 1 day', () => {
    const result = groupIntoEpisodes([
      d('2026-01-01'),
      d('2026-01-02'),
      d('2026-01-30'),
      d('2026-01-31'),
    ]);
    expect(result).toEqual([
      { start: d('2026-01-01'), end: d('2026-01-02'), length: 2 },
      { start: d('2026-01-30'), end: d('2026-01-31'), length: 2 },
    ]);
  });

  it('handles a consecutive run spanning a month boundary as one episode', () => {
    const result = groupIntoEpisodes([d('2026-01-31'), d('2026-02-01'), d('2026-02-02')]);
    expect(result).toEqual([{ start: d('2026-01-31'), end: d('2026-02-02'), length: 3 }]);
  });

  it('produces one episode per isolated single-day entry', () => {
    const result = groupIntoEpisodes([d('2026-01-01'), d('2026-01-10'), d('2026-01-20')]);
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.length)).toEqual([1, 1, 1]);
  });
});
