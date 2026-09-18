// Client-side analytics fire-and-forget wrapper. Errors are always
// swallowed — a tracking failure (offline, 401, a rejected consent-gated
// event) must never surface to the user or block the action it's
// attached to. Server-side enforcement (allowlist + consent) lives in
// lib/server/analytics/track.ts; this is purely the transport.
import { api } from '@/lib/api';
import type { AnalyticsEventMap, AnalyticsEventType } from '@/lib/analytics/events';

export function track<T extends AnalyticsEventType>(
  type: T,
  properties: AnalyticsEventMap[T],
): void {
  void api('/api/analytics/events', { method: 'POST', body: { type, properties } }).catch(() => {});
}

/** sessionStorage key bridging onboarding_started -> onboarding_completed's duration_sec. */
export const ONBOARDING_START_KEY = 'nawira_onboarding_start_ms';
