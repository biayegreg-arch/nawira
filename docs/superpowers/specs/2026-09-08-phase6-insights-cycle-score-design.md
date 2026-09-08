# Phase 6 — Insights & Cycle Score (E6) Design

**Status:** Approved by user, section-by-section, 2026-09-08.

## 1. Scope

PRD §6.4 (INS01) and §9 (Insights et Cycle Score) define this epic. Three
scope decisions were confirmed with the user before writing this spec:

- **No report export.** PRD §6.4's "rapport mensuel exportable pour plans
  payants" is deferred to a later phase — this phase builds the on-screen
  Insights + Cycle Score only, not file generation/download.
- **No paywall enforcement.** PRD §10 (PW01) describes a NAWIRA Plus
  paywall triggered after the first locked insight. Matching the decision
  already made for `/app/billing` (Phase "Subscription"), nothing is
  gated in this phase — no `Subscription`/entitlement model exists yet
  anywhere in the codebase, so gating would block every user. The API
  response shape still carries the data needed to add a `locked` flag
  later without a breaking change (see §7).
- **No quality feedback.** PRD §9.1's "Ceci ne me ressemble pas" affordance
  is deferred — no `insight_feedback` concept is introduced this phase.
- **No new Prisma model, no materialization.** PRD §14 lists an `insights`
  table (`id; user_id; insight_type; period_start; period_end;
  evidence_count; content_key; created_at`). This phase deliberately does
  **not** build it. Every input the Cycle Score and the 6 insight types
  need already exists (`DailyLog`, `SymptomLog`, `Cycle`, `PeriodEvent`) —
  everything is computed live on `GET /api/insights`, nothing is
  persisted. This is a real, confirmed deviation from the PRD's literal
  schema: materializing was the more PRD-literal alternative, and was
  explicitly discussed and rejected in favor of read-time computation,
  because (a) per-user data volume is small (months of daily entries, not
  bulk data), (b) a materialized table's main payoff — a stable row ID for
  feedback/export — doesn't apply since both are deferred, and (c) a
  recompute-on-write table risks the exact class of staleness bug just
  fixed in `recompute.ts`'s orphan-cycle pruning, for no benefit here.
  Revisit materialization only if profiling later shows this endpoint is
  actually slow, or if export/feedback ship and need a stable insight ID.
- **UI deferred**, matching the Phase 3/4/5 precedent: this phase is
  backend-only. The Banani `Analytics` screen (`AnalyticsRecommendations`,
  `TrendsChart`, `MoodDistributionChart`, `CycleComparisonCard`,
  `SymptomStatistics`) is a separate `banani-design-implementation` pass
  after this backend ships.

## 2. Data reused (no schema change)

| Source | Fields used |
|---|---|
| `DailyLog` | `date`, `mood`, `energy`, `sleepQuality`, `painLevel` |
| `SymptomLog` | `symptom` (via `DailyLog.symptoms`) |
| `PeriodEvent` | `date` (to know exactly which days were bleeding days) |
| `Cycle` | `startDate`, `endDate`, `length`, `isOutlier` |

No migration. This phase adds only new files under
`frontend/src/lib/server/insights/` plus one new route.

## 3. Algorithm — Cycle Score (`cycle-score.ts`)

New file `frontend/src/lib/server/insights/cycle-score.ts`, pure function,
no I/O:

```ts
import 'server-only';

export interface DailyLogForScore {
  mood: string | null; // VERY_GOOD | GOOD | TIRED | STRESSED | LOW
  energy: string | null; // VERY_LOW | LOW | MEDIUM | HIGH | VERY_HIGH
  sleepQuality: string | null; // POOR | FAIR | GOOD | EXCELLENT
  painLevel: number | null; // 0-10
  symptomCount: number; // SymptomLog rows for that day
}

const MOOD_SCORE: Record<string, number> = {
  LOW: 0,
  STRESSED: 25,
  TIRED: 50,
  GOOD: 75,
  VERY_GOOD: 100,
};

const ENERGY_SCORE: Record<string, number> = {
  VERY_LOW: 0,
  LOW: 25,
  MEDIUM: 50,
  HIGH: 75,
  VERY_HIGH: 100,
};

const SLEEP_SCORE: Record<string, number> = {
  POOR: 0,
  FAIR: 33,
  GOOD: 67,
  EXCELLENT: 100,
};

const MIN_DIMENSIONS_FOR_SCORE = 2;

/**
 * PRD §9.2: "score d'expérience/journal, pas un score médical" — a
 * normalized 0-100 average of up to 4 self-reported dimensions. Symptoms
 * are inverted (fewer/less-severe symptoms → higher score). Returns
 * `null` when fewer than `MIN_DIMENSIONS_FOR_SCORE` dimensions are
 * present that day (PRD §9.2, exact threshold) — never shows a score
 * built from a single data point.
 */
export function computeDailyCycleScore(log: DailyLogForScore): number | null {
  const dims: number[] = [];

  if (log.mood !== null && log.mood in MOOD_SCORE) dims.push(MOOD_SCORE[log.mood]!);
  if (log.energy !== null && log.energy in ENERGY_SCORE) dims.push(ENERGY_SCORE[log.energy]!);
  if (log.sleepQuality !== null && log.sleepQuality in SLEEP_SCORE) {
    dims.push(SLEEP_SCORE[log.sleepQuality]!);
  }
  if (log.painLevel !== null || log.symptomCount > 0) {
    const burden = Math.min(100, (log.painLevel ?? 0) * 10 + log.symptomCount * 10);
    dims.push(100 - burden);
  }

  if (dims.length < MIN_DIMENSIONS_FOR_SCORE) return null;
  return Math.round(dims.reduce((sum, d) => sum + d, 0) / dims.length);
}
```

The symptom/pain dimension counts as "present" when EITHER `painLevel` is
set OR at least one symptom was logged that day — a day with `painLevel:
null` and zero symptoms contributes no symptom dimension at all (not a
0-burden "perfect" score), since silence isn't evidence of "no pain."

## 4. Algorithm — Cycle phase classification (`cycle-phase.ts`)

New file `frontend/src/lib/server/insights/cycle-phase.ts`. Needed for the
`TOP_SYMPTOMS` insight (§5.4), which buckets historical days by cycle
phase. This is **not** `CycleContextCard`'s existing `derivePhase()` —
that function classifies *today* relative to the single current
`Prediction` row; this one classifies an **arbitrary historical date**
relative to the **completed `Cycle` it falls inside**, using only that
cycle's own known start/end (no `Prediction` row exists per historical
cycle).

```ts
import 'server-only';
import { addDays, daysBetween } from '../cycles/date-utils';

export type CyclePhase = 'MENSTRUAL' | 'FOLLICULAR' | 'OVULATORY' | 'LUTEAL';

export interface CompleteCycleForPhase {
  startDate: Date;
  endDate: Date; // non-null — caller only passes complete cycles
}

const LUTEAL_PHASE_DAYS = 14; // matches fertility-window.ts's own constant
const OVULATORY_WINDOW_DAYS = 1; // ovulation day ± this many days

/**
 * `bleedingDates` are this cycle's actual `PeriodEvent` dates (precise —
 * no estimation needed, unlike ovulation). Ovulation is back-calculated
 * from `endDate` the same way `computeFertilityWindow` back-calculates it
 * from a *predicted* next period start: for a COMPLETE cycle,
 * `endDate + 1 day` **is** the (already-known, not predicted) next
 * period's actual start, so the same `-14 days` luteal-phase constant
 * applies without needing a `Prediction` row at all.
 */
export function classifyPhase(
  date: Date,
  cycle: CompleteCycleForPhase,
  bleedingDates: Set<number>, // date.getTime() values
): CyclePhase {
  if (bleedingDates.has(date.getTime())) return 'MENSTRUAL';

  const ovulationDay = addDays(cycle.endDate, 1 - LUTEAL_PHASE_DAYS);
  const daysFromOvulation = daysBetween(ovulationDay, date);

  if (Math.abs(daysFromOvulation) <= OVULATORY_WINDOW_DAYS) return 'OVULATORY';
  return daysFromOvulation < 0 ? 'FOLLICULAR' : 'LUTEAL';
}
```

Only called for **complete** cycles (`endDate` non-null) — the current
open cycle has no known length, so its days are excluded from
phase-bucketed aggregation (§5.4), consistent with the ≥2-complete-cycles
gate in §6.

## 5. Algorithm — Insights (`compute-insights.ts`)

New file `frontend/src/lib/server/insights/compute-insights.ts`. A single
**pure** orchestrator function taking already-fetched data (mirrors
`recompute.ts`'s own split between DB-fetching and pure computation, and
keeps this fully unit-testable without Prisma mocks):

```ts
import 'server-only';
import { computeDailyCycleScore } from './cycle-score';
import { classifyPhase, type CyclePhase } from './cycle-phase';
import { daysBetween, todayUtcDate } from '../cycles/date-utils';

export interface CycleInput {
  startDate: Date;
  endDate: Date | null;
  length: number | null;
}

export interface DailyLogInput {
  date: Date;
  mood: string | null;
  energy: string | null;
  sleepQuality: string | null;
  painLevel: number | null;
  symptoms: string[]; // symptom codes — TOP_SYMPTOMS uses the codes directly; score computation derives `symptomCount: symptoms.length` when building the `DailyLogForScore` object it passes to `computeDailyCycleScore`
}

export interface InsightsInput {
  cycles: CycleInput[]; // ascending by startDate, as returned by /api/cycles today
  dailyLogs: DailyLogInput[]; // all of them, ascending by date
  periodEventDates: Date[]; // ascending
}

export type InsightType =
  | 'AVG_CYCLE_LENGTH'
  | 'AVG_PERIOD_LENGTH'
  | 'CYCLE_VARIABILITY'
  | 'TOP_SYMPTOMS'
  | 'CYCLE_COMPARISON'
  | 'CYCLE_SCORE_TREND';

export interface Insight {
  type: InsightType;
  evidenceCount: number; // cycles or logs behind this insight — PRD §9.1 "afficher... le nombre de cycles concernés"
  data: Record<string, unknown>; // shape documented per type below
}

export interface InsightsResult {
  eligible: boolean;
  cycleScoreToday: number | null; // independent gate — see §6
  insights: Insight[];
  meta: {
    completeCyclesAnalyzed: number;
    dailyLogsAnalyzed: number;
  };
}
```

### 5.1 `AVG_CYCLE_LENGTH`

Over all complete cycles (`endDate` non-null): `{ average: number, min:
number, max: number }` (`average` rounded to 1 decimal).

### 5.2 `AVG_PERIOD_LENGTH`

Reuses `groupIntoEpisodes(periodEventDates)` (the same helper
`recompute.ts` already calls) to get each episode's bleeding-day span —
an episode's `start` equals its cycle's `startDate` by construction, so
`episode.length` **is** that cycle's period length. Only episodes whose
`start` matches a **complete** cycle's `startDate` count (excludes the
still-open current episode): `{ average: number, min: number, max:
number }`.

### 5.3 `CYCLE_VARIABILITY`

Population standard deviation of complete-cycle lengths: `{ stddev:
number, label: 'REGULAR' | 'SOMEWHAT_VARIABLE' | 'IRREGULAR' }`. Label
thresholds (this codebase's own judgment call, like `build-cycles.ts`'s
existing outlier threshold — not PRD-specified): `stddev <= 2 →
REGULAR`, `<= 5 → SOMEWHAT_VARIABLE`, else `IRREGULAR`.

### 5.4 `TOP_SYMPTOMS`

For every daily log whose `date` falls inside a **complete** cycle,
classify its phase via `classifyPhase()`, then count symptom occurrences
per `(phase, symptom)` pair. Result: `{ byPhase: Record<CyclePhase,
Array<{ symptom: string; count: number; frequency: number }>> }` — top 3
symptoms per phase, `frequency` = count ÷ (days logged in that phase),
phases with zero logged days omitted. Gated independently at ≥5 daily
logs total (§6), not the 2-cycle gate, so a new user who journals daily
but has irregular/no period data yet can still see this.

### 5.5 `CYCLE_COMPARISON`

Current (open) cycle vs the most recent **complete** cycle:

```ts
{
  current: { daysElapsed: number; periodLengthSoFar: number; symptomCount: number; avgCycleScore: number | null };
  previous: { length: number; periodLength: number; symptomCount: number; avgCycleScore: number | null } | null;
}
```

`previous` is `null` when fewer than 1 complete cycle exists (shouldn't
happen once the ≥2-complete-cycles gate passes, but typed honestly).

### 5.6 `CYCLE_SCORE_TREND`

Average `computeDailyCycleScore()` across all days with a non-null score,
grouped the same way as §5.5: `{ current: number | null; previous:
number | null }`. A cycle with zero scoreable days yields `null`, not 0
(never implies "worst possible" from missing data).

## 6. Minimum-data gating (PRD §9.1 "exiger un minimum de données")

Two **independent** gates — this is deliberate, not an oversight:

- **`cycleScoreToday`**: gated only by §3's own ≥2-dimensions-today rule.
  Available even for a brand-new user with zero completed cycles, so a
  `/app/today` widget (future UI phase) can show it from day one.
- **`eligible` / `insights` array**: gated by ≥2 complete cycles
  (`Cycle.endDate` non-null) for insight types 5.1–5.3 and 5.5–5.6. Type
  5.4 (`TOP_SYMPTOMS`) has its own separate ≥5-daily-logs threshold and is
  included in the `insights` array whenever ITS OWN threshold is met,
  independent of the cycle-count gate — so `eligible: true` means "at
  least one insight type met its own threshold," not "every type did."
  Each `Insight.evidenceCount` tells the UI exactly how much data backed
  that specific insight (PRD §9.1's explicit requirement), so a future UI
  can render available insights even when others are still locked out for
  lack of data — never a chart or trend built from too few points.

```ts
const MIN_COMPLETE_CYCLES = 2;
const MIN_DAILY_LOGS_FOR_SYMPTOMS = 5;
```

## 7. API

New file `frontend/src/app/api/insights/route.ts`. `GET` only, no CSRF
needed (read-only), `requireAuth`, standard
`makeRequestContext`/`withRequestContext` wrapping.

```ts
{
  cycleScoreToday: number | null;
  eligible: boolean;
  insights: Array<{ type: InsightType; evidenceCount: number; data: Record<string, unknown> }>;
  meta: { completeCyclesAnalyzed: number; dailyLogsAnalyzed: number };
}
```

No `locked` field yet (§1 — no paywall this phase) but every field needed
to add one later (`Profile.plan` is already exposed via `GET
/api/profile`) already exists independently — a future paywall phase
reads `insights` fully server-side and decides what to redact per plan
without touching this route's computation logic.

Route body: fetch `cycles` (all, ascending), `dailyLogs` (all, with
`symptoms: true`, ascending), `periodEvents` (all dates, ascending) for
`auth.user.sub` — same 3 queries `recompute.ts` already runs, no new
query shape. Pass into `computeDailyCycleScore` (for today's log, if any)
and `deriveInsights()` (the `compute-insights.ts` orchestrator, which
internally calls §5.1–5.6 and applies §6's gates). No `PROFILE_NOT_FOUND`
guard needed — an authenticated user with no `Profile` also has no
`Cycle`/`DailyLog` rows, so the response is just `{ cycleScoreToday: null,
eligible: false, insights: [], meta: { completeCyclesAnalyzed: 0,
dailyLogsAnalyzed: 0 } }`, which is already the correct honest answer.

## 8. UI (deferred to a separate `banani-design-implementation` pass)

Not built this phase:

- `/app/insights`: real screen, Banani source `Analytics` (composes
  `AnalyticsRecommendations`, `TrendsChart`, `MoodDistributionChart`,
  `CycleComparisonCard`, `SymptomStatistics`). Content for
  `AnalyticsRecommendations` must come from the 6 insight types above
  (PRD §9.1 wording rule: "Tu as souvent enregistré X autour de Y", never
  causal language) — not fabricated or copied verbatim from Banani.
- Possible `/app/today` Cycle Score widget — `cycleScoreToday` is
  available independently of the insights gate (§6), so this is a real
  option for that later pass, not a blocker.
- No subscription/tier gate anywhere in this UI either, consistent with §1.

## 9. Testing

- `cycle-score.test.ts` (new, pure): all 4 dimensions present, exactly 2
  present (boundary), 1 present → `null`, 0 present → `null`, symptom-only
  day (no `painLevel`, `symptomCount > 0`) counts as present, burden caps
  at 100.
- `cycle-phase.test.ts` (new, pure): a date matching a `PeriodEvent` →
  `MENSTRUAL` regardless of day-of-cycle math; a date at the computed
  ovulation day → `OVULATORY`; a date just before it → `FOLLICULAR`; a
  date just after the ovulatory window → `LUTEAL`; boundary days at
  exactly `OVULATORY_WINDOW_DAYS`.
- `compute-insights.test.ts` (new, pure, the bulk of the coverage): 0
  cycles → `eligible: false`, all counts 0; 1 complete cycle → still not
  eligible (below `MIN_COMPLETE_CYCLES`) but `cycleScoreToday` still
  computed if today qualifies; exactly 2 complete cycles → eligible, all
  cycle-dependent types present; `TOP_SYMPTOMS` appears once ≥5 daily
  logs even with 0 complete cycles; `TOP_SYMPTOMS` absent below that
  threshold; `CYCLE_VARIABILITY` label boundaries (stddev exactly 2 and
  exactly 5); `CYCLE_COMPARISON.previous` is `null` with 0 complete
  cycles; `CYCLE_SCORE_TREND` returns `null` (not 0) for a cycle with no
  scoreable days.
- `api/insights/route.test.ts` (new, mirrors existing route test
  conventions — `prismaMock`, `requireAuth` mock, 401 case): 200 with the
  full shape for an eligible user, 200 with `eligible: false` and empty
  `insights` for a brand-new user (never 404 — an authenticated user with
  no data is not an error), correct `x-request-id` header, `runtime =
  'nodejs'` export present (covered automatically by the existing
  `runtime-enforcement.test.ts` walk, no new test needed there).

No end-to-end integration test (matching Phase 3/4/5 precedent); a real
browser verification follows once the UI pass ships.
