import { describe, it, expect } from 'vitest';
import {
  checkPeriodReminder,
  checkJournalReminder,
  checkWeeklySummary,
  checkFertilityReminder,
  type ProfileRow,
  type PredictionRow,
} from './triggers';

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    userId: 'user_1',
    notificationLevel: 'NORMAL',
    goal: 'PERIOD_TRACKING',
    ...overrides,
  };
}

const MONDAY = new Date('2026-09-14'); // confirmed UTC Monday
const TUESDAY = new Date('2026-09-15');

describe('checkPeriodReminder (N01)', () => {
  it('fires exactly on expectedPeriodStart - 3 days', () => {
    const prediction: PredictionRow = {
      userId: 'user_1',
      expectedPeriodStart: new Date('2026-09-21'),
      fertileWindowStart: null,
    };
    const result = checkPeriodReminder(profile(), prediction, new Date('2026-09-18'));
    expect(result?.dedupeKey).toBe('period-reminder:user_1:2026-09-21');
  });

  it('does not fire on J-2 or J-4', () => {
    const prediction: PredictionRow = {
      userId: 'user_1',
      expectedPeriodStart: new Date('2026-09-21'),
      fertileWindowStart: null,
    };
    expect(checkPeriodReminder(profile(), prediction, new Date('2026-09-19'))).toBeNull();
    expect(checkPeriodReminder(profile(), prediction, new Date('2026-09-17'))).toBeNull();
  });

  it('returns null when there is no prediction', () => {
    expect(checkPeriodReminder(profile(), undefined, new Date('2026-09-18'))).toBeNull();
  });

  it('returns null when notificationLevel is NONE', () => {
    const prediction: PredictionRow = {
      userId: 'user_1',
      expectedPeriodStart: new Date('2026-09-21'),
      fertileWindowStart: null,
    };
    const result = checkPeriodReminder(
      profile({ notificationLevel: 'NONE' }),
      prediction,
      new Date('2026-09-18'),
    );
    expect(result).toBeNull();
  });

  it('uses DISCREET copy when notificationLevel is DISCREET', () => {
    const prediction: PredictionRow = {
      userId: 'user_1',
      expectedPeriodStart: new Date('2026-09-21'),
      fertileWindowStart: null,
    };
    const result = checkPeriodReminder(
      profile({ notificationLevel: 'DISCREET' }),
      prediction,
      new Date('2026-09-18'),
    );
    expect(result?.title).toBe('NAWIRA');
  });
});

describe('checkJournalReminder (N02)', () => {
  it('fires when there is no DailyLog for today', () => {
    const result = checkJournalReminder(profile(), false, MONDAY);
    expect(result?.dedupeKey).toBe('journal-reminder:user_1:2026-09-14');
  });

  it('returns null when today is already logged', () => {
    expect(checkJournalReminder(profile(), true, MONDAY)).toBeNull();
  });

  it('returns null when notificationLevel is NONE', () => {
    expect(checkJournalReminder(profile({ notificationLevel: 'NONE' }), false, MONDAY)).toBeNull();
  });
});

describe('checkWeeklySummary (N03)', () => {
  it('fires on Monday when eligible', () => {
    const result = checkWeeklySummary(profile(), true, MONDAY);
    expect(result?.dedupeKey).toBe('weekly-summary:user_1:2026-09-14');
  });

  it('returns null on a non-Monday even when eligible', () => {
    expect(checkWeeklySummary(profile(), true, TUESDAY)).toBeNull();
  });

  it('returns null on Monday when not eligible', () => {
    expect(checkWeeklySummary(profile(), false, MONDAY)).toBeNull();
  });

  it('returns null when notificationLevel is NONE', () => {
    expect(checkWeeklySummary(profile({ notificationLevel: 'NONE' }), true, MONDAY)).toBeNull();
  });
});

describe('checkFertilityReminder (N04)', () => {
  it('fires for TRYING_TO_CONCEIVE on fertileWindowStart', () => {
    const prediction: PredictionRow = {
      userId: 'user_1',
      expectedPeriodStart: new Date('2026-09-21'),
      fertileWindowStart: new Date('2026-09-02'),
    };
    const result = checkFertilityReminder(
      profile({ goal: 'TRYING_TO_CONCEIVE' }),
      prediction,
      new Date('2026-09-02'),
    );
    expect(result?.dedupeKey).toBe('fertility-reminder:user_1:2026-09-02');
  });

  it('returns null for other goals even on fertileWindowStart', () => {
    const prediction: PredictionRow = {
      userId: 'user_1',
      expectedPeriodStart: new Date('2026-09-21'),
      fertileWindowStart: new Date('2026-09-02'),
    };
    const result = checkFertilityReminder(
      profile({ goal: 'PERIOD_TRACKING' }),
      prediction,
      new Date('2026-09-02'),
    );
    expect(result).toBeNull();
  });

  it('returns null when fertileWindowStart is null', () => {
    const prediction: PredictionRow = {
      userId: 'user_1',
      expectedPeriodStart: new Date('2026-09-21'),
      fertileWindowStart: null,
    };
    const result = checkFertilityReminder(
      profile({ goal: 'TRYING_TO_CONCEIVE' }),
      prediction,
      new Date('2026-09-02'),
    );
    expect(result).toBeNull();
  });

  it('returns null when today is not fertileWindowStart', () => {
    const prediction: PredictionRow = {
      userId: 'user_1',
      expectedPeriodStart: new Date('2026-09-21'),
      fertileWindowStart: new Date('2026-09-02'),
    };
    const result = checkFertilityReminder(
      profile({ goal: 'TRYING_TO_CONCEIVE' }),
      prediction,
      new Date('2026-09-03'),
    );
    expect(result).toBeNull();
  });
});
