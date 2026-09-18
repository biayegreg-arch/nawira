// Privacy-safe analytics event catalog — PRD §16 + §28.13, verbatim.
// Every property list here is the PRD's own allowlist: never free text,
// symptom detail, period dates, or fertility/pregnancy status. Shared
// between client (type-safe `track()` calls) and server (zod validation
// in lib/server/analytics/schemas.ts) — this file itself stays
// import-safe from client code (no `server-only`, no Prisma).
export interface AnalyticsEventMap {
  onboarding_started: { source?: string; country?: string };
  goal_selected: { goal: string };
  onboarding_completed: { duration_sec: number };
  period_logged: { offline_flag: boolean };
  daily_log_saved: { fields_count: number; duration_sec?: number };
  prediction_viewed: { type: string; confidence: string };
  insight_viewed: { type: string; evidence_count?: number };
  paywall_viewed: { paywall_id: string; plan: string };
  checkout_started: { plan: string; provider: string };
  subscription_activated: { plan: string; provider: string };
  subscription_cancelled: { plan: string; reason?: string };
  third_cycle_completed: { months_since_signup: number };
  assistant_used: { intent_category?: string; no_health_text: boolean };
  privacy_export_requested: Record<string, never>;
  account_delete_requested: Record<string, never>;
  pwa_install_prompt_shown: Record<string, never>;
  pwa_installed: Record<string, never>;
  offline_mode_entered: Record<string, never>;
  sync_completed: Record<string, never>;
  sync_failed: Record<string, never>;
}

export type AnalyticsEventType = keyof AnalyticsEventMap;

export const ANALYTICS_EVENT_TYPES = Object.keys({
  onboarding_started: true,
  goal_selected: true,
  onboarding_completed: true,
  period_logged: true,
  daily_log_saved: true,
  prediction_viewed: true,
  insight_viewed: true,
  paywall_viewed: true,
  checkout_started: true,
  subscription_activated: true,
  subscription_cancelled: true,
  third_cycle_completed: true,
  assistant_used: true,
  privacy_export_requested: true,
  account_delete_requested: true,
  pwa_install_prompt_shown: true,
  pwa_installed: true,
  offline_mode_entered: true,
  sync_completed: true,
  sync_failed: true,
} satisfies Record<AnalyticsEventType, true>) as AnalyticsEventType[];
