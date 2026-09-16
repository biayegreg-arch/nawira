/**
 * Notification templates.
 *
 * Each project defines its own typed wrappers around `createNotification`.
 * The example below ships with the template — adapt it, replace it, or add
 * more (e.g. `firePaymentReceived`, `fireExportReady`). The pattern:
 *
 *   1. Build a `CreateNotificationInput` with a *deterministic* dedupeKey
 *      so the unique constraint enforces at-most-once delivery for that
 *      logical event (e.g. `payment-received:${orderId}` — never include
 *      a timestamp or random suffix).
 *   2. Pass the input + your PrismaClient to `createNotification`.
 *   3. Optionally enqueue an email via `EmailQueue.enqueue` — but ONLY
 *      after the notification row is created, so a duplicate event never
 *      sends a duplicate email.
 *
 * Keep these helpers free of side effects beyond the row insert; the
 * email enqueue belongs at the call site so each project can pick the
 * right channel (no email vs. transactional vs. marketing).
 */

import type { CreateNotificationInput } from './index';

export function welcomeNotification(userId: string, email: string): CreateNotificationInput {
  return {
    userId,
    type: 'WELCOME',
    title: 'Bienvenue sur NAWIRA 👋',
    body: `Heureux de t'accompagner, ${email}.`,
    dedupeKey: `welcome:${userId}`,
  };
}

/**
 * Example: notification dispatched after a successful payment.
 * Called from the Bictorys webhook handler's `onPaid` post-commit hook.
 */
export function paymentReceived(
  userId: string,
  orderId: string,
  amount: number,
  currency: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'PAYMENT_RECEIVED',
    title: 'Payment received',
    body: `Order ${orderId} for ${amount} ${currency} confirmed.`,
    data: { orderId, amount, currency },
    dedupeKey: `payment-received:${orderId}`,
  };
}

/**
 * Phase 8 (E9, PRD §11 N01-N04) — 4 cron-driven notification templates.
 * `level` is the caller's already-resolved 'NORMAL' | 'DISCREET' choice
 * (never 'NONE' — callers must skip sending entirely for NONE, not call
 * these functions). In DISCREET mode the title is ALSO replaced with the
 * generic 'NAWIRA' — PRD §11: "Aucune donnée intime sur écran verrouillé
 * en mode discret."
 */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function periodReminder(
  userId: string,
  level: 'NORMAL' | 'DISCREET',
  expectedPeriodStart: Date,
): CreateNotificationInput {
  return {
    userId,
    type: 'PERIOD_REMINDER',
    title: level === 'DISCREET' ? 'NAWIRA' : 'Règles à venir',
    body:
      level === 'DISCREET'
        ? 'Ton rappel personnel est disponible.'
        : 'Tes règles sont estimées dans environ 3 jours.',
    dedupeKey: `period-reminder:${userId}:${isoDate(expectedPeriodStart)}`,
  };
}

export function journalReminder(
  userId: string,
  level: 'NORMAL' | 'DISCREET',
  today: Date,
): CreateNotificationInput {
  return {
    userId,
    type: 'JOURNAL_REMINDER',
    title: level === 'DISCREET' ? 'NAWIRA' : 'Ton journal du jour',
    body:
      level === 'DISCREET'
        ? 'Un rappel NAWIRA est disponible.'
        : "Comment te sens-tu aujourd'hui ?",
    dedupeKey: `journal-reminder:${userId}:${isoDate(today)}`,
  };
}

export function weeklySummaryReady(
  userId: string,
  level: 'NORMAL' | 'DISCREET',
  weekOf: Date,
): CreateNotificationInput {
  return {
    userId,
    type: 'WEEKLY_SUMMARY',
    title: level === 'DISCREET' ? 'NAWIRA' : 'Ton résumé est prêt',
    body:
      level === 'DISCREET' ? 'Ton nouveau résumé est disponible.' : 'Ton résumé de cycle est prêt.',
    dedupeKey: `weekly-summary:${userId}:${isoDate(weekOf)}`,
  };
}

export function fertilityWindowApproaching(
  userId: string,
  level: 'NORMAL' | 'DISCREET',
  fertileWindowStart: Date,
): CreateNotificationInput {
  return {
    userId,
    type: 'FERTILITY_REMINDER',
    title: level === 'DISCREET' ? 'NAWIRA' : 'Fenêtre fertile',
    body:
      level === 'DISCREET'
        ? 'Un rappel Projet Bébé est disponible.'
        : 'Ta fenêtre fertile estimée approche.',
    dedupeKey: `fertility-reminder:${userId}:${isoDate(fertileWindowStart)}`,
  };
}
