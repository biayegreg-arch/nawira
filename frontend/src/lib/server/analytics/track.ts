import 'server-only';
import type { Prisma } from '@prisma/client';
import { log } from '@/lib/server/observability/log';
import type { AnalyticsEventType } from '@/lib/analytics/events';
import { EVENT_DEFINITIONS } from './schemas';

/**
 * The single enforcement point for the analytics pipeline — every write
 * to AnalyticsEvent MUST go through here (never a raw
 * `db.analyticsEvent.create()`), mirroring this codebase's
 * `createNotification(prisma, input)` / `logAdminAction(prisma, {...})`
 * precedent. Validates the payload against the event's allowlisted
 * schema, checks the ANALYTICS consent (unless the event is exempt —
 * onboarding_started/goal_selected, see the design spec), then inserts.
 *
 * NEVER throws: a tracking failure (bad payload, missing consent, DB
 * hiccup) must never break the caller's real action — same discipline
 * as NotificationBell's best-effort badge fetch, applied to a write.
 * Accepts `Prisma.TransactionClient` so callers can track from inside an
 * existing transaction (e.g. recomputeCyclesAndPrediction); a plain
 * `PrismaClient` is structurally assignable here too.
 */
export async function trackEvent(
  db: Prisma.TransactionClient,
  userId: string,
  type: AnalyticsEventType,
  properties: unknown,
): Promise<void> {
  try {
    const definition = EVENT_DEFINITIONS[type];
    if (!definition) {
      log.warn('analytics event rejected: unknown type', { type });
      return;
    }

    const parsed = definition.schema.safeParse(properties);
    if (!parsed.success) {
      log.warn('analytics event rejected: invalid properties', {
        type,
        issues: parsed.error.issues,
      });
      return;
    }

    if (definition.requiresConsent) {
      const consent = await db.consent.findFirst({
        where: { userId, type: 'ANALYTICS', revokedAt: null },
        select: { id: true },
      });
      if (!consent) return;
    } else {
      // Consent-exempt onboarding events have no Consent row to bounce off,
      // so a still-valid access token (up to 15 min) could otherwise record
      // an event for an account that was just deleted. Only these 2 events
      // pay this extra query, once per user.
      const deleted = await db.user.findFirst({
        where: { id: userId, status: 'DELETED' },
        select: { id: true },
      });
      if (deleted) return;
    }

    await db.analyticsEvent.create({
      data: { userId, type, properties: parsed.data as Prisma.InputJsonValue },
    });
  } catch (err) {
    log.warn('analytics tracking failed', {
      type,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
