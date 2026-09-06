# Phase 1 — NAWIRA core data model

Status: approved by user 2026-09-06, ready for implementation planning.
Scope: this document covers **Phase 1 only** (the Prisma schema). Phase 2
(onboarding UI, OB01-11) and Phase 3 (cycle/fertility prediction engine,
Home/Calendar wiring) are separate, later brainstorm → spec → plan cycles
that build on top of this schema. Nothing here implements business logic —
Phase 1's job is the shape of the data, not the rules that populate it.

## Context

NAWIRA is a French-language menstrual-cycle/fertility PWA for Francophone
Africa (pilot: Sénégal), built on the `izikit` Next.js 16 monolith starter
(Prisma 5 + Neon). The starter ships only generic models (User, Order,
Withdrawal, admin/audit scaffolding, etc.) — no domain models for cycle
tracking exist yet. This spec adds them.

Source of truth for all field/behavior requirements below is
`NAWIRA_PRD_WEB_APP_PWA_v2.0.md`, referenced by section number throughout
(e.g. "§7.2").

## Decisions locked in during brainstorming

1. **Three-phase decomposition, one at a time.** Phase 1 = data model
   (this doc). Phase 2 = onboarding + Profile/Consent capture. Phase 3 =
   cycle/fertility engine (§7-8) + Home/Calendar wiring. Each gets its own
   spec → plan → implementation cycle; user confirmed this split
   explicitly rather than one combined spec for all three.
2. **Offline/IndexedDB sync is explicitly out of scope for Phase 1-3.**
   §28.5-6 describes a client-side PWA concern (IndexedDB, service worker,
   sync-state UI) layered on top of the same REST endpoints — it does not
   require uuid/clientVersion/syncState columns on the server schema. It
   maps to the PRD's own Epic E4 ("Journal & offline"), a separate epic
   from E3 ("Cycle core"), and was never part of how the user's own
   `STATUS.md` phase numbering referenced "Phase 1-3". Standard
   `id`/`createdAt`/`updatedAt` is sufficient here.
3. **Minimum age: 18+, adults only, for the pilot.** The PRD flags this as
   an explicitly open decision (§25). Allowing adolescents would require a
   parental-consent flow, additional `Consent` categories, and a dedicated
   legal review (GDPR Art. 8) before pilot launch — out of proportion for
   an MVP. `Profile.birthDate` is used to enforce this at signup/Phase 2
   (Phase 1 just stores the field).
4. **Materialize `Cycle` and `Prediction` as first-class tables**, rather
   than computing cycle boundaries and predictions on-the-fly on every
   read. Rejected the on-the-fly alternative because: (a) the PRD requires
   a queryable cycle history (`GET /cycles`, §15), (b) the confidence
   algorithm (§7.2) needs an efficient "last N cycles" windowed query, and
   (c) §8.2 explicitly requires retaining raw signals *and* the algorithm
   version used — an audit trail that's much harder to reconstruct if
   nothing is persisted. Phase 1 ships the empty tables; Phase 3 ships the
   logic that populates/recomputes them.

## Data model

All new models are user-owned (`userId String` referencing the existing
generic `User` model) — no multi-tenancy needed, consistent with
`CLAUDE.md`'s "default project surface stays user-owned" guidance. None of
this touches or renames the starter's generic models.

**Convention correction (caught while writing the implementation plan):**
the existing schema has zero native Prisma `enum` blocks — `User.role`,
`User.status`, `Order.status`, `Order.paymentMethod` etc. are all plain
`String` columns with a `@default(...)` and an inline comment listing
valid values, validated at the Zod/route layer rather than by Postgres.
Every "`X` enum" column below is implemented that same way: a `String`
field with a default and a `// VALUE_A | VALUE_B | ...` comment, **not**
a Prisma `enum` block. The semantic names (`Goal`, `ConsentType`, etc.)
below are just labels for this document — no such types exist in the
schema itself.

### `Profile` (1:1 with `User`)

| Field | Type | Notes |
|---|---|---|
| `userId` | `String @unique` | FK to `User.id` |
| `birthDate` | `DateTime` | Enforces 18+ at signup (Phase 2) |
| `goal` | `Goal` enum | `PERIOD_TRACKING` \| `UNDERSTAND_CYCLE` \| `TRYING_TO_CONCEIVE` — OB03, gates whether Projet Bébé fields appear |
| `usualCycleLength` | `Int?` | OB06 — nullable, "never impose 28" (§7.2) |
| `usualPeriodLength` | `Int?` | OB05 — nullable |
| `trackedConcerns` | `String[]` | OB07 opt-ins: douleur/humeur/fatigue/sommeil/SPM/irrégularité/ovulation |
| `plan` | `Plan` enum | `FREE` \| `PLUS` \| `BABY`, default `FREE` — stub only; full billing/entitlement enforcement is Phase 7, but Phase 3's engine needs this to gate Projet Bébé-only fields (§3.1 entitlements matrix) |
| `temperatureUnit` | `TemperatureUnit` enum | `CELSIUS` \| `FAHRENHEIT`, default `CELSIUS` — LOG01 |
| `createdAt` / `updatedAt` | `DateTime` | standard |

### `Consent`

One row per grant — **not** boolean flags on `Profile` — per §12's explicit
"granulaires et versionnés" requirement. A flags approach can't express
versioning (re-consent required when wording changes) or revocation
history.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id` | cuid |
| `userId` | `String` | FK |
| `type` | `ConsentType` enum | `ACCOUNT` \| `HEALTH_DATA` \| `ASSISTANT_HISTORY` \| `NOTIFICATIONS` \| `ANALYTICS` \| `MARKETING` — maps to PRD C01-C06 |
| `version` | `Int` | forces re-consent when wording changes |
| `grantedAt` | `DateTime` | |
| `revokedAt` | `DateTime?` | nullable |

Index: `@@index([userId, type])`.

### `PeriodEvent`

Raw source of truth — one row per bleeding day.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id` | cuid |
| `userId` | `String` | FK |
| `date` | `DateTime` | date-only in practice |
| `flow` | `FlowIntensity` enum | `SPOTTING` \| `LIGHT` \| `MEDIUM` \| `HEAVY` |

Unique: `@@unique([userId, date])`. `Cycle` rows are derived from
contiguous runs of these by Phase 3's logic.

### `Cycle`

One row per completed (or in-progress) cycle.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id` | cuid |
| `userId` | `String` | FK |
| `startDate` | `DateTime` | first day of period |
| `endDate` | `DateTime?` | null = current/ongoing cycle |
| `length` | `Int?` | computed once `endDate` known |
| `isOutlier` | `Boolean @default(false)` | §7.1 — "never silently exclude", flag instead |

Index: `@@index([userId, startDate])` (supports the "last N cycles"
windowed query from §7.2).

### `DailyLog`

One row per day — the LOG01 consolidated quick-entry screen.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id` | cuid |
| `userId` | `String` | FK |
| `date` | `DateTime` | |
| `painLevel` | `Int?` | 0-10 |
| `painLocation` | `String?` | |
| `mood` | `Mood?` enum | `VERY_GOOD` \| `GOOD` \| `TIRED` \| `STRESSED` \| `LOW` — matches the mood selector already fetched from Banani (`MoodSelector.jsx`: 😄 Très bien / 🙂 Bien / 😕 Fatiguée / 😟 Stressée / 😢 Humeur basse), so Phase 2/3 UI and this schema agree on the same 5 values |
| `energy` | `EnergyLevel?` enum | `VERY_LOW` \| `LOW` \| `MEDIUM` \| `HIGH` \| `VERY_HIGH` — PRD says "5 niveaux" without naming them; no Banani source fetched yet for this selector, so this is a placeholder taxonomy to confirm when that screen is built |
| `sleepQuality` | `SleepQuality?` enum | `POOR` \| `FAIR` \| `GOOD` \| `EXCELLENT` — PRD says "qualité + durée facultative" without enumerating values; same caveat as `energy` above |
| `sleepHours` | `Float?` | |
| `note` | `String?` | free text |

Unique: `@@unique([userId, date])`.

### `SymptomLog`

Many rows per day — the LOG01 multi-select chips.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id` | cuid |
| `dailyLogId` | `String` | FK to `DailyLog` |
| `symptom` | `SymptomType` enum | starter catalog below |

`SymptomType` starter catalog (extensible later via migration —
not exhaustive, matches common period-tracker taxonomies since the PRD
itself doesn't enumerate an exact list): `CRAMPS`, `HEADACHE`, `BLOATING`,
`NAUSEA`, `ACNE`, `TENDER_BREASTS`, `FATIGUE`, `BACK_PAIN`,
`CONSTIPATION`, `DIARRHEA`, `FOOD_CRAVINGS`, `LIBIDO_CHANGE`.

### `FertilitySignal`

Projet Bébé only. Many rows per day possible (temperature can be logged
multiple times).

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id` | cuid |
| `userId` | `String` | FK |
| `date` | `DateTime` | |
| `type` | `FertilitySignalType` enum | `BASAL_TEMPERATURE` \| `CERVICAL_MUCUS` \| `LH_TEST` — discriminates which of the three fields below is populated |
| `temperatureValue` | `Float?` | only for `BASAL_TEMPERATURE` — kept numeric (not string) so Phase 3/6 can chart/average it without casting |
| `temperatureUnit` | `TemperatureUnit?` enum | `CELSIUS` \| `FAHRENHEIT`, only for `BASAL_TEMPERATURE` (reuses the enum from `Profile.temperatureUnit`) |
| `cervicalMucusType` | `CervicalMucusType?` enum | `DRY` \| `STICKY` \| `CREAMY` \| `WATERY` \| `EGG_WHITE`, only for `CERVICAL_MUCUS` — "types simplifiés" per LOG01, this is a starter taxonomy to confirm against a future Banani source |
| `lhResult` | `LhResult?` enum | `NEGATIVE` \| `POSITIVE` \| `PEAK` \| `INCONCLUSIVE`, only for `LH_TEST` — verbatim from LOG01's "négatif/positif/pic/inconclusif" |

Self-review note: an earlier draft of this model used one polymorphic
`value: String` column for all three signal types. Reworked into three
typed nullable columns (one per signal type, discriminated by `type`)
instead — the string version would force every temperature-trend query
in Phase 3/6 to cast text to numeric, and would lose enum type-safety for
mucus/LH results. Raw signals are retained per §8.2 ("conserver les
données brutes").

### `Prediction`

Single current row per user, upserted — matches the `/predictions/current`
contract (§15). No MVP requirement to audit historical predictions.

| Field | Type | Notes |
|---|---|---|
| `userId` | `String @unique` | FK, upsert target |
| `algorithmVersion` | `String` | §8.2 — retain which rule version produced this |
| `confidence` | `Confidence` enum | `LOW` \| `MEDIUM` \| `HIGH` |
| `expectedPeriodStart` | `DateTime` | range start, never a single point (§7.2) |
| `expectedPeriodEnd` | `DateTime` | range end |
| `ovulationEstimate` | `DateTime?` | |
| `fertileWindowStart` | `DateTime?` | |
| `fertileWindowEnd` | `DateTime?` | |
| `computedAt` | `DateTime` | |

### `Insight`

Append-only — one row per generated tendency or Cycle Score.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id` | cuid |
| `userId` | `String` | FK |
| `type` | `String` | e.g. `CYCLE_SCORE`, `SYMPTOM_TREND` |
| `payload` | `Json` | computed insight data |
| `periodAnalyzed` | `Json` | `{ from, to }` — shown to user per §9.1 |
| `cyclesConsidered` | `Int` | shown to user per §9.1 |
| `createdAt` | `DateTime` | |

## Explicitly out of scope for Phase 1

- **Full `Subscription`/billing model** — Phase 7. The `Profile.plan` stub
  above is enough for Phase 3's entitlement gating; Bictorys wiring,
  webhooks, and a real `Subscription` table with renewal/trial state come
  later.
- **Offline-sync columns** (uuid/clientVersion/syncState) — client-side
  IndexedDB/service-worker concern (§28.5-6), not this server schema.
- **AI Assistant message history** — Phase 8.

## Testing

Standard for this repo: Vitest unit tests for any new Zod schemas /
helper functions once Phase 2/3 add logic on top. Phase 1 itself is a
migration — validated by `pnpm db:migrate:dev` applying cleanly against
the Neon dev database and `pnpm typecheck`/`pnpm test` staying green
(Prisma Client regenerates types; no existing code references these new
models yet, so no regressions expected).
