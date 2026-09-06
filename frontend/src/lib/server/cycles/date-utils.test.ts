import { describe, it, expect } from 'vitest';
import { daysBetween, addDays, todayUtcDate } from './date-utils';

describe('daysBetween', () => {
  it('returns the number of days between two UTC dates', () => {
    expect(daysBetween(new Date('2026-01-01'), new Date('2026-01-05'))).toBe(4);
  });

  it('returns a negative number when b is before a', () => {
    expect(daysBetween(new Date('2026-01-05'), new Date('2026-01-01'))).toBe(-4);
  });

  it('returns 0 for the same date', () => {
    expect(daysBetween(new Date('2026-01-01'), new Date('2026-01-01'))).toBe(0);
  });
});

describe('addDays', () => {
  it('adds days within the same month', () => {
    expect(addDays(new Date('2026-01-01'), 5).toISOString().slice(0, 10)).toBe('2026-01-06');
  });

  it('rolls over into the next month', () => {
    expect(addDays(new Date('2026-01-31'), 1).toISOString().slice(0, 10)).toBe('2026-02-01');
  });

  it('supports negative offsets', () => {
    expect(addDays(new Date('2026-02-01'), -1).toISOString().slice(0, 10)).toBe('2026-01-31');
  });
});

describe('todayUtcDate', () => {
  it('returns a Date at UTC midnight matching the current UTC date', () => {
    const result = todayUtcDate();
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
    expect(result.getUTCMilliseconds()).toBe(0);
    expect(result.toISOString().slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
  });
});
