import { describe, it, expect } from 'vitest';
import { computeFertilityWindow } from './fertility-window';
import type { PredictionResult } from './prediction';

function prediction(expectedPeriodStartIso: string): PredictionResult {
  return {
    confidence: 'MEDIUM',
    expectedPeriodStart: new Date(expectedPeriodStartIso),
    expectedPeriodEnd: new Date(expectedPeriodStartIso),
    algorithmVersion: 'v1',
  };
}

describe('computeFertilityWindow', () => {
  it('returns null when prediction is null', () => {
    expect(computeFertilityWindow(null)).toBeNull();
  });

  it('derives ovulation 14 days before the predicted period start, and a 5-before/1-after window', () => {
    const result = computeFertilityWindow(prediction('2026-03-31'));
    expect(result?.ovulationEstimate.toISOString().slice(0, 10)).toBe('2026-03-17');
    expect(result?.fertileWindowStart.toISOString().slice(0, 10)).toBe('2026-03-12');
    expect(result?.fertileWindowEnd.toISOString().slice(0, 10)).toBe('2026-03-18');
  });

  it('a later expectedPeriodStart shifts ovulation later by the same amount, not to a fixed calendar day', () => {
    const shortCycle = computeFertilityWindow(prediction('2026-01-27'));
    const longCycle = computeFertilityWindow(prediction('2026-02-02'));
    expect(shortCycle?.ovulationEstimate.toISOString().slice(0, 10)).toBe('2026-01-13');
    expect(longCycle?.ovulationEstimate.toISOString().slice(0, 10)).toBe('2026-01-19');
    expect(shortCycle?.ovulationEstimate.getTime()).not.toBe(
      longCycle?.ovulationEstimate.getTime(),
    );
  });
});
