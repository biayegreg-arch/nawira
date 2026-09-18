# E12 Foundations — Analytics Pipeline Implementation Plan

**Goal:** A privacy-safe, consent-respecting event pipeline exists and
14 of the PRD's 19 authenticated-app events actually fire from real
product actions. No dashboards/KPI reads in this pass.

**Spec:** `docs/superpowers/specs/2026-09-17-e12-analytics-foundations-design.md`

## Global constraints

- Every event's shape comes verbatim from PRD §16/§28.13 — no additional
  properties, ever.
- `trackEvent()` never throws — a tracking failure must never break the
  user's actual action.
- `onboarding_started`/`goal_selected` are consent-exempt; every other
  event requires a live `Consent{type: ANALYTICS}` row.

---

### Task 1: Schema + shared event map

**Files:** `frontend/prisma/schema.prisma` (modify),
`frontend/src/lib/analytics/events.ts` (new)

- [ ] Add the `AnalyticsEvent` model (§3). Migrate:
      `pnpm --filter frontend exec prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/11_nawira_analytics/migration.sql`
      then `prisma migrate deploy` then `prisma generate` (the interactive
      `migrate dev` isn't usable in this shell — same workaround as the
      E4-part-2 migration).
- [ ] `events.ts` — the `AnalyticsEventMap` interface + `AnalyticsEventType`
      union, all 19 events per spec §5's table.
- [ ] Verify: `pnpm --filter frontend exec tsc --noEmit`.

---

### Task 2: Server pipeline — schemas, trackEvent, ingestion route

**Files (new):** `frontend/src/lib/server/analytics/schemas.ts`,
`frontend/src/lib/server/analytics/track.ts`,
`frontend/src/lib/server/analytics/track.test.ts`,
`frontend/src/app/api/analytics/events/route.ts`,
`frontend/src/app/api/analytics/events/route.test.ts`

- [ ] `schemas.ts` — one zod `.strict()` schema per event type +
      `requiresConsent: boolean`, keyed in a `Record<AnalyticsEventType, {
      schema: ZodSchema; requiresConsent: boolean }>`.
- [ ] `track.ts` — `trackEvent(db, userId, type, properties)`: look up the
      schema, `safeParse`; on failure, `log.warn` and return. If
      `requiresConsent`, `db.consent.findFirst({ where: { userId, type:
      'ANALYTICS', revokedAt: null } })` and return silently if absent.
      `db.analyticsEvent.create(...)`. Whole body in try/catch,
      `log.warn` on any thrown error, never rethrows.
- [ ] `track.test.ts` — consent-gated event with/without consent, exempt
      event fires with no consent row, unknown event type is a no-op,
      malformed properties rejected, a thrown Prisma error is swallowed.
- [ ] `route.ts` — `runtime = 'nodejs'`, `verifyCsrf` + `requireAuth`, zod
      body `{ type: z.string(), properties: z.record(z.unknown()) }`
      (reject unknown `type` strings against the `events.ts` key set with
      400 `VALIDATION_FAILED` before calling `trackEvent` — a typo'd event
      name from a future client change should be loud, not silently
      dropped), calls `trackEvent`, always returns 204 on a recognized
      type (this must never surface a client-visible failure once the
      type itself is valid).
- [ ] `route.test.ts` — auth/csrf guards, 400 on unknown type, 204 + calls
      `trackEvent` on a known type.
- [ ] Verify: `pnpm --filter frontend exec vitest run src/lib/server/analytics src/app/api/analytics && pnpm --filter frontend exec tsc --noEmit`.

---

### Task 3: Client `track()` helper

**Files (new):** `frontend/src/lib/analytics.ts`

- [ ] `track<T extends AnalyticsEventType>(type: T, properties:
      AnalyticsEventMap[T]): void` — fire-and-forget `api('/api/analytics/events',
      { method: 'POST', body: { type, properties } }).catch(() => {})`.
- [ ] Verify: `pnpm --filter frontend exec tsc --noEmit`.

---

### Task 4: Onboarding funnel (3 events)

**Files (modify):** `frontend/src/app/onboarding/welcome/page.tsx`,
`frontend/src/app/onboarding/goal/page.tsx`,
`frontend/src/app/onboarding/ready/page.tsx`

- [ ] `welcome/page.tsx` — on mount, `sessionStorage.setItem('nawira_onboarding_start_ms', String(Date.now()))`
      then `track('onboarding_started', {})`.
- [ ] `goal/page.tsx` — in `onContinue()`, after `update({ goal })`,
      `track('goal_selected', { goal })`.
- [ ] `ready/page.tsx` — on mount, read+remove
      `nawira_onboarding_start_ms`; if present, `track('onboarding_completed',
      { duration_sec: Math.round((Date.now() - start) / 1000) })`.
- [ ] Verify: `pnpm --filter frontend exec tsc --noEmit && pnpm --filter frontend run lint`.

---

### Task 5: Logging + predictions + insights + billing (5 events)

**Files (modify):** `frontend/src/app/app/today/page.tsx`,
`frontend/src/app/app/log/page.tsx`,
`frontend/src/app/app/insights/page.tsx`,
`frontend/src/app/app/billing/page.tsx`

- [ ] `today/page.tsx`: `handleLog` → `track('period_logged', { offline_flag:
      result.queued })` after a successful `runOrQueue`. `load()` → when
      `prediction` is non-null, `track('prediction_viewed', { type: ...,
      confidence: prediction.confidence })` once per mount (a ref guard,
      not on every `onCycleDataChanged` refetch).
- [ ] `log/page.tsx`: `handleSubmit` → after all 3 `runOrQueue` calls
      resolve, `track('daily_log_saved', { fields_count, duration_sec })`
      (fields_count computed from `logValues`) and, only when
      `flow !== 'NONE'`, `track('period_logged', { offline_flag:
      flowResult.queued })`. `handlePeriodRangeSubmit` → `track('period_logged',
      { offline_flag: result.queued })`.
- [ ] `insights/page.tsx`: after a successful `load()` with `eligible:
      true`, loop `insights` and `track('insight_viewed', { type: i.type,
      evidence_count: i.evidenceCount })` for each — guarded by a
      `useRef` so a re-fetch doesn't re-fire for the same mount.
- [ ] `billing/page.tsx`: on mount, once `plan` is loaded, `track('paywall_viewed',
      { paywall_id: 'billing_page', plan: <highlighted plan key> })`.
- [ ] Verify: `pnpm --filter frontend exec tsc --noEmit && pnpm --filter frontend run lint`.

---

### Task 6: Server-side events (third_cycle_completed, assistant_used)

**Files (modify):** `frontend/src/lib/server/cycles/recompute.ts`,
`frontend/src/lib/server/cycles/recompute.test.ts`,
`frontend/src/app/api/assistant/messages/route.ts`,
`frontend/src/app/api/assistant/messages/route.test.ts`

- [ ] `recompute.ts` — after upserting cycles, detect the transition to
      exactly 3 complete cycles (count complete cycles pre- and
      post-write, or simpler: count complete cycles now and only track
      when it equals exactly 3 AND this call actually wrote/changed a
      cycle this pass — avoids re-firing on every subsequent recompute
      once already at 3+). `months_since_signup` from the user's
      `createdAt` (already fetchable via the existing `tx.profile`/`tx.user`
      queries — add a `select` if not already there).
- [ ] `recompute.test.ts` — new case: exactly-3rd-cycle transition fires
      once; a 4th completed cycle on a later call does not re-fire.
- [ ] `assistant/messages/route.ts` — after `classifyIntent`, `void
      trackEvent(prisma, auth.user.sub, 'assistant_used', { intent_category:
      intentCategory, no_health_text: true })` (fire-and-forget, must not
      delay the SSE stream response).
- [ ] `assistant/messages/route.test.ts` — assert `trackEvent` (mocked) is
      called with the classified intent.
- [ ] Verify: `pnpm --filter frontend exec vitest run src/lib/server/cycles/recompute.test.ts src/app/api/assistant/messages/route.test.ts`.

---

### Task 7: PWA + sync lifecycle (4 events)

**Files (modify):** `frontend/src/components/pwa/PwaRegister.tsx`,
`frontend/src/contexts/SyncStatusContext.tsx`

- [ ] `PwaRegister.tsx` — add `beforeinstallprompt` listener →
      `track('pwa_install_prompt_shown', {})` (also `event.preventDefault()`
      is NOT called — this pass only observes, it doesn't take over the
      native install-prompt UI); add `appinstalled` listener →
      `track('pwa_installed', {})`.
- [ ] `SyncStatusContext.tsx` — `handleOffline()` → `track('offline_mode_entered',
      {})`; `runDrain()`'s `result.synced > 0` branch → `track('sync_completed',
      {})`; `result.failed > 0` branch → `track('sync_failed', {})`.
- [ ] Verify: `pnpm --filter frontend exec tsc --noEmit && pnpm --filter frontend run lint`.

---

### Task 8: Full gate

- [ ] `pnpm --filter frontend run format && pnpm --filter frontend run lint && pnpm --filter frontend run typecheck && pnpm --filter frontend exec vitest run && pnpm --filter frontend run build`.
- [ ] Manual spot-check: sign up a fresh test user through onboarding with
      Analytics toggled ON, confirm `AnalyticsEvent` rows appear for
      `onboarding_started`/`goal_selected` (before consent) and
      `onboarding_completed` (after); log a period and a daily entry,
      confirm `period_logged`/`daily_log_saved`; run a second fresh user
      who declines the Analytics toggle at onboarding, confirm
      `onboarding_started`/`goal_selected` still record for them but no
      further event does (no settings UI exists yet to revoke consent
      after the fact — out of scope for this pass).
