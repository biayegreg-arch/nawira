/**
 * Phase 8 (E9, PRD §11 N01-N04) — pure trigger-condition functions.
 *
 * No Prisma calls anywhere in this file. Each function takes plain,
 * already-fetched data + `today` and returns a `CreateNotificationInput`
 * ready for `createNotification`, or `null` if the trigger doesn't fire.
 * All I/O (fetching rows, calling createNotification) lives in the cron
 * route that calls these — see `frontend/src/app/api/cron/
 * notification-triggers/route.ts`.
 */
import { addDays } from '../cycles/date-utils';
import type { CreateNotificationInput } from './index';
import {
  periodReminder,
  journalReminder,
  weeklySummaryReady,
  fertilityWindowApproaching,
} from './templates';

export interface ProfileRow {
  userId: string;
  notificationLevel: string; // NORMAL | DISCREET | NONE
  goal: string;
}

export interface PredictionRow {
  userId: string;
  expectedPeriodStart: Date;
  fertileWindowStart: Date | null;
}

/** Resolves the caller-facing copy level, or `null` if the user opted out entirely. */
function levelFor(profile: ProfileRow): 'NORMAL' | 'DISCREET' | null {
  if (profile.notificationLevel === 'NONE') return null;
  return profile.notificationLevel === 'DISCREET' ? 'DISCREET' : 'NORMAL';
}

/** N01 — fires exactly on `expectedPeriodStart - 3 days`, not every day up to it. */
export function checkPeriodReminder(
  profile: ProfileRow,
  prediction: PredictionRow | undefined,
  today: Date,
): CreateNotificationInput | null {
  const level = levelFor(profile);
  if (!level || !prediction) return null;
  const reminderDate = addDays(prediction.expectedPeriodStart, -3);
  if (reminderDate.getTime() !== today.getTime()) return null;
  return periodReminder(profile.userId, level, prediction.expectedPeriodStart);
}

/** N02 — fires when today has no DailyLog row yet. */
export function checkJournalReminder(
  profile: ProfileRow,
  hasTodayLog: boolean,
  today: Date,
): CreateNotificationInput | null {
  const level = levelFor(profile);
  if (!level || hasTodayLog) return null;
  return journalReminder(profile.userId, level, today);
}

/** N03 — fires only on Monday (UTC) AND only when Insights eligibility is true. */
export function checkWeeklySummary(
  profile: ProfileRow,
  eligible: boolean,
  today: Date,
): CreateNotificationInput | null {
  const level = levelFor(profile);
  if (!level || !eligible) return null;
  if (today.getUTCDay() !== 1) return null;
  return weeklySummaryReady(profile.userId, level, today);
}

/** N04 — fires only for goal=TRYING_TO_CONCEIVE, exactly on fertileWindowStart. */
export function checkFertilityReminder(
  profile: ProfileRow,
  prediction: PredictionRow | undefined,
  today: Date,
): CreateNotificationInput | null {
  const level = levelFor(profile);
  if (!level || !prediction || !prediction.fertileWindowStart) return null;
  if (profile.goal !== 'TRYING_TO_CONCEIVE') return null;
  if (prediction.fertileWindowStart.getTime() !== today.getTime()) return null;
  return fertilityWindowApproaching(profile.userId, level, prediction.fertileWindowStart);
}
