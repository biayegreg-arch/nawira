import 'server-only';
import { z, type ZodTypeAny } from 'zod';
import type { AnalyticsEventType } from '@/lib/analytics/events';

interface EventDefinition {
  schema: ZodTypeAny;
  /** onboarding_started/goal_selected are the sole exemption — see the
   * E12-foundations design spec's consent-gating section. */
  requiresConsent: boolean;
}

const empty = z.object({}).strict();

export const EVENT_DEFINITIONS: Record<AnalyticsEventType, EventDefinition> = {
  onboarding_started: {
    schema: z
      .object({ source: z.string().max(100).optional(), country: z.string().max(2).optional() })
      .strict(),
    requiresConsent: false,
  },
  goal_selected: {
    schema: z.object({ goal: z.string().max(50) }).strict(),
    requiresConsent: false,
  },
  onboarding_completed: {
    schema: z.object({ duration_sec: z.number().nonnegative() }).strict(),
    requiresConsent: true,
  },
  period_logged: {
    schema: z.object({ offline_flag: z.boolean() }).strict(),
    requiresConsent: true,
  },
  daily_log_saved: {
    schema: z
      .object({
        fields_count: z.number().int().nonnegative(),
        duration_sec: z.number().nonnegative().optional(),
      })
      .strict(),
    requiresConsent: true,
  },
  prediction_viewed: {
    schema: z.object({ type: z.string().max(50), confidence: z.string().max(20) }).strict(),
    requiresConsent: true,
  },
  insight_viewed: {
    schema: z
      .object({
        type: z.string().max(50),
        evidence_count: z.number().int().nonnegative().optional(),
      })
      .strict(),
    requiresConsent: true,
  },
  paywall_viewed: {
    schema: z.object({ paywall_id: z.string().max(50), plan: z.string().max(20) }).strict(),
    requiresConsent: true,
  },
  checkout_started: {
    schema: z.object({ plan: z.string().max(20), provider: z.string().max(30) }).strict(),
    requiresConsent: true,
  },
  subscription_activated: {
    schema: z.object({ plan: z.string().max(20), provider: z.string().max(30) }).strict(),
    requiresConsent: true,
  },
  subscription_cancelled: {
    schema: z.object({ plan: z.string().max(20), reason: z.string().max(100).optional() }).strict(),
    requiresConsent: true,
  },
  third_cycle_completed: {
    schema: z.object({ months_since_signup: z.number().nonnegative() }).strict(),
    requiresConsent: true,
  },
  assistant_used: {
    schema: z
      .object({ intent_category: z.string().max(50).optional(), no_health_text: z.boolean() })
      .strict(),
    requiresConsent: true,
  },
  privacy_export_requested: { schema: empty, requiresConsent: true },
  account_delete_requested: { schema: empty, requiresConsent: true },
  pwa_install_prompt_shown: { schema: empty, requiresConsent: true },
  pwa_installed: { schema: empty, requiresConsent: true },
  offline_mode_entered: { schema: empty, requiresConsent: true },
  sync_completed: { schema: empty, requiresConsent: true },
  sync_failed: { schema: empty, requiresConsent: true },
};
