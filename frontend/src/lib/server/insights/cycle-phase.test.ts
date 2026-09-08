import { describe, it, expect } from 'vitest';
import { classifyPhase, type CompleteCycleForPhase } from './cycle-phase';

// 28-day complete cycle: startDate 2026-01-01, endDate 2026-01-28.
// ovulationDay = endDate + 1 - 14 = 2026-01-15.
const cycle: CompleteCycleForPhase = {
  startDate: new Date('2026-01-01'),
  endDate: new Date('2026-01-28'),
};
const bleedingDates = new Set(
  ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'].map((d) =>
    new Date(d).getTime(),
  ),
);

describe('classifyPhase', () => {
  it('classifies a date matching a PeriodEvent as MENSTRUAL', () => {
    expect(classifyPhase(new Date('2026-01-03'), cycle, bleedingDates)).toBe('MENSTRUAL');
  });

  it('classifies the computed ovulation day itself as OVULATORY', () => {
    expect(classifyPhase(new Date('2026-01-15'), cycle, bleedingDates)).toBe('OVULATORY');
  });

  it('classifies a date just before the ovulatory window as FOLLICULAR', () => {
    expect(classifyPhase(new Date('2026-01-13'), cycle, bleedingDates)).toBe('FOLLICULAR');
  });

  it('classifies a date just after the ovulatory window as LUTEAL', () => {
    expect(classifyPhase(new Date('2026-01-17'), cycle, bleedingDates)).toBe('LUTEAL');
  });

  it('classifies both boundary days at exactly the ovulatory window edge as OVULATORY', () => {
    expect(classifyPhase(new Date('2026-01-14'), cycle, bleedingDates)).toBe('OVULATORY');
    expect(classifyPhase(new Date('2026-01-16'), cycle, bleedingDates)).toBe('OVULATORY');
  });
});
