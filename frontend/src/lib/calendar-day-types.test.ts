import { describe, it, expect } from 'vitest';
import { buildDayTypes } from './calendar-day-types';

describe('buildDayTypes', () => {
  it('marks the fertile window range and the ovulation estimate', () => {
    const dayTypes = buildDayTypes(
      [],
      {
        expectedPeriodStart: '2026-09-28',
        fertileWindowStart: '2026-09-12',
        fertileWindowEnd: '2026-09-18',
        ovulationEstimate: '2026-09-17',
      },
      '2026-09-05',
    );

    expect(dayTypes['2026-09-12']).toBe('fertile');
    expect(dayTypes['2026-09-13']).toBe('fertile');
    expect(dayTypes['2026-09-18']).toBe('fertile');
    expect(dayTypes['2026-09-17']).toBe('ovulation');
    expect(dayTypes['2026-09-28']).toBe('predicted');
  });

  it('lets observed data override the fertile window on the same day', () => {
    const dayTypes = buildDayTypes(
      [{ startDate: '2026-09-12', endDate: '2026-09-15' }],
      {
        expectedPeriodStart: '2026-09-28',
        fertileWindowStart: '2026-09-12',
        fertileWindowEnd: '2026-09-18',
        ovulationEstimate: '2026-09-17',
      },
      '2026-09-16',
    );

    expect(dayTypes['2026-09-12']).toBe('observed');
    expect(dayTypes['2026-09-16']).toBe('today');
    expect(dayTypes['2026-09-17']).toBe('ovulation');
  });

  it('omits fertile/ovulation markers when the prediction has none', () => {
    const dayTypes = buildDayTypes([], { expectedPeriodStart: '2026-09-28' }, '2026-09-05');

    expect(Object.values(dayTypes)).not.toContain('fertile');
    expect(Object.values(dayTypes)).not.toContain('ovulation');
  });

  it('returns an empty-ish map with just today when there is no prediction', () => {
    const dayTypes = buildDayTypes([], null, '2026-09-05');
    expect(dayTypes).toEqual({ '2026-09-05': 'today' });
  });
});
