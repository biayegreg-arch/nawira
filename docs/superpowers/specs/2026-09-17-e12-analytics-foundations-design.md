# E12 (foundations) — Privacy-Safe Analytics Pipeline Design

## 1. Scope

Builds the event pipeline for PRD Epic E12 ("Analytics: events privacy-safe
+ dashboards") and instruments every authenticated-app event from the
PRD's two event tables (§16, §28.13) that has a real call site in this
codebase today. Confirmed with the user (AskUserQuestion, 2026-09-17):

- **Deferred to a later pass:** the 3 anonymous pre-signup events
  (`landing_viewed`, `hero_cta_clicked`, `signup_started` — no
  authenticated user exists yet, a materially different tracking
  mechanism), and the KPI aggregation/dashboard endpoints (§17) — this
  pass ships the pipeline and per-event instrumentation only, nothing
  downstream reads the data yet beyond raw storage.
- **In scope:** the remaining 19 events, split into 14 wired into a real
  call site and 5 defined in the allowlist but not yet wired (the
  underlying features — checkout, subscriptions, privacy export/delete —
  don't exist in this codebase yet; wiring them now would mean tracking
  calls with no caller).

## 2. The consent-gating question (resolved with the user)

PRD §14's `consents` table lists `ANALYTICS` (C05, "à cadrer" — the PRD
itself flags this as unresolved) as an onboarding-collected toggle. The
concrete problem: the consent screen (`/onboarding/consent`, step 9 of
11) sits two-thirds through the flow, but `onboarding_started` (step 1)
and `goal_selected` (step 3) must fire *before* any `Consent` row can
exist. Gating everything on "an `ANALYTICS` Consent row exists" would
silently make the onboarding funnel's own entry point untrackable.

**Resolved (AskUserQuestion, 2026-09-17):** `onboarding_started` and
`goal_selected` are the only two events exempt from the consent check —
their allowed properties (`source`, `country`, `goal`) contain no
PII/health data by construction (the same allowlist discipline that
protects every other event). Every other event, including
`onboarding_completed` (fires at `/onboarding/ready`, step 11 — after the
consent screen), strictly requires a non-revoked `Consent{type:
ANALYTICS}` row for that user or it is silently dropped.

## 3. Data model

```prisma
model AnalyticsEvent {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type       String
  properties Json
  createdAt  DateTime @default(now())

  @@index([type, createdAt])
  @@index([userId, createdAt])
}
```

No anonymous events in this pass, so `userId` is non-null (unlike
`AdminAction.actorId` there's no cross-cutting "system" actor concept
needed here). Mirrors `AdminAction`'s existing shape (`Json` properties
column, compound indexes for both "all events of type X" and "all events
for user Y" queries) — no new architectural pattern introduced.

## 4. Server architecture — single enforcement point

```
frontend/src/lib/analytics/events.ts          — shared (client+server) event-name → property-shape TS map
frontend/src/lib/server/analytics/schemas.ts  — one zod schema per event, `.strict()` (unknown keys 400,
                                                 not silently stripped — a caller sending an unexpected
                                                 key is a bug to surface, not paper over), each tagged
                                                 with `requiresConsent: boolean`
frontend/src/lib/server/analytics/track.ts    — trackEvent(db, userId, type, properties): validates,
                                                 checks consent (unless exempt), inserts — NEVER throws
frontend/src/app/api/analytics/events/route.ts — POST, requireAuth + verifyCsrf, thin wrapper delegating
                                                  to trackEvent() for client-observed events
frontend/src/lib/analytics.ts                  — client track() — fire-and-forget POST via api(), errors
                                                  swallowed (an analytics failure must never surface to
                                                  the user or block the primary action)
```

`trackEvent()` is the single point that both the new route AND existing
route handlers (assistant messages, cycle recompute) call directly —
matches this codebase's `createNotification(prisma, input)` /
`logAdminAction(prisma, {...})` precedent: one shared function every
call site goes through, so the privacy allowlist can never be bypassed
by a route handler constructing a raw `prisma.analyticsEvent.create()`
itself. `trackEvent()` accepts `Prisma.TransactionClient | PrismaClient`
so `recomputeCyclesAndPrediction` can call it inside its existing
transaction for `third_cycle_completed`.

**Failure handling:** `trackEvent()` wraps its entire body in try/catch
and only ever logs a warning on failure — a malformed payload, a DB
hiccup, or a missing consent row must never throw back into the calling
route and break the real user action (saving a daily log, sending an
assistant message). Same principle `NotificationBell`'s badge-count
fetch already documents ("best-effort — a failed count fetch shouldn't
surface an error UI"), applied to writes instead of reads.

## 5. The 19-event allowlist and their integration points

| Event | Properties | Consent-gated | Integration |
|---|---|---|---|
| `onboarding_started` | `source?`, `country?` | No | `/onboarding/welcome` mount. `country` omitted — no `countryCode` field exists anywhere on `User`/`Profile` in this codebase; fabricating one would violate the "no invented data" discipline every other screen in this project follows. |
| `goal_selected` | `goal` | No | `/onboarding/goal`, on selection click |
| `onboarding_completed` | `duration_sec` | Yes | `/onboarding/ready` mount. `duration_sec` = now − a `sessionStorage` timestamp written by `onboarding_started`'s effect (cleared after read) — the only source of this timing since the flow spans 11 client-rendered steps with no server-side session concept for "onboarding in progress." |
| `period_logged` | `offline_flag` | Yes | `/app/today` "Mes règles ont commencé" CTA, `/app/log`'s daily-log-form flow selection, `/app/log`'s period-range backfill — all 3 real period-logging actions in the app |
| `daily_log_saved` | `fields_count`, `duration_sec?` | Yes | `/app/log` `handleSubmit`. `fields_count` = count of non-empty fields in the submitted payload; `duration_sec` = time since the page mounted (a `useRef` timestamp, reset is not needed since this page is single-purpose) |
| `prediction_viewed` | `type`, `confidence` | Yes | `/app/today` mount, only when a real `Prediction` exists |
| `insight_viewed` | `type`, `evidence_count?` | Yes | `/app/insights`, once per real insight `type` already returned by `GET /api/insights` (each already carries a real `evidenceCount` — a genuine 1:1 mapping, no invented data), guarded by a mount ref so re-fetches (e.g. after `onCycleDataChanged`) don't re-fire |
| `paywall_viewed` | `paywall_id`, `plan` | Yes | `/app/billing` mount — `paywall_id: 'billing_page'`, `plan` = the highlighted plan in `BILLING_PLANS` (the one the page visually promotes) |
| `checkout_started` | `plan`, `provider` | Yes | Not wired — no real checkout flow exists (`PremiumPlansGrid`'s buttons are disabled, "Bientôt disponible") |
| `subscription_activated` | `plan`, `provider` | Yes | Not wired — no `Subscription` model or payment webhook for it exists |
| `subscription_cancelled` | `plan`, `reason?` | Yes | Not wired — same as above |
| `third_cycle_completed` | `months_since_signup` | Yes | Server, inside `recomputeCyclesAndPrediction` — fires once, the first time a user's 3rd complete `Cycle` row appears (transition-detected, not re-fired every recompute after) |
| `assistant_used` | `intent_category?`, `no_health_text` | Yes | Server, `POST /api/assistant/messages`, reusing the already-computed `classifyIntent()` result. `no_health_text` is always `true` — it documents this event's own safety property (the guardrail pipeline's entire job), not a variable outcome |
| `privacy_export_requested` | *(none)* | Yes | Not wired — no export endpoint exists yet (E8, unbuilt) |
| `account_delete_requested` | *(none)* | Yes | Not wired — no delete endpoint exists yet (E8, unbuilt) |
| `pwa_install_prompt_shown` | *(none)* | Yes | `PwaRegister.tsx`, `beforeinstallprompt` window event (not currently listened for at all) |
| `pwa_installed` | *(none)* | Yes | `PwaRegister.tsx`, `appinstalled` window event |
| `offline_mode_entered` | *(none)* | Yes | `SyncStatusContext.tsx`, `handleOffline()` |
| `sync_completed` | *(none)* | Yes | `SyncStatusContext.tsx`, `runDrain()`'s `result.synced > 0` branch |
| `sync_failed` | *(none)* | Yes | `SyncStatusContext.tsx`, `runDrain()`'s `result.failed > 0` branch |

Every property list above is the PRD's own allowlist verbatim (§16,
§28.13) — nothing added, nothing storing free text, symptom detail,
period dates, or fertility/pregnancy status, matching the PRD's explicit
minimization rule.

## 6. Out of scope (explicit)

- No KPI aggregation endpoints (§17: activation/D7/D30/3-cycles/Free→Plus/
  churn) — reading this data back is a distinct pass with its own design
  questions (cohort definitions, time windows).
- No anonymous/pre-signup event capture — needs a session-less
  visitor-tracking mechanism (a client-generated anonymous ID, likely
  cookie or `localStorage`-based) that raises its own privacy-scoping
  questions distinct from the authenticated-user consent model built
  here.
- No retention/purge cron in this pass — flagged as a known follow-up
  (this codebase already has a `webhook-log-purge` / `email-job-purge`
  precedent to model it on), not added now to keep this pass's surface
  bounded to "does the pipeline work end-to-end for real events."
- No client-side batching/queueing of analytics calls — each `track()`
  is one fire-and-forget `POST`. High-frequency events (there are none
  in this list — the closest, `insight_viewed`, fires a handful of times
  per page load) don't justify the complexity of a batching queue yet.

## 7. Testing

- `frontend/src/lib/server/analytics/track.test.ts` — the real unit
  surface: consent-gated vs exempt events, schema rejection (extra keys,
  wrong types), and that a DB failure never throws past `trackEvent()`.
- `frontend/src/app/api/analytics/events/route.test.ts` — auth/CSRF
  guards, unknown `type` → 400, delegates to `trackEvent`.
- `recompute.test.ts` gets a new case for the `third_cycle_completed`
  transition (fires once, not on every subsequent recompute).
- `assistant/messages/route.test.ts` gets a new assertion that
  `trackEvent` is called with the classified intent.
- No tests for the client-side `track()` calls scattered across pages —
  same rationale as this codebase's existing precedent for
  `NotificationBell`'s best-effort badge fetch: thin, side-effect-only
  glue, verified by the manual browser pass instead.
