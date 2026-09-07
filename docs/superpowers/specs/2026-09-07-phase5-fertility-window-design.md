# Phase 5 — Projet Bébé / Fenêtre fertile (E5) Design

**Status:** Approved by user, section-by-section, 2026-09-07.

## 1. Scope

PRD §8 ("Moteur fertilité/ovulation v1") splits this epic into two layers.
This phase builds both, with the signal-adjustment rule engine explicitly
deferred, and no subscription/entitlement gate:

- **Layer 1 — Fenêtre fertile / ovulation estimée (Free tier per PRD
  §8.1).** Computed purely from the existing period-prediction output
  (`Prediction.expectedPeriodStart`) — no new user input required. Uses
  the standard calendar/luteal-phase back-calculation method (§3 below),
  the same approach used by every mainstream period-tracking app. Reuses
  the period prediction's existing confidence tier — no separate
  confidence calculation.
- **Layer 2 — Signaux Glaire/Température/LH (`Projet Bébé` per PRD
  §8.2).** Recording and history only. The PRD is explicit that the rule
  engine which adjusts confidence/window from these signals is a future,
  clinically-validated addition ("prévoir un moteur de règles séparé et
  versionné pour permettre une validation clinique future") — not
  something to invent here. This phase stores the signals faithfully but
  does **not** feed them into `computeFertilityWindow()` or
  `computePrediction()`.
- **No paywall enforcement.** No `Subscription`/entitlement model exists
  yet anywhere in the codebase (E7, not built) — nothing in the app is
  currently gated. `FertilitySignal` and its route are built fully
  accessible, matching the rest of the app's current state. This is a
  deliberate, temporary decision to revisit when E7 ships subscriptions;
  it is not an oversight.
- **UI deferred**, matching the Phase 3/4 precedent: this phase is
  backend-only. `/app/log`'s 3 new optional sections, `/app/calendar`'s
  new day-type/legend entries, and the new `/app/baby` screen (Banani
  source `ProjetBebe`) are a separate `banani-design-implementation`
  pass after this backend ships.

## 2. Data model

**`FertilitySignal` already exists and is already migrated** — shipped
in Phase 1, unused until now (`User.fertilitySignals FertilitySignal[]`
is likewise already declared). This phase does **not** invent a new
model; it makes one targeted addition to the existing one:

```prisma
model FertilitySignal {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  date              DateTime @db.Date
  type              String // BASAL_TEMPERATURE | CERVICAL_MUCUS | LH_TEST
  temperatureValue  Float?
  temperatureUnit   String? // CELSIUS | FAHRENHEIT
  cervicalMucusType String? // DRY | STICKY | CREAMY | WATERY | EGG_WHITE
  lhResult          String? // NEGATIVE | POSITIVE | PEAK | INCONCLUSIVE

  @@unique([userId, date, type]) // was: @@index([userId, date]) — added this phase
}
```

Unlike a flat "one row per day combining all 3 signals" shape (which is
what the PRD's §14 table literally lists, and what an earlier draft of
this spec proposed before this divergence was caught against the real
schema), the already-shipped design is **normalized: up to 3 rows per
user per day**, one per signal type, discriminated by `type`. This phase
adds `@@unique([userId, date, type])` (replacing the existing plain
`@@index([userId, date])`, which the unique constraint's leading columns
already subsume for query purposes) — required to `upsert` per type in
§5 below. No other schema change; the model's existing fields, `type`
enum, and `User` relation are used exactly as already defined.

**No changes needed to `Prediction`** — `ovulationEstimate`,
`fertileWindowStart`, `fertileWindowEnd` already exist on the model
(shipped Phase 1, unused until now). `GET /api/predictions/current`'s own
code comment already flags this as "E5, later."

## 3. Algorithm — fenêtre fertile / ovulation

New file `frontend/src/lib/server/cycles/fertility-window.ts`:

```ts
import 'server-only';
import { addDays } from './date-utils';
import type { PredictionResult } from './prediction';

const LUTEAL_PHASE_DAYS = 14;
const FERTILE_WINDOW_BEFORE_OVULATION_DAYS = 5;
const FERTILE_WINDOW_AFTER_OVULATION_DAYS = 1;

export interface FertilityWindowResult {
  ovulationEstimate: Date;
  fertileWindowStart: Date;
  fertileWindowEnd: Date;
}

/**
 * Standard calendar/luteal-phase back-calculation: ovulation is estimated
 * as `LUTEAL_PHASE_DAYS` before the next predicted period start, NOT a
 * fixed "day 14 of the cycle" (PRD §8.1 explicitly forbids that
 * generalization — a 26-day and a 32-day cycle get different ovulation
 * days here because `expectedPeriodStart` differs, even though the
 * luteal-phase constant itself does not). The luteal phase (post-
 * ovulation) is clinically far more stable across women than the
 * follicular phase (pre-ovulation), which is why this direction of
 * back-calculation is the standard approach.
 *
 * Returns `null` when `prediction` is `null` — PRD §8.1: "uniquement si
 * le cycle attendu est calculable."
 */
export function computeFertilityWindow(
  prediction: PredictionResult | null,
): FertilityWindowResult | null {
  if (!prediction) return null;

  const ovulationEstimate = addDays(prediction.expectedPeriodStart, -LUTEAL_PHASE_DAYS);

  return {
    ovulationEstimate,
    fertileWindowStart: addDays(ovulationEstimate, -FERTILE_WINDOW_BEFORE_OVULATION_DAYS),
    fertileWindowEnd: addDays(ovulationEstimate, FERTILE_WINDOW_AFTER_OVULATION_DAYS),
  };
}
```

Confidence is **not** recalculated — the caller (`recompute.ts`) reuses
`prediction.confidence` as-is for the whole `Prediction` row, satisfying
PRD §8.1's "afficher confiance faible si peu d'historique ou forte
variabilité" (that rule already drives `computePrediction()`'s existing
confidence tier).

`algorithmVersion` stays unchanged (`'v1'`) — the period-prediction math
itself is untouched; the fertility fields are purely additive outputs.
No new versioning is introduced this phase (no consumer needs it yet).

## 4. `recompute.ts` changes

`frontend/src/lib/server/cycles/recompute.ts` (protected file — this is
a targeted, minimal extension, not a rewrite):

- Import `computeFertilityWindow` from the new file.
- After computing `prediction`, compute
  `const fertilityWindow = computeFertilityWindow(prediction);`.
- Add 3 fields to both the `create` and `update` blocks of the existing
  `tx.prediction.upsert` call:
  ```ts
  ovulationEstimate: fertilityWindow?.ovulationEstimate ?? null,
  fertileWindowStart: fertilityWindow?.fertileWindowStart ?? null,
  fertileWindowEnd: fertilityWindow?.fertileWindowEnd ?? null,
  ```
- No other change. The existing `if (prediction) { upsert } else { deleteMany }`
  branching is untouched — when `prediction` is `null`,
  `fertilityWindow` is also `null` (by construction) and the whole row
  (period + fertility fields together) is deleted, exactly as today.

Per CLAUDE.md, this file is in the protected list — flag the change
before editing ("I am about to modify `recompute.ts` because it's the
single call site that writes `Prediction` rows, to add 3 already-reserved
nullable columns — confirm?") even though this spec has already been
user-approved; the plan's task brief will carry this note forward for the
implementer.

## 5. API

### `GET /api/predictions/current` (existing route, extended)

Remove the "intentionally omitted... E5, later" comment; add the 3
fields to the response when a prediction exists:

```ts
{
  prediction: {
    confidence, expectedPeriodStart, expectedPeriodEnd, algorithmVersion, computedAt,
    ovulationEstimate: string | null,   // YYYY-MM-DD, new
    fertileWindowStart: string | null,  // YYYY-MM-DD, new
    fertileWindowEnd: string | null,    // YYYY-MM-DD, new
  } | null;
}
```

All 3 new fields are `null` together whenever the underlying `Prediction`
row has them null (i.e., whenever `computeFertilityWindow` returned
`null` — which only happens when there's no prediction at all, so in
practice these are non-null whenever `prediction` itself is non-null).

### `GET`/`PUT /api/fertility-signals/today` (new file)

New file `frontend/src/app/api/fertility-signals/today/route.ts`,
following the same conventions as `daily-logs/today`: `export const
runtime = 'nodejs'`, `requireAuth`, `verifyCsrf` on PUT only,
`PROFILE_NOT_FOUND` 404 gate on PUT (writing health data requires
completed onboarding), `makeRequestContext`/`withRequestContext`, local
`jsonError` helper, malformed-vs-empty-body handling via `req.text()` +
conditional `JSON.parse`. The client-facing shape stays flat (one form,
3 optional signal groups) — the route internally maps that flat shape
onto up to 3 `FertilitySignal` rows (one per `type`), keeping the
normalized-row storage model entirely behind the route.

```ts
const Body = z
  .object({
    temperatureValue: z.number().nullable(),
    temperatureUnit: z.enum(['CELSIUS', 'FAHRENHEIT']).nullable(),
    cervicalMucusType: z.enum(['DRY', 'STICKY', 'CREAMY', 'WATERY', 'EGG_WHITE']).nullable(),
    lhResult: z.enum(['NEGATIVE', 'POSITIVE', 'PEAK', 'INCONCLUSIVE']).nullable(),
  })
  .refine((b) => (b.temperatureValue === null) === (b.temperatureUnit === null), {
    message: 'temperatureValue and temperatureUnit must be both set or both null',
  })
  .refine(
    (b) =>
      b.temperatureValue === null ||
      b.temperatureUnit === null ||
      (b.temperatureUnit === 'CELSIUS'
        ? b.temperatureValue >= 34 && b.temperatureValue <= 42
        : b.temperatureValue >= 93 && b.temperatureValue <= 108),
    { message: 'temperatureValue out of plausible range for the given unit' },
  );
```

**`GET`** (no CSRF): reads all of today's `FertilitySignal` rows for the
authenticated user (`findMany({ where: { userId, date: today } })` — at
most 3 rows) and folds them into one flat object keyed by `type`.

```ts
{
  signal: {
    temperatureValue: number | null;
    temperatureUnit: string | null;
    cervicalMucusType: string | null;
    lhResult: string | null;
  } | null; // null = no rows at all for today — normal 200
}
```

**`PUT`**: inside one `prisma.$transaction`, handles each of the 3 types
independently — a value present in the body upserts that type's row
(`where: { userId_date_type: { userId, date: today, type } }`); a `null`
value deletes that type's row if one exists (`deleteMany`), keeping the
store normalized rather than persisting all-null rows. This is *not* a
single-row full-replace upsert like `daily-logs/today` — it is 3
independent per-type upserts-or-deletes, each keyed off its own slice of
the body:

- `temperatureValue`/`temperatureUnit` (both non-null together, per the
  Zod refine above) → upsert/delete the `BASAL_TEMPERATURE` row.
- `cervicalMucusType` → upsert/delete the `CERVICAL_MUCUS` row.
- `lhResult` → upsert/delete the `LH_TEST` row.

**No call to `recomputeCyclesAndPrediction`** — signals do not feed the
prediction engine this phase (§1). Response `{ ok: true }` on 200.
Errors: `PROFILE_NOT_FOUND` (404), `VALIDATION_FAILED` (400 — invalid
enum, out-of-range `temperatureValue`, `temperatureValue`/`temperatureUnit`
mismatch, or malformed JSON), CSRF failure (403).

## 6. UI (deferred to a separate `banani-design-implementation` pass)

Not built this phase — listed here so the plan's scope boundary is
explicit and the follow-up pass has a starting brief:

- `/app/log`: 3 new optional sections (Glaire/Température/LH), collapsed
  by default so the form stays fast for users not tracking fertility
  (PRD §6.3's "≤10 secondes" UX criterion for a simple entry).
- `/app/calendar`: new day-type(s) for fertile window / ovulation +
  legend entries — `CalendarDayType` and `buildDayTypes()` currently only
  cover `observed`/`predicted`/`today`.
- `/app/baby`: new screen, Banani source `ProjetBebe` (composes
  `FertilityWindowCard`, `ConceptionTipsCard`, `LHTestTracker`,
  `ConceptionStatistics`). Educational content must be verified for
  medical accuracy before shipping, not copied verbatim from Banani —
  same discipline already applied to `HelpCenter`'s FAQ content.
- No subscription/tier gate anywhere in this UI either, consistent with
  §1.

## 7. Testing

- `fertility-window.test.ts` (new, pure function): regular cycle,
  short/long cycle length, `prediction === null` → `null`.
- `recompute.test.ts` (extended): asserts the 3 new fields land correctly
  on the `Prediction` row after a `PeriodEvent` write, and are absent
  (row deleted) when no prediction is computable — same as today.
- `predictions/current/route.test.ts` (extended): asserts the 3 new
  fields appear correctly in the response shape.
- `fertility-signals/today/route.test.ts` (new, structure mirrors
  `daily-logs/today/route.test.ts` but covers the 3-independent-rows
  logic instead of one flat row): `GET` no rows/1 row/all 3
  rows/401; `PUT` creates a type's row when its value is set, updates it
  on a second call, deletes it when the value is cleared to `null`,
  handles all 3 types independently in one call, 404
  `PROFILE_NOT_FOUND`, 400 invalid enum, 400 out-of-range
  `temperatureValue`, 400 `temperatureValue` without `temperatureUnit`,
  400 malformed JSON, 403 CSRF failure.

No end-to-end integration test (matching Phase 3/4 precedent); a real
browser verification follows once the UI pass ships.
