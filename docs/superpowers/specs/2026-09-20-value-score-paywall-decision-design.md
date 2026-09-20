# Value Score + Paywall Decision — Design Spec

## 0. Scope of this spec

The business-model reference (`NAWIRA_Modele_Economique_Reference_v2.md`, §6) defines the
**Value Score** as an internal, user-invisible score computed from behavioral signals, used
only to time paywall prompts well (never as a manipulation tool). It is currently unbuilt —
the app has domain data (cycles, symptoms, insights) and a static `/app/billing` page, but no
mechanism decides *when* to suggest an upgrade.

Decided during brainstorming (architectural path, Option 3 of the scoping question):

1. **Scoring engine** — an event log + denormalized total, hooked into the existing routes
   that already produce the qualifying behavior (cycle completion, symptom logging, calendar/
   insight consultation, Projet Bébé activation, paywall-surface visits).
2. **Decision endpoint** — `GET /api/paywall/decision`, which turns the score (+ plan + goal)
   into an actionable `{ shouldShow, suggestedPlan, reason }` for the frontend to act on.

**Explicitly out of scope:**

- **Any paywall UI** (banner, modal, wording, placement). This spec ships the backend contract
  only; the frontend surface is a separate follow-up chantier, deliberately decoupled per the
  starter's headless convention (CLAUDE.md — "no server lib reaches into the DOM").
- **Mobile Money / payment integration.** `checkout_started` / `subscription_activated` stay
  analytics-only events with no real provider behind them (payments-bictorys was pruned
  wholesale from this fork — see `.planning/features.json` v1.3.0). Plan changes remain
  manual admin grants via `PATCH /api/admin/users/[id]/plan`.
- **Exposing the raw score anywhere** (user-facing API, admin UI). The business model requires
  the score to stay invisible to the user; this spec doesn't add an admin view of it either —
  a future support/debug need for admins to see it is a separate, explicitly-approved addition.
- **A/B-testable thresholds, remote config.** Thresholds and point weights are named constants
  in code for this pass — tuning them is a code change, not a runtime config surface. The
  business model calls for tunability *over time*, not a live experimentation platform on day
  one; that's YAGNI until pricing tests (its own §41-42 process) actually need it.

## 1. Data model

Two additions to `frontend/prisma/schema.prisma`:

```prisma
model Profile {
  // ...existing fields...
  valueScore Int @default(0) // denormalized total; see ValueScoreEvent for the audit trail
}

model ValueScoreEvent {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  signalType String   // FIRST_CYCLE_LOGGED | SECOND_CYCLE_LOGGED | THIRD_CYCLE_COMPLETED |
                       // SYMPTOM_LOGGED | CALENDAR_CONSULTED | INSIGHT_VIEWED |
                       // PROJET_BEBE_ACTIVATED | PREMIUM_INTEREST_SHOWN
  points     Int
  createdAt  DateTime @default(now())

  @@index([userId, signalType, createdAt])
}
```

`User` gains `valueScoreEvents ValueScoreEvent[]`. `Profile.valueScore` is the fast read path
for the decision endpoint (no aggregation query on every request); `ValueScoreEvent` is the
append-only log that makes the total auditable/tunable later, mirroring the existing
`AdminAction` / `AccountActivity` house pattern rather than inventing a new one.

No unique constraint enforces one-shot signals at the DB level (repeatable signals share the
same table). Idempotency is the engine's job (§2), matching the `createNotification` /
`trackEvent` precedent of "the helper decides, callers just call it."

## 2. Scoring engine — `frontend/src/lib/server/value-score/`

**`signals.ts`** — the single source of truth for weights, so retuning never touches call
sites:

```ts
export const VALUE_SCORE_SIGNALS = {
  FIRST_CYCLE_LOGGED:      { points: 20, kind: 'once' },
  SECOND_CYCLE_LOGGED:     { points: 20, kind: 'once' },
  THIRD_CYCLE_COMPLETED:   { points: 25, kind: 'once' },
  PROJET_BEBE_ACTIVATED:   { points: 30, kind: 'once' },
  SYMPTOM_LOGGED:          { points: 10, kind: 'repeatable', cooldownDays: 1 },
  CALENDAR_CONSULTED:      { points: 5,  kind: 'repeatable', cooldownDays: 1 },
  INSIGHT_VIEWED:          { points: 10, kind: 'repeatable', cooldownDays: 1 },
  PREMIUM_INTEREST_SHOWN:  { points: 15, kind: 'repeatable', cooldownDays: 3 },
} as const satisfies Record<string, SignalDefinition>;
```

Point values map directly to the business-model's named signals (§6); `PROJET_BEBE_ACTIVATED`
and `PREMIUM_INTEREST_SHOWN` are the doc's two "strong signal" bullets, given concrete numbers
since the source doc doesn't fix one — flagged as the two most likely to need retuning first.

**`record.ts`** — `recordValueScoreSignal(db: Prisma.TransactionClient | PrismaClient, userId, signalType)`:

- `kind: 'once'` — `findFirst({ where: { userId, signalType } })`; if none exists, insert the
  event and `profile.update({ valueScore: { increment: points } })`.
- `kind: 'repeatable'` — same but the `findFirst` filters `createdAt >= now - cooldownDays`.
- **Never throws.** Wrapped in try/catch that logs a warning and returns, exactly like
  `trackEvent` — a scoring failure must never block the real action (logging a period, saving
  symptoms). This is a deliberate accuracy/availability trade-off: the check-then-insert isn't
  wrapped in `Serializable`, so a rare race could double-count a repeatable signal by one
  cooldown window. Acceptable for a soft engagement score (not money, not `withdrawals/lock.ts`
  territory) — noted here so it's a documented choice, not an oversight.
- Accepts either a transaction client (when called from inside an existing tx, e.g.
  `recomputeCyclesAndPrediction`) or the plain `PrismaClient` (when called from a simple GET
  handler with no surrounding transaction).

## 3. Integration points (surgical edits to existing files)

| File | Hook | Signal |
|---|---|---|
| `lib/server/cycles/recompute.ts` | generalize the existing `previousComplete`/`currentComplete` crossing check (currently only tracks crossing 3) to also detect crossing 1 and 2 | `FIRST_CYCLE_LOGGED`, `SECOND_CYCLE_LOGGED`, `THIRD_CYCLE_COMPLETED` |
| `app/api/daily-logs/today/route.ts` (`PUT`) | after `symptomLog.createMany`, when the new list is non-empty | `SYMPTOM_LOGGED` |
| `app/api/cycles/route.ts` (`GET`) | best-effort call after the response data is assembled | `CALENDAR_CONSULTED` |
| `app/api/insights/route.ts` (`GET`) | best-effort call after the response data is assembled | `INSIGHT_VIEWED` |
| `app/api/onboarding/complete/route.ts` (`POST`) | inside the existing transaction, when `goal === 'TRYING_TO_CONCEIVE'` | `PROJET_BEBE_ACTIVATED` |
| `app/api/paywall/decision/route.ts` (new, §4) | on every call from a `FREE`-plan user, before computing the decision | `PREMIUM_INTEREST_SHOWN` |
| `lib/server/account/delete-account.ts` | add `await tx.valueScoreEvent.deleteMany({ where: { userId } })` alongside the existing per-model deletes | — (GDPR-style cleanup, same as every other user-owned table in that transaction) |

`PREMIUM_INTEREST_SHOWN` is deliberately recorded inside the decision endpoint itself rather
than on `GET /api/pricing` — that route is intentionally unauthenticated (pre-signup pricing
page use case, see its own header comment), so it has no `userId` to attribute a signal to.
Visiting the billing/paywall surface while on `/app/billing` (which calls the decision
endpoint) is itself the "interaction with a premium surface" the business model describes.

## 4. Decision engine + endpoint

**`lib/server/value-score/paywall-decision.ts`** — pure function, no I/O, fully unit-testable:

```ts
const BABY_FUNNEL_THRESHOLD = 10;   // low bar — PROJET_BEBE_ACTIVATED alone (30 pts) clears it
const CYCLE_FUNNEL_THRESHOLD = 60;  // roughly 2 cycles + one engagement signal

function decidePaywallPrompt(input: {
  valueScore: number;
  goal: 'PERIOD_TRACKING' | 'UNDERSTAND_CYCLE' | 'TRYING_TO_CONCEIVE';
}): { shouldShow: boolean; suggestedPlan: 'PLUS' | 'BABY' | null; reason: string }
```

Implements the two funnels from the business model (§10): Projet Bébé converts fast and
independent of the "3-cycle" guideline; the Cycle funnel needs more accumulated engagement.
Thresholds are named constants — tuning them is a one-line code change, reviewed like any
other, not a runtime toggle (see Out of scope).

**`app/api/paywall/decision/route.ts`** (new) — `GET`, `requireAuth`, no CSRF (read-only):

1. Load `Profile.{valueScore, goal, plan}` for the caller.
2. If `plan !== 'FREE'`, return `{ shouldShow: false, suggestedPlan: null, reason: 'already_subscribed' }` immediately (no upsell for paying users) — skips the interest-signal recording too, since a paying user visiting billing isn't a conversion signal.
3. Otherwise, best-effort `recordValueScoreSignal(prisma, userId, 'PREMIUM_INTEREST_SHOWN')`, then call `decidePaywallPrompt`.
4. If `shouldShow`, fire the existing `paywall_viewed` analytics event (already in the catalog, currently unused by any route) with `{ paywall_id: 'value_score_decision', plan: suggestedPlan }` — best-effort, matching every other `trackEvent` call site.
5. Response body: `{ shouldShow, suggestedPlan, reason }` — the raw score is never serialized into the response.

## 5. Testing

- `signals.ts` — a type-level/structural test that every entry has a positive `points` and a
  `cooldownDays` when (and only when) `kind: 'repeatable'`.
- `record.ts` — unit tests (mocked Prisma, following the `createNotification.test.ts` style):
  once-signal inserted exactly once across two calls; repeatable signal blocked inside the
  cooldown window and allowed after it; `profile.valueScore` increment matches the signal's
  points; a thrown Prisma error is caught and logged, never propagated.
- `paywall-decision.ts` — pure unit tests per funnel: below/at/above each threshold, and the
  goal-based branch selection.
- `recompute.ts` — extend the existing milestone tests to assert `FIRST_CYCLE_LOGGED` /
  `SECOND_CYCLE_LOGGED` fire at the right crossings (mirrors the current `third_cycle_completed`
  test).
- `GET /api/paywall/decision` route test — requireAuth enforcement, `already_subscribed` short
  circuit for non-FREE plans, shape of the JSON response, and that the response never contains
  a numeric score field.
