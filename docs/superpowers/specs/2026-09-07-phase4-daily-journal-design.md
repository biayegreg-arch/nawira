# Phase 4 — Daily Journal (E4) Design

**Status:** Approved by user, section-by-section, 2026-09-07.

## 1. Scope

PRD §6.3 (LOG01) and epic E4 describe a consolidated daily-entry screen
(saignement, douleur, humeur, énergie, sommeil, symptômes, glaire,
température, LH, note) plus "stockage local, sync" (offline-first with
sync).

This phase deliberately narrows that scope, matching the discipline
already established in Phase 3:

- **Online only.** No local write queue, no offline sync, no conflict
  resolution. The `/app/log` form calls the API directly; a failed
  request surfaces an error and the user retries — identical to every
  other mutating screen in the app today. Full offline support is a
  separate, larger effort to spec later if actually needed.
- **Today only.** A `DailyLog` entry can only be created/edited for the
  current date — no backfilling past days, no date picker. This matches
  the existing `PeriodEvent` logging CTA (Phase 3), which is also
  today-only, and avoids the correctness risk of retroactively editing
  data that historical cycle computations may already depend on.
- **No fertility fields.** Glaire (cervical mucus), température (BBT),
  and LH (ovulation test) are excluded — they belong to E5 (fertility),
  already out of scope project-wide until that epic is explicitly
  requested. The `DailyLog` Prisma model (shipped in Phase 1) already
  reflects this: it has no fields for any of the three.
- **No deletion path.** `PUT /api/daily-logs/today` and the flow
  integration (below) both correct/replace values but cannot fully
  *remove* a previously-logged flow or `DailyLog` entry. Confirmed
  acceptable with the user: correcting a mistaken value (e.g. HEAVY →
  LIGHT) already works via upsert; only "un-log everything for today"
  is unsupported, and building that safely would require revisiting
  cycle recomputation — out of scope for this phase.

## 2. Data model

**No schema changes.** `DailyLog` and `SymptomLog` (added in Phase 1,
currently unused by any route) already match this scope exactly:

```prisma
model DailyLog {
  id           String       @id @default(cuid())
  userId       String
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  date         DateTime     @db.Date
  painLevel    Int?
  painLocation String?
  mood         String? // VERY_GOOD | GOOD | TIRED | STRESSED | LOW
  energy       String? // VERY_LOW | LOW | MEDIUM | HIGH | VERY_HIGH
  sleepQuality String? // POOR | FAIR | GOOD | EXCELLENT
  sleepHours   Float?
  note         String?
  symptoms     SymptomLog[]

  @@unique([userId, date])
}

model SymptomLog {
  id         String   @id @default(cuid())
  dailyLogId String
  dailyLog   DailyLog @relation(fields: [dailyLogId], references: [id], onDelete: Cascade)
  symptom    String // CRAMPS | HEADACHE | BLOATING | NAUSEA | ACNE | TENDER_BREASTS | FATIGUE | BACK_PAIN | CONSTIPATION | DIARRHEA | FOOD_CRAVINGS | LIBIDO_CHANGE

  @@unique([dailyLogId, symptom])
}
```

`painLocation` is deliberately free text (`String?`, no inline enum
comment, unlike every other enum-like field on this model) — honored as
open text in the API, not forced into an invented enum.

## 3. API

New file: `frontend/src/app/api/daily-logs/today/route.ts`. Follows the
same conventions as `period-events`/`profile`: `export const runtime =
'nodejs'`, `requireAuth`, `verifyCsrf` on the mutating verb, the
`PROFILE_NOT_FOUND` 404 consent-gate (writing health data requires a
completed onboarding, same reasoning as `period-events`).

### `GET /api/daily-logs/today`

No CSRF (safe method). Reads today's `DailyLog` + its `SymptomLog`
children for the authenticated user.

Response:
```ts
{
  log: {
    painLevel: number | null;
    painLocation: string | null;
    mood: string | null;
    energy: string | null;
    sleepQuality: string | null;
    sleepHours: number | null;
    note: string | null;
    symptoms: string[];
  } | null; // null = no entry logged yet today — a normal 200, not an error
}
```

### `PUT /api/daily-logs/today`

Full-replace upsert — every field is required-but-nullable in the body
(no partial-patch semantics; the `/app/log` form always submits the
complete current state of the whole form in one save, so there is no
"field omitted vs field cleared" ambiguity to design around).

Request body (Zod):
```ts
const Body = z.object({
  painLevel: z.number().int().min(0).max(10).nullable(),
  painLocation: z.string().max(100).nullable(),
  mood: z.enum(['VERY_GOOD', 'GOOD', 'TIRED', 'STRESSED', 'LOW']).nullable(),
  energy: z.enum(['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']).nullable(),
  sleepQuality: z.enum(['POOR', 'FAIR', 'GOOD', 'EXCELLENT']).nullable(),
  sleepHours: z.number().min(0).max(24).nullable(),
  note: z.string().max(1000).nullable(),
  symptoms: z.array(
    z.enum([
      'CRAMPS', 'HEADACHE', 'BLOATING', 'NAUSEA', 'ACNE', 'TENDER_BREASTS',
      'FATIGUE', 'BACK_PAIN', 'CONSTIPATION', 'DIARRHEA', 'FOOD_CRAVINGS',
      'LIBIDO_CHANGE',
    ]),
  ),
});
```

Handler, inside one `prisma.$transaction`:
1. `dailyLog.upsert` on `userId_date` with the scalar fields.
2. `symptomLog.deleteMany({ where: { dailyLogId } })` then
   `symptomLog.createMany` from the submitted `symptoms` array,
   **deduplicated first** (`[...new Set(symptoms)]`) — `SymptomLog` has
   `@@unique([dailyLogId, symptom])`, so a client sending the same
   value twice would otherwise crash `createMany` with an unhandled
   Prisma constraint error instead of a clean response. Deduping is
   more forgiving than rejecting: a duplicate selection is a harmless
   client-side possibility (e.g. a double-tap on a chip before its
   `disabled` state applies), not something worth a 400 for.

**No call to `recomputeCyclesAndPrediction`.** `DailyLog` is completely
independent of cycle computation — this route stays isolated from the
Phase 3 cycle logic, which remains `PeriodEvent`-driven only.

Response: `{ ok: true }` on 200. Errors: `PROFILE_NOT_FOUND` (404),
`VALIDATION_FAILED` (400, invalid enum/out-of-range value or malformed
JSON — same empty-body-ok-but-malformed-body-400 handling as
`period-events`), CSRF failure (403).

### Flow (bleeding) integration — no new endpoint

`/app/log`'s flow selector (Aucun/Spotting/Léger/Moyen/Abondant) is a
second, independent call to the *existing* `POST /api/period-events`
(unchanged) — made only when the user picks something other than
"Aucun" (that endpoint's enum has no `NONE` value; "Aucun" simply means
"don't call it"). The client makes two separate requests on submit
(`PUT /api/daily-logs/today` + optionally `POST /api/period-events`),
not one combined atomic call — this keeps the already-reviewed,
protected-by-precedent `period-events` transaction completely untouched.

## 4. UI — `/app/log`

Route already linked from `MobileBottomNav` ("Saisir") and `AppSidebar`
("Ajouter des données") — no new navigation entry point needed.

- **Fields**: flow selector (1-tap), pain (0–10 slider + free-text
  location), mood (1-tap, 5 states), energy (1-tap, 5 levels), sleep
  (quality chips + optional hours), symptoms (multi-select chips), note
  (optional text). No cervical-mucus/temperature/LH fields.
- **Load**: `GET /api/daily-logs/today` pre-fills the form if an entry
  already exists today (edit, not re-create).
- **Submit**: one "Enregistrer" button triggers `PUT
  /api/daily-logs/today` and, if a non-"Aucun" flow is selected, `POST
  /api/period-events` alongside it. Success/error toast; no automatic
  redirect (the user may want to review what they just saved).
- **States**: loading skeleton, network-error banner. No real "empty"
  state — the form always renders, just with blank fields when nothing
  is logged yet.

Exact Banani screen structure (source: `AddData` / `DataEntryForm`) to
be fetched and translated during the `banani-design-implementation`
implementation pass, following this spec's field/behavior contract.

## 5. Testing

`frontend/src/app/api/daily-logs/today/route.test.ts` (Vitest +
`prismaMock`, mirroring `period-events/route.test.ts` and
`profile/route.test.ts`):

- `GET`: `{ log: null }` when nothing logged today; correct field +
  `symptoms` mapping when an entry exists; 401 when unauthenticated.
- `PUT`: creates a new `DailyLog` row when none exists for today; a
  second call the same day updates the existing row (no duplicate,
  consistent with `@@unique([userId, date])`); `SymptomLog` rows are
  fully replaced (old removed, new added) on a second call with a
  different symptom list; 404 `PROFILE_NOT_FOUND` when no profile
  exists; 400 `VALIDATION_FAILED` on an invalid enum value (`mood`,
  `energy`, `sleepQuality`, `symptoms`) and on out-of-range
  `painLevel`/`sleepHours`; a duplicate value in `symptoms` is
  deduplicated rather than rejected (no `VALIDATION_FAILED`, no crash);
  403 when CSRF fails.

No separate end-to-end integration test (matching Phase 3's precedent —
`pnpm smoke:auth` remains the project's only manual UAT script); a real
visual verification in a running dev session follows once the screen is
built, matching every prior Banani implementation pass.
