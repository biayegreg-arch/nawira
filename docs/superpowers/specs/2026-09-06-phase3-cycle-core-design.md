# Phase 3 — NAWIRA cycle core (PRD epic E3): prediction engine + Home/Calendar

Status: approved by user 2026-09-06, ready for implementation planning.
Scope: this document covers **Phase 3 = PRD epic E3 ("Cycle core") only** —
règles, cycles, calendrier, moteur de prédiction des règles v1. It builds
on `docs/superpowers/specs/2026-09-06-phase1-data-model-design.md` (schema:
`PeriodEvent`, `Cycle`, `Prediction`) and
`docs/superpowers/specs/2026-09-06-phase2-onboarding-design.md` (the
`Profile` fields and the one `PeriodEvent` row onboarding may already have
written from `lastPeriodDate`).

**Explicitly out of scope, deferred to later phases:**
- **E5 (Fertility engine)** — `Prediction.ovulationEstimate`,
  `fertileWindowStart`, `fertileWindowEnd` stay `null` always in this
  phase. The HOME01 fertility block from the PRD is omitted entirely (not
  even a placeholder).
- **E6 (Insights / Cycle Score)** — no `Insight` rows are created or read
  in this phase.
- **E4 (Journal & offline)** — no full daily-log UI (mood/pain/sleep/etc).
  This phase adds exactly one minimal logging action: a "Mes règles ont
  commencé" CTA that writes a single `PeriodEvent` for today. Editing or
  deleting past `PeriodEvent`/`Cycle` rows is not built here — the
  Calendar is **read-only**.
- **Outlier confirmation UI** — `Cycle.isOutlier` is set by the algorithm
  and visible in the calendar's data, but there is no user-facing "is this
  cycle correct?" confirmation flow in this phase.

## Context

Phase 1 already defined `PeriodEvent` (one row per day with a `flow`),
`Cycle` (derived, one row per completed or open cycle), and `Prediction`
(one row per user, `userId` is the primary key) in the schema. Phase 2's
onboarding may have already created a single `PeriodEvent` row (from
`lastPeriodDate`, defaulted to `flow: 'MEDIUM'`) but built nothing that
reads `PeriodEvent`, writes `Cycle`, or computes a `Prediction`. Phase 3
is that missing engine, plus the two screens that consume it:
`/app/today` (Home) and `/app/calendar`, both of which currently 404 (a
known, already-accepted temporary state per Phase 2's spec).

`.planning/banani/STATUS.md` confirms both `DashboardAujourdhui`
(`/app/today`) and `Calendar` (`/app/calendar`) exist as fetchable Banani
screens explicitly marked "needs Phase 1-3" — implementation of the pixel
design happens via the `banani-design-implementation` skill, in a
follow-up step after this backend spec/plan is implemented.

Source of truth for behavior requirements:
`NAWIRA_PRD_WEB_APP_PWA_v2.0.md` §6 (Home/Calendar screen specs), §7
(cycle engine rules v1), §14 (data model reference), §15 (API contract
v1), referenced by section number throughout.

## Decisions locked in during brainstorming

1. **Event-driven, materialized computation — no cron, no outbox.**
   Every write to `PeriodEvent` (via the new logging endpoint, or via
   onboarding) synchronously triggers a recompute of that user's `Cycle`
   rows and `Prediction` row, inside the same Prisma transaction as the
   write. `GET` endpoints only ever read stored rows. This is fast,
   deterministic, in-request math — no background job infrastructure is
   justified for per-user data of this size.
2. **Episode-grouping cycle detection.** `PeriodEvent` rows are grouped
   into contiguous-date "episodes" (a gap of more than 1 day starts a new
   episode). Each consecutive pair of episode starts becomes a `Cycle`
   row; the most recent episode is always an **open** `Cycle`
   (`endDate`/`length` left `null`) representing the in-progress cycle.
   This is exactly the PRD's "0 cycles complets" case when only one
   episode is known.
3. **Outlier threshold is a versioned, undocumented-in-PRD design
   decision.** The PRD names the concept ("valeur aberrante") but not a
   number. This spec fixes it at `|length − médiane(autres)| >
   max(7, 0.3 × médiane)`, computed only once ≥3 complete cycles exist,
   and records the choice via `Prediction.algorithmVersion` so it can be
   retuned later without invalidating already-computed predictions.
   Outlier cycles are never deleted, never excluded from the
   calendar/history — only excluded from the prediction's average/median
   and flagged `isOutlier: true`.
4. **Confidence thresholds are similarly versioned design decisions,**
   resolving the PRD's fuzzy §7.3 language ("faible à moyenne", etc.)
   into concrete coefficient-of-variation (CV) cutoffs: CV < 0.15 →
   upgrade eligible; CV > 0.30 → force `LOW` regardless of cycle count.
   See the algorithm table below for the full mapping.
5. **All 4 tiers of §7.2 ship in this phase** (0 / 1-2 / 3-5 / ≥6 complete
   cycles) — not built incrementally across future phases.
6. **The Home fertility block is omitted entirely**, not stubbed —
   `Prediction`'s fertility fields exist in the schema (from Phase 1) but
   stay `null` until E5.
7. **Calendar is read-only in this phase.** No edit/delete UI for past
   `PeriodEvent`/`Cycle` rows (deferred, likely to E4 alongside the full
   journal).
8. **`recomputeCyclesAndPrediction` is one shared function**, called from
   both the new period-logging endpoint and (as a small addition) from
   `POST /api/onboarding/complete`, so a user who declared
   `lastPeriodDate` + `usualCycleLength` at onboarding gets an immediate
   `Prediction` without waiting for a second real cycle.

## Cycle-detection algorithm

Input: all of a user's `PeriodEvent` rows, sorted by `date` ascending.

1. Group into **episodes**: consecutive dates (gap of exactly 1 day)
   belong to the same episode; a gap of more than 1 day starts a new
   episode. An episode's start = its earliest date.
2. For each consecutive pair of episode starts (episode *i*, episode
   *i+1*), upsert a `Cycle` row (unique on `[userId, startDate]`, so
   re-running this after a new `PeriodEvent` is idempotent):
   - `startDate` = start of episode *i*
   - `endDate` = (start of episode *i+1*) − 1 day
   - `length` = number of days between the two starts
3. The **most recent episode** (the one with no following episode)
   becomes an **open** `Cycle`: `startDate` set, `endDate`/`length` =
   `null`. This is the in-progress cycle. If there is only one episode
   total, this is the entire result (the PRD's "0 cycles complets" case).
4. **Outlier detection** — only runs when ≥3 **complete** cycles exist
   (open cycle excluded). A complete cycle is marked
   `isOutlier: true` if `|length − médiane(other complete lengths)| >
   max(7, 0.3 × médiane)`. Never deleted; always visible in
   history/calendar; excluded from Prediction's weighted
   average/median and from the confidence CV calculation.

## Prediction algorithm and confidence rules

Computed on **complete** cycles only (open cycle excluded), non-outlier
cycles only for the averages/CV below.

| Cycles complets | Durée de cycle estimée | Confiance de base |
|---|---|---|
| 0 | `Profile.usualCycleLength` if declared; otherwise **no `Prediction` row is created/updated at all** (delete any existing row if this state is reached — should not normally happen since a row only ever exists once a length is known) | LOW (only if a row is computed) |
| 1–2 | Simple average of lengths | LOW |
| 3–5 | Weighted average, outliers excluded, with linearly increasing weights: the oldest of the *n* considered cycles gets weight 1, the next gets weight 2, ..., the most recent gets weight *n* (e.g. for 4 cycles, weights 1/2/3/4, divided by their sum) | MEDIUM if CV < 0.15, else LOW |
| ≥6 | Sliding window of the last 6 complete cycles, median (not mean), outliers excluded | HIGH if CV < 0.15 **and** ≤1 outlier in the window, else MEDIUM |

**Override, applied after the table above:** if CV > 0.30 across the
considered window, force confidence to `LOW` regardless of cycle count.

CV = standard deviation / mean of the considered (non-outlier) cycle
lengths in the window used for that tier.

Once a cycle-length estimate and confidence are determined:
- `expectedPeriodStart` = most recent episode start + estimated cycle
  length
- period-length estimate = `Profile.usualPeriodLength` if declared, else
  median of observed episode lengths, else a documented default of 5
  days
- `expectedPeriodEnd` = `expectedPeriodStart` + period-length estimate −
  1 day
- `ovulationEstimate`, `fertileWindowStart`, `fertileWindowEnd` = always
  `null` in this phase (E5)
- `algorithmVersion` = a version string constant for this implementation
  (e.g. `"v1"`), bumped whenever the outlier/confidence thresholds above
  are retuned
- `computedAt` = now

These numeric thresholds (CV 0.15/0.30, 6-cycle window, 5-day default
period length, 7-day/30% outlier bound) are this spec's own proposals,
not PRD-specified values — versioned via `algorithmVersion` for future
recalibration without invalidating past predictions.

## Data flow and shared function

**`recomputeCyclesAndPrediction(tx: Prisma.TransactionClient, userId: string): Promise<void>`**

Called inside the same transaction as any `PeriodEvent` write. Steps:
1. Read all `PeriodEvent` rows for `userId`, sorted by `date`.
2. Run the cycle-detection algorithm above; upsert all resulting `Cycle`
   rows (including the open one).
3. Run the prediction algorithm above on the resulting complete,
   non-outlier `Cycle` rows.
4. If a prediction can be computed (cycle-length estimate available):
   upsert the single `Prediction` row (`userId` is the primary key).
   Otherwise: delete any existing `Prediction` row for this user (handles
   the theoretical case of a prediction becoming un-computable, though
   this should not occur in normal use since data is only ever added,
   never removed, in this phase).

Returns nothing — callers that need the fresh state re-read it via the
`GET` endpoints below (or, within the same request, via their own
follow-up query if they need to build a response body).

## API endpoints

### `POST /api/period-events` (new)

The minimal "Mes règles ont commencé" logging CTA. `requireAuth` +
`verifyCsrf`. Body (Zod-validated, all optional):

```ts
{
  flow?: 'SPOTTING' | 'LIGHT' | 'MEDIUM' | 'HEAVY', // default 'MEDIUM'
}
```

The date is always **today** — no free-date entry in this phase (that is
the full journal, E4). Server-side, in one Prisma transaction:
1. Upsert `PeriodEvent` on `[userId, date=today]` — if a row already
   exists for today, update its `flow` rather than erroring or creating a
   duplicate (idempotent against a double-tap, which would otherwise
   corrupt episode grouping).
2. Call `recomputeCyclesAndPrediction(tx, userId)`.
3. Return `{ ok: true }`.

### `GET /api/cycles` (new)

`requireAuth`. Returns all of the caller's `Cycle` rows, sorted
`startDate desc`:

```ts
{
  cycles: Array<{
    startDate: string;   // ISO date
    endDate: string | null;
    length: number | null;
    isOutlier: boolean;
  }>;
  todayLogged: boolean; // true if a PeriodEvent row exists for today
}
```

No pagination in v1 — a user's cycle history is a few dozen rows even
after years of use; the Calendar filters by month client-side.
`todayLogged` is computed with one extra `PeriodEvent` lookup
(`findUnique` on `[userId, date=today]`) alongside the `Cycle` query —
this is the one piece of server state the Home screen's logging CTA
needs and there is no other endpoint that already surfaces it, so it is
added here rather than introducing a dedicated endpoint for a single
boolean.

### `GET /api/predictions/current` (new)

`requireAuth`. Returns the caller's single `Prediction` row, or `null`
(this is a normal, expected state — not an error):

```ts
{
  prediction: {
    confidence: 'LOW' | 'MEDIUM' | 'HIGH';
    expectedPeriodStart: string; // ISO date
    expectedPeriodEnd: string;   // ISO date
    algorithmVersion: string;
    computedAt: string;          // ISO datetime
  } | null
}
```

`ovulationEstimate`/`fertileWindowStart`/`fertileWindowEnd` are
intentionally omitted from this response shape in this phase (always
`null` server-side; no reason to expose nullable fertility fields to a
client that has no fertility UI yet — E5 extends this response shape
when it lands).

### `POST /api/onboarding/complete` (existing, Phase 2 — small addition)

No change to its request/response contract. Addition: after creating the
optional `PeriodEvent` row (when `lastPeriodDate` is non-null), call
`recomputeCyclesAndPrediction(tx, userId)` in the **same transaction**
before committing. This means a user who also declared
`usualCycleLength` at onboarding gets an immediate `Prediction` (the
"0 complete cycles, but a declared length exists" branch of the table
above) without waiting for a second real period.

## UI page scope

Pixel implementation for both screens happens via the
`banani-design-implementation` skill against the already-fetched
`DashboardAujourdhui` and `Calendar` Banani screens, in a follow-up step
after this spec's backend is implemented. This section defines what data
and interactions each screen must support — not its visual layout.

### `/app/today` (Home)

- **Current-cycle block**: current cycle day (today − most recent episode
  start + 1), and whether the user is currently inside a period episode.
- **Prediction block**: if `GET /api/predictions/current` returns a
  prediction, show the estimated next-period date with a
  confidence-appropriate label (e.g. LOW → "estimation approximative").
  If `null`, show an empty-state message inviting continued tracking —
  not an error state.
- **Logging CTA**: "Mes règles ont commencé" shown only if
  `GET /api/cycles`'s `todayLogged` is `false`. If `true`, show a neutral
  "Jour 1 de tes règles" state instead of the button, to avoid a second
  tap re-opening idempotency questions in the UI itself.
- Link to `/app/calendar`.
- **Omitted entirely**: fertility block (E5), Cycle Score/insights (E6),
  full daily journal (E4).

### `/app/calendar` (read-only)

- Month view with previous/next navigation.
- Marks days from `GET /api/cycles` (observed episodes, current open
  cycle) and `GET /api/predictions/current` (predicted next period, when
  available), with a legend distinguishing observed vs. predicted.
- No fertility window shown (E5, deferred).
- No edit/delete interaction on any day — read-only per the confirmed
  decision.

## Testing

Following this repo's established Vitest conventions (see Phase 2's
`onboarding/complete` and `profile` route tests for the shape):

- **Episode-grouping** (pure function): no `PeriodEvent`s, one episode,
  multiple episodes with gaps, a single-day episode, two consecutive
  dates spanning a month boundary.
- **Prediction algorithm** (pure function): each of the 4 tiers (0/1-2/
  3-5/≥6 complete cycles), the CV confidence transitions (< 0.15,
  0.15-0.30, > 0.30 override), and outlier detection (`|length −
  median| > max(7, 0.3×median)`).
- **`recomputeCyclesAndPrediction`**: integration-style test against a
  real test database, inserting sequences of `PeriodEvent` rows and
  asserting the resulting `Cycle`/`Prediction` rows.
- **Routes**: `POST /api/period-events` (auth required, CSRF required,
  idempotent on a same-day double call, triggers recompute); `GET
  /api/cycles` (auth required, correct sort order); `GET
  /api/predictions/current` (auth required, `null` handled as a normal
  200 response, not an error).
- **Onboarding regression**: `POST /api/onboarding/complete` still
  creates its optional `PeriodEvent`, and now also triggers
  `recomputeCyclesAndPrediction` in the same transaction.
- **UI pages**: no component-test infrastructure exists in this repo
  (confirmed: no `.test.tsx` files for `signup`/`login`/`verify-email`
  in Phase 0-2) — manual browser verification at 375/768/1280px, per the
  established convention.

## What's explicitly out of scope for Phase 3

- Fertility engine (E5): ovulation/fertile-window computation, the
  regulatory-sensitive "safe days" framing the PRD explicitly warns
  against.
- Insights / Cycle Score (E6): no `Insight` rows.
- Full daily journal (E4): mood/pain/sleep/symptom logging, and any
  edit/delete of past `PeriodEvent`/`Cycle` rows.
- Outlier confirmation UI: `isOutlier` is computed and stored, never
  surfaced as a user-facing "confirm this is correct?" prompt in this
  phase.
