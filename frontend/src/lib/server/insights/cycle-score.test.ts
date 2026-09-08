import { describe, it, expect } from 'vitest';
import { computeDailyCycleScore, type DailyLogForScore } from './cycle-score';

function log(overrides: Partial<DailyLogForScore>): DailyLogForScore {
  return {
    mood: null,
    energy: null,
    sleepQuality: null,
    painLevel: null,
    symptomCount: 0,
    ...overrides,
  };
}

describe('computeDailyCycleScore', () => {
  it('averages all 4 dimensions when all are present', () => {
    // mood GOOD=75, energy HIGH=75, sleep GOOD=67, pain(2)+symptoms(1) burden=30 -> dim=70
    // average = (75+75+67+70)/4 = 71.75 -> rounds to 72
    const score = computeDailyCycleScore(
      log({ mood: 'GOOD', energy: 'HIGH', sleepQuality: 'GOOD', painLevel: 2, symptomCount: 1 }),
    );
    expect(score).toBe(72);
  });

  it('returns a score with exactly 2 dimensions present (the minimum)', () => {
    // mood VERY_GOOD=100, energy LOW=25 -> average = 62.5 -> rounds to 63
    const score = computeDailyCycleScore(log({ mood: 'VERY_GOOD', energy: 'LOW' }));
    expect(score).toBe(63);
  });

  it('returns null with only 1 dimension present', () => {
    expect(computeDailyCycleScore(log({ mood: 'GOOD' }))).toBeNull();
  });

  it('returns null with 0 dimensions present', () => {
    expect(computeDailyCycleScore(log({}))).toBeNull();
  });

  it('counts a symptom-only day (no painLevel, symptomCount > 0) as a present dimension', () => {
    // mood GOOD=75, symptoms(2, no painLevel) burden=20 -> dim=80
    // average = (75+80)/2 = 77.5 -> rounds to 78
    const score = computeDailyCycleScore(log({ mood: 'GOOD', symptomCount: 2 }));
    expect(score).toBe(78);
  });

  it('caps the symptom/pain burden at 100 instead of going negative', () => {
    // energy VERY_HIGH=100, pain(10)+symptoms(12) raw burden=220 -> capped 100 -> dim=0
    // average = (100+0)/2 = 50 (uncapped would give a nonsensical negative dimension)
    const score = computeDailyCycleScore(
      log({ energy: 'VERY_HIGH', painLevel: 10, symptomCount: 12 }),
    );
    expect(score).toBe(50);
  });
});
