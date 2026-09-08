# Phase 6 — Insights & Cycle Score (E6) Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute a per-day "Cycle Score" and 6 PRD-defined insight types (average cycle/period length, variability, top symptoms by cycle phase, current-vs-previous comparison, score trend) entirely at read time from already-existing data, and expose them via one new `GET /api/insights` route.

**Architecture:** Three new pure, dependency-free modules under `frontend/src/lib/server/insights/` (`cycle-score.ts`, `cycle-phase.ts`, `compute-insights.ts`) mirror this codebase's existing `cycles/` module split between pure algorithm files and DB-fetching route code. `compute-insights.ts`'s `deriveInsights()` is the single orchestrator, taking already-fetched plain data (no Prisma types) so it's fully unit-testable without mocks. Task 4's new route is a thin DB-fetching wrapper around it — no schema migration, no changes to any protected file.

**Tech Stack:** Next.js 16 Route Handlers, Prisma 5 + Neon (read-only queries), Vitest + `vitest-mock-extended` (`prismaMock`).

**Spec:** `docs/superpowers/specs/2026-09-08-phase6-insights-cycle-score-design.md`

## Global Constraints

- Every Route Handler MUST `export const runtime = 'nodejs'`.
- `GET /api/insights` needs no CSRF check (`verifyCsrf`) — read-only, matching every other `GET` route in this codebase.
- No `PROFILE_NOT_FOUND` guard on this route — an authenticated user with no `Profile` also has no `Cycle`/`DailyLog`/`PeriodEvent` rows, so the query results are naturally empty and `deriveInsights()` already returns the correct honest `{ eligible: false, ... }` shape for that case. This is a deliberate difference from every *mutating* health-data route in this codebase (which DO guard on `PROFILE_NOT_FOUND`) — this route only reads.
- No new Prisma model and no schema migration this phase — spec §1 explains why the PRD's literal `insights` table is deliberately not built.
- Dates are UTC-midnight `@db.Date` values throughout — use `todayUtcDate()`/`addDays()`/`daysBetween()` from `frontend/src/lib/server/cycles/date-utils.ts` and `groupIntoEpisodes()` from `frontend/src/lib/server/cycles/episodes.ts`, never hand-rolled date math or a reimplementation of episode-grouping.
- `frontend/src/lib/server/insights/` is a brand-new directory this phase creates — not a CLAUDE.md-protected path.
- Every pure function in this phase (`computeDailyCycleScore`, `classifyPhase`, `deriveInsights`) takes plain data as input, never a Prisma client or `tx` — only Task 4's route does I/O.

---

### Task 1: `cycle-score.ts` — Cycle Score algorithm

**Files:**
- Create: `frontend/src/lib/server/insights/cycle-score.ts`
- Create: `frontend/src/lib/server/insights/cycle-score.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (first task, fully independent).
- Produces: `computeDailyCycleScore(log: DailyLogForScore): number | null` where `DailyLogForScore = { mood: string | null; energy: string | null; sleepQuality: string | null; painLevel: number | null; symptomCount: number }`. Tasks 3 and 4 import this exact function and type.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/server/insights/cycle-score.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeDailyCycleScore, type DailyLogForScore } from './cycle-score';

function log(overrides: Partial<DailyLogForScore>): DailyLogForScore {
  return {
    mood: null,
    energy: null,
    sleepQuality: null,
    painLevel: null,
    symptomCount: 0,
    ...overrides,
  };
}

describe('computeDailyCycleScore', () => {
  it('averages all 4 dimensions when all are present', () => {
    // mood GOOD=75, energy HIGH=75, sleep GOOD=67, pain(2)+symptoms(1) burden=30 -> dim=70
    // average = (75+75+67+70)/4 = 71.75 -> rounds to 72
    const score = computeDailyCycleScore(
      log({ mood: 'GOOD', energy: 'HIGH', sleepQuality: 'GOOD', painLevel: 2, symptomCount: 1 }),
    );
    expect(score).toBe(72);
  });

  it('returns a score with exactly 2 dimensions present (the minimum)', () => {
    // mood VERY_GOOD=100, energy LOW=25 -> average = 62.5 -> rounds to 63
    const score = computeDailyCycleScore(log({ mood: 'VERY_GOOD', energy: 'LOW' }));
    expect(score).toBe(63);
  });

  it('returns null with only 1 dimension present', () => {
    expect(computeDailyCycleScore(log({ mood: 'GOOD' }))).toBeNull();
  });

  it('returns null with 0 dimensions present', () => {
    expect(computeDailyCycleScore(log({}))).toBeNull();
  });

  it('counts a symptom-only day (no painLevel, symptomCount > 0) as a present dimension', () => {
    // mood GOOD=75, symptoms(2, no painLevel) burden=20 -> dim=80
    // average = (75+80)/2 = 77.5 -> rounds to 78
    const score = computeDailyCycleScore(log({ mood: 'GOOD', symptomCount: 2 }));
    expect(score).toBe(78);
  });

  it('caps the symptom/pain burden at 100 instead of going negative', () => {
    // energy VERY_HIGH=100, pain(10)+symptoms(12) raw burden=220 -> capped 100 -> dim=0
    // average = (100+0)/2 = 50 (uncapped would give a nonsensical negative dimension)
    const score = computeDailyCycleScore(
      log({ energy: 'VERY_HIGH', painLevel: 10, symptomCount: 12 }),
    );
    expect(score).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/insights/cycle-score.test.ts`
Expected: FAIL — `Cannot find module './cycle-score'` (file doesn't exist yet).

- [ ] **Step 3: Write `cycle-score.ts`**

Create `frontend/src/lib/server/insights/cycle-score.ts`:

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
 * are inverted (fewer/less-severe symptoms -> higher score). Returns
 * `null` when fewer than `MIN_DIMENSIONS_FOR_SCORE` dimensions are
 * present that day (PRD §9.2, exact threshold) — never a score built
 * from a single data point.
 *
 * The symptom/pain dimension counts as "present" when EITHER `painLevel`
 * is set OR at least one symptom was logged — a day with both null/0
 * contributes no symptom dimension at all (not a 0-burden "perfect"
 * score), since silence isn't evidence of "no pain."
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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/insights/cycle-score.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck + lint + format**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/server/insights/cycle-score.ts frontend/src/lib/server/insights/cycle-score.test.ts
git commit -m "feat(insights): Cycle Score algorithm

Normalized 0-100 average of up to 4 self-reported dimensions (mood,
energy, sleep quality, symptom/pain burden inverted), PRD §9.2. Returns
null with fewer than 2 dimensions present that day — never a score
built from a single data point. Pure function, no persistence: computed
fresh from a DailyLog + its SymptomLog rows on every read."
```

---

### Task 2: `cycle-phase.ts` — historical cycle-phase classifier

**Files:**
- Create: `frontend/src/lib/server/insights/cycle-phase.ts`
- Create: `frontend/src/lib/server/insights/cycle-phase.test.ts`

**Interfaces:**
- Consumes: `addDays(date: Date, days: number): Date`, `daysBetween(a: Date, b: Date): number` (both from `../cycles/date-utils`, already exist). Independent of Task 1.
- Produces: `classifyPhase(date: Date, cycle: CompleteCycleForPhase, bleedingDates: Set<number>): CyclePhase` where `CompleteCycleForPhase = { startDate: Date; endDate: Date }` and `CyclePhase = 'MENSTRUAL' | 'FOLLICULAR' | 'OVULATORY' | 'LUTEAL'`. Task 3 imports this exact function and both types.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/server/insights/cycle-phase.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyPhase, type CompleteCycleForPhase } from './cycle-phase';

// 28-day complete cycle: startDate 2026-01-01, endDate 2026-01-28.
// ovulationDay = endDate + 1 - 14 = 2026-01-15.
const cycle: CompleteCycleForPhase = {
  startDate: new Date('2026-01-01'),
  endDate: new Date('2026-01-28'),
};
const bleedingDates = new Set(
  ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'].map((d) =>
    new Date(d).getTime(),
  ),
);

describe('classifyPhase', () => {
  it('classifies a date matching a PeriodEvent as MENSTRUAL', () => {
    expect(classifyPhase(new Date('2026-01-03'), cycle, bleedingDates)).toBe('MENSTRUAL');
  });

  it('classifies the computed ovulation day itself as OVULATORY', () => {
    expect(classifyPhase(new Date('2026-01-15'), cycle, bleedingDates)).toBe('OVULATORY');
  });

  it('classifies a date just before the ovulatory window as FOLLICULAR', () => {
    expect(classifyPhase(new Date('2026-01-13'), cycle, bleedingDates)).toBe('FOLLICULAR');
  });

  it('classifies a date just after the ovulatory window as LUTEAL', () => {
    expect(classifyPhase(new Date('2026-01-17'), cycle, bleedingDates)).toBe('LUTEAL');
  });

  it('classifies both boundary days at exactly the ovulatory window edge as OVULATORY', () => {
    expect(classifyPhase(new Date('2026-01-14'), cycle, bleedingDates)).toBe('OVULATORY');
    expect(classifyPhase(new Date('2026-01-16'), cycle, bleedingDates)).toBe('OVULATORY');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/insights/cycle-phase.test.ts`
Expected: FAIL — `Cannot find module './cycle-phase'` (file doesn't exist yet).

- [ ] **Step 3: Write `cycle-phase.ts`**

Create `frontend/src/lib/server/insights/cycle-phase.ts`:

```ts
import 'server-only';
import { addDays, daysBetween } from '../cycles/date-utils';

export type CyclePhase = 'MENSTRUAL' | 'FOLLICULAR' | 'OVULATORY' | 'LUTEAL';

export interface CompleteCycleForPhase {
  startDate: Date;
  endDate: Date; // non-null — caller only passes complete cycles
}

const LUTEAL_PHASE_DAYS = 14; // matches fertility-window.ts's own constant
const OVULATORY_WINDOW_DAYS = 1; // ovulation day +/- this many days

/**
 * Classifies an arbitrary historical `date` into a phase relative to the
 * COMPLETE `cycle` it falls inside. This is deliberately NOT
 * `CycleContextCard`'s `derivePhase()` — that function classifies
 * *today* relative to the single current `Prediction` row; this one
 * classifies a historical date using only that cycle's own known
 * start/end (no `Prediction` row exists per historical cycle).
 *
 * `bleedingDates` are this cycle's actual `PeriodEvent` dates (precise —
 * no estimation needed, unlike ovulation). Ovulation is back-calculated
 * from `endDate` the same way `computeFertilityWindow` back-calculates
 * it from a *predicted* next period start: for a COMPLETE cycle,
 * `endDate + 1 day` **is** the (already-known, not predicted) next
 * period's actual start, so the same `-14 days` luteal-phase constant
 * applies without needing a `Prediction` row at all.
 */
export function classifyPhase(
  date: Date,
  cycle: CompleteCycleForPhase,
  bleedingDates: Set<number>,
): CyclePhase {
  if (bleedingDates.has(date.getTime())) return 'MENSTRUAL';

  const ovulationDay = addDays(cycle.endDate, 1 - LUTEAL_PHASE_DAYS);
  const daysFromOvulation = daysBetween(ovulationDay, date);

  if (Math.abs(daysFromOvulation) <= OVULATORY_WINDOW_DAYS) return 'OVULATORY';
  return daysFromOvulation < 0 ? 'FOLLICULAR' : 'LUTEAL';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/insights/cycle-phase.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck + lint + format**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/server/insights/cycle-phase.ts frontend/src/lib/server/insights/cycle-phase.test.ts
git commit -m "feat(insights): historical cycle-phase classifier

classifyPhase() buckets an arbitrary historical date into
MENSTRUAL/FOLLICULAR/OVULATORY/LUTEAL relative to the COMPLETE cycle it
falls inside, using only that cycle's own start/end (no Prediction row
needed — unlike CycleContextCard's derivePhase(), which classifies
today relative to the current Prediction). Bleeding days come from
actual PeriodEvent dates; ovulation is back-calculated the same way
fertility-window.ts already does, just from a known (not predicted)
next-period start."
```

---

### Task 3: `compute-insights.ts` — the insights orchestrator

**Files:**
- Create: `frontend/src/lib/server/insights/compute-insights.ts`
- Create: `frontend/src/lib/server/insights/compute-insights.test.ts`

**Interfaces:**
- Consumes: `computeDailyCycleScore(log: DailyLogForScore): number | null` (Task 1), `classifyPhase(date, cycle, bleedingDates): CyclePhase` + `CompleteCycleForPhase`/`CyclePhase` types (Task 2), `groupIntoEpisodes(sortedDates: Date[]): Episode[]` where `Episode = { start: Date; end: Date; length: number }` (from `../cycles/episodes`, already exists), `daysBetween`/`todayUtcDate` (from `../cycles/date-utils`, already exist).
- Produces: `deriveInsights(input: InsightsInput): InsightsResult` where `InsightsInput = { cycles: CycleInput[]; dailyLogs: DailyLogInput[]; periodEventDates: Date[] }`, `CycleInput = { startDate: Date; endDate: Date | null; length: number | null }`, `DailyLogInput = { date: Date; mood: string | null; energy: string | null; sleepQuality: string | null; painLevel: number | null; symptoms: string[] }`, `InsightsResult = { eligible: boolean; cycleScoreToday: number | null; insights: Insight[]; meta: { completeCyclesAnalyzed: number; dailyLogsAnalyzed: number } }`, `Insight = { type: InsightType; evidenceCount: number; data: Record<string, unknown> }`, `InsightType = 'AVG_CYCLE_LENGTH' | 'AVG_PERIOD_LENGTH' | 'CYCLE_VARIABILITY' | 'TOP_SYMPTOMS' | 'CYCLE_COMPARISON' | 'CYCLE_SCORE_TREND'`. Task 4 imports `deriveInsights` and `InsightsInput`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/server/insights/compute-insights.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { deriveInsights, type CycleInput, type DailyLogInput } from './compute-insights';

function cycle(overrides: Partial<CycleInput>): CycleInput {
  return { startDate: new Date('2026-01-01'), endDate: null, length: null, ...overrides };
}

function log(overrides: Partial<DailyLogInput>): DailyLogInput {
  return {
    date: new Date('2026-01-01'),
    mood: null,
    energy: null,
    sleepQuality: null,
    painLevel: null,
    symptoms: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('deriveInsights', () => {
  it('returns not eligible with all-zero meta when there is no data at all', () => {
    const result = deriveInsights({ cycles: [], dailyLogs: [], periodEventDates: [] });
    expect(result).toEqual({
      eligible: false,
      cycleScoreToday: null,
      insights: [],
      meta: { completeCyclesAnalyzed: 0, dailyLogsAnalyzed: 0 },
    });
  });

  it('stays not eligible with exactly 1 complete cycle, but still computes cycleScoreToday when today qualifies', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T12:00:00Z'));

    const result = deriveInsights({
      cycles: [cycle({ startDate: new Date('2026-01-01'), endDate: new Date('2026-01-28'), length: 28 })],
      dailyLogs: [log({ date: new Date('2026-02-01'), mood: 'GOOD', energy: 'HIGH' })],
      periodEventDates: [],
    });

    expect(result.eligible).toBe(false);
    expect(result.insights).toEqual([]);
    expect(result.cycleScoreToday).toBe(75); // mood GOOD=75, energy HIGH=75, average=75
    expect(result.meta).toEqual({ completeCyclesAnalyzed: 1, dailyLogsAnalyzed: 1 });
  });

  it('becomes eligible with exactly 2 complete cycles and computes all 5 cycle-dependent insight types', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));

    const periodEventDates = [
      '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05',
      '2026-01-29', '2026-01-30', '2026-01-31', '2026-02-01',
      '2026-02-28', '2026-03-01', '2026-03-02',
    ].map((d) => new Date(d));

    const result = deriveInsights({
      cycles: [
        cycle({ startDate: new Date('2026-01-01'), endDate: new Date('2026-01-28'), length: 28 }),
        cycle({ startDate: new Date('2026-01-29'), endDate: new Date('2026-02-27'), length: 30 }),
        cycle({ startDate: new Date('2026-02-28'), endDate: null, length: null }),
      ],
      dailyLogs: [],
      periodEventDates,
    });

    expect(result.eligible).toBe(true);
    expect(result.cycleScoreToday).toBeNull();
    expect(result.meta).toEqual({ completeCyclesAnalyzed: 2, dailyLogsAnalyzed: 0 });

    const byType = new Map(result.insights.map((i) => [i.type, i]));
    expect(byType.size).toBe(5); // TOP_SYMPTOMS excluded: 0 dailyLogs < 5

    expect(byType.get('AVG_CYCLE_LENGTH')).toMatchObject({
      evidenceCount: 2,
      data: { average: 29, min: 28, max: 30 },
    });
    expect(byType.get('AVG_PERIOD_LENGTH')).toMatchObject({
      evidenceCount: 2,
      data: { average: 4.5, min: 4, max: 5 },
    });
    expect(byType.get('CYCLE_VARIABILITY')).toMatchObject({
      evidenceCount: 2,
      data: { stddev: 1, label: 'REGULAR' },
    });
    expect(byType.get('CYCLE_COMPARISON')).toMatchObject({
      evidenceCount: 2,
      data: {
        current: { daysElapsed: 11, periodLengthSoFar: 3, symptomCount: 0, avgCycleScore: null },
        previous: { length: 30, periodLength: 4, symptomCount: 0, avgCycleScore: null },
      },
    });
    // Never 0 for a cycle with no scoreable days -- null, distinguishable from a real low score.
    expect(byType.get('CYCLE_SCORE_TREND')).toMatchObject({
      evidenceCount: 2,
      data: { current: null, previous: null },
    });
  });

  it('includes TOP_SYMPTOMS with real per-phase data once >=5 daily logs exist, even with only 1 complete cycle', () => {
    // Same 28-day cycle as cycle-phase.test.ts: ovulationDay = 2026-01-15.
    const completeCycle = cycle({
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-28'),
      length: 28,
    });
    const periodEventDates = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'].map(
      (d) => new Date(d),
    );
    const dailyLogs = [
      log({ date: new Date('2026-01-02'), symptoms: ['CRAMPS'] }), // MENSTRUAL
      log({ date: new Date('2026-01-03'), symptoms: ['CRAMPS'] }), // MENSTRUAL
      log({ date: new Date('2026-01-15'), symptoms: ['ACNE'] }), // OVULATORY
      log({ date: new Date('2026-01-20'), symptoms: ['FATIGUE'] }), // LUTEAL
      log({ date: new Date('2026-01-21'), symptoms: ['FATIGUE'] }), // LUTEAL
    ];

    const result = deriveInsights({ cycles: [completeCycle], dailyLogs, periodEventDates });

    expect(result.eligible).toBe(true);
    expect(result.insights).toHaveLength(1); // only TOP_SYMPTOMS -- 1 complete cycle < 2
    const topSymptoms = result.insights[0]!;
    expect(topSymptoms.type).toBe('TOP_SYMPTOMS');
    expect(topSymptoms.evidenceCount).toBe(5);
    expect(topSymptoms.data).toEqual({
      byPhase: {
        MENSTRUAL: [{ symptom: 'CRAMPS', count: 2, frequency: 1 }],
        FOLLICULAR: [],
        OVULATORY: [{ symptom: 'ACNE', count: 1, frequency: 1 }],
        LUTEAL: [{ symptom: 'FATIGUE', count: 2, frequency: 1 }],
      },
    });
  });

  it('excludes TOP_SYMPTOMS below the 5-daily-log threshold', () => {
    const completeCycle = cycle({
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-28'),
      length: 28,
    });
    const dailyLogs = [
      log({ date: new Date('2026-01-02'), symptoms: ['CRAMPS'] }),
      log({ date: new Date('2026-01-03'), symptoms: ['CRAMPS'] }),
      log({ date: new Date('2026-01-15'), symptoms: ['ACNE'] }),
      log({ date: new Date('2026-01-20'), symptoms: ['FATIGUE'] }),
    ]; // only 4

    const result = deriveInsights({ cycles: [completeCycle], dailyLogs, periodEventDates: [] });

    expect(result.eligible).toBe(false);
    expect(result.insights).toEqual([]);
  });

  it('labels CYCLE_VARIABILITY at the REGULAR/SOMEWHAT_VARIABLE/IRREGULAR stddev boundaries', () => {
    const cases: Array<{ lengths: [number, number]; label: string; stddev: number }> = [
      { lengths: [26, 30], label: 'REGULAR', stddev: 2 }, // boundary: sd <= 2
      { lengths: [23, 33], label: 'SOMEWHAT_VARIABLE', stddev: 5 }, // boundary: sd <= 5
      { lengths: [20, 36], label: 'IRREGULAR', stddev: 8 },
    ];

    for (const { lengths, label, stddev } of cases) {
      const result = deriveInsights({
        cycles: [
          cycle({ startDate: new Date('2026-01-01'), endDate: new Date('2026-01-01'), length: lengths[0] }),
          cycle({ startDate: new Date('2026-02-01'), endDate: new Date('2026-02-01'), length: lengths[1] }),
        ],
        dailyLogs: [],
        periodEventDates: [],
      });
      const variability = result.insights.find((i) => i.type === 'CYCLE_VARIABILITY')!;
      expect(variability.data).toEqual({ stddev, label });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/insights/compute-insights.test.ts`
Expected: FAIL — `Cannot find module './compute-insights'` (file doesn't exist yet).

- [ ] **Step 3: Write `compute-insights.ts`**

Create `frontend/src/lib/server/insights/compute-insights.ts`:

```ts
import 'server-only';
import { computeDailyCycleScore } from './cycle-score';
import { classifyPhase, type CyclePhase } from './cycle-phase';
import { groupIntoEpisodes } from '../cycles/episodes';
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
  symptoms: string[];
}

export interface InsightsInput {
  cycles: CycleInput[]; // ascending by startDate
  dailyLogs: DailyLogInput[]; // ascending by date
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
  evidenceCount: number;
  data: Record<string, unknown>;
}

export interface InsightsResult {
  eligible: boolean;
  cycleScoreToday: number | null;
  insights: Insight[];
  meta: {
    completeCyclesAnalyzed: number;
    dailyLogsAnalyzed: number;
  };
}

interface CompleteCycle {
  startDate: Date;
  endDate: Date;
  length: number;
}

const MIN_COMPLETE_CYCLES = 2;
const MIN_DAILY_LOGS_FOR_SYMPTOMS = 5;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values: number[]): number {
  const mean = average(values) ?? 0;
  const variance = average(values.map((v) => (v - mean) ** 2)) ?? 0;
  return Math.sqrt(variance);
}

function scoresFor(logs: DailyLogInput[]): number[] {
  return logs
    .map((l) =>
      computeDailyCycleScore({
        mood: l.mood,
        energy: l.energy,
        sleepQuality: l.sleepQuality,
        painLevel: l.painLevel,
        symptomCount: l.symptoms.length,
      }),
    )
    .filter((s): s is number => s !== null);
}

function symptomCountFor(logs: DailyLogInput[]): number {
  return logs.reduce((sum, l) => sum + l.symptoms.length, 0);
}

function logsInRange(dailyLogs: DailyLogInput[], start: Date, end: Date): DailyLogInput[] {
  return dailyLogs.filter(
    (l) => l.date.getTime() >= start.getTime() && l.date.getTime() <= end.getTime(),
  );
}

/**
 * Pure orchestrator — see
 * docs/superpowers/specs/2026-09-08-phase6-insights-cycle-score-design.md
 * §5-§6 for the full rationale behind each insight type and the two
 * independent minimum-data gates (cycleScoreToday's own 2-dimension
 * gate inside computeDailyCycleScore vs. the 2-complete-cycles /
 * 5-daily-logs gates below).
 */
export function deriveInsights(input: InsightsInput): InsightsResult {
  const { cycles, dailyLogs, periodEventDates } = input;

  const completeCycles: CompleteCycle[] = cycles
    .filter((c) => c.endDate !== null && c.length !== null)
    .map((c) => ({ startDate: c.startDate, endDate: c.endDate!, length: c.length! }));
  const openCycle = cycles.find((c) => c.endDate === null) ?? null;
  const episodes = groupIntoEpisodes(periodEventDates);

  const today = todayUtcDate();
  const todayLog = dailyLogs.find((l) => l.date.getTime() === today.getTime()) ?? null;
  const cycleScoreToday = todayLog
    ? computeDailyCycleScore({
        mood: todayLog.mood,
        energy: todayLog.energy,
        sleepQuality: todayLog.sleepQuality,
        painLevel: todayLog.painLevel,
        symptomCount: todayLog.symptoms.length,
      })
    : null;

  const insights: Insight[] = [];

  if (completeCycles.length >= MIN_COMPLETE_CYCLES) {
    const lengths = completeCycles.map((c) => c.length);
    insights.push({
      type: 'AVG_CYCLE_LENGTH',
      evidenceCount: completeCycles.length,
      data: {
        average: round1(average(lengths)!),
        min: Math.min(...lengths),
        max: Math.max(...lengths),
      },
    });

    const completeStartTimes = new Set(completeCycles.map((c) => c.startDate.getTime()));
    const periodLengths = episodes
      .filter((e) => completeStartTimes.has(e.start.getTime()))
      .map((e) => e.length);
    if (periodLengths.length > 0) {
      insights.push({
        type: 'AVG_PERIOD_LENGTH',
        evidenceCount: periodLengths.length,
        data: {
          average: round1(average(periodLengths)!),
          min: Math.min(...periodLengths),
          max: Math.max(...periodLengths),
        },
      });
    }

    const sd = stddev(lengths);
    const label = sd <= 2 ? 'REGULAR' : sd <= 5 ? 'SOMEWHAT_VARIABLE' : 'IRREGULAR';
    insights.push({
      type: 'CYCLE_VARIABILITY',
      evidenceCount: completeCycles.length,
      data: { stddev: round1(sd), label },
    });

    const previousCycle = completeCycles[completeCycles.length - 1]!;
    const previousEpisode =
      episodes.find((e) => e.start.getTime() === previousCycle.startDate.getTime()) ?? null;
    const previousLogs = logsInRange(dailyLogs, previousCycle.startDate, previousCycle.endDate);
    const previousScoreAvg = average(scoresFor(previousLogs));
    const previousData = {
      length: previousCycle.length,
      periodLength: previousEpisode?.length ?? 0,
      symptomCount: symptomCountFor(previousLogs),
      avgCycleScore: previousScoreAvg !== null ? Math.round(previousScoreAvg) : null,
    };

    let currentData: {
      daysElapsed: number;
      periodLengthSoFar: number;
      symptomCount: number;
      avgCycleScore: number | null;
    };
    if (openCycle) {
      const currentEpisode =
        episodes.find((e) => e.start.getTime() === openCycle.startDate.getTime()) ?? null;
      const currentLogs = dailyLogs.filter((l) => l.date.getTime() >= openCycle.startDate.getTime());
      const currentScoreAvg = average(scoresFor(currentLogs));
      currentData = {
        daysElapsed: daysBetween(openCycle.startDate, today) + 1,
        periodLengthSoFar: currentEpisode?.length ?? 0,
        symptomCount: symptomCountFor(currentLogs),
        avgCycleScore: currentScoreAvg !== null ? Math.round(currentScoreAvg) : null,
      };
    } else {
      currentData = { daysElapsed: 0, periodLengthSoFar: 0, symptomCount: 0, avgCycleScore: null };
    }

    insights.push({
      type: 'CYCLE_COMPARISON',
      evidenceCount: completeCycles.length,
      data: { current: currentData, previous: previousData },
    });

    insights.push({
      type: 'CYCLE_SCORE_TREND',
      evidenceCount: completeCycles.length,
      data: { current: currentData.avgCycleScore, previous: previousData.avgCycleScore },
    });
  }

  if (dailyLogs.length >= MIN_DAILY_LOGS_FOR_SYMPTOMS) {
    const counts: Record<CyclePhase, Map<string, number>> = {
      MENSTRUAL: new Map(),
      FOLLICULAR: new Map(),
      OVULATORY: new Map(),
      LUTEAL: new Map(),
    };
    const daysLogged: Record<CyclePhase, number> = {
      MENSTRUAL: 0,
      FOLLICULAR: 0,
      OVULATORY: 0,
      LUTEAL: 0,
    };
    const bleedingSet = new Set(periodEventDates.map((d) => d.getTime()));

    for (const c of completeCycles) {
      for (const l of logsInRange(dailyLogs, c.startDate, c.endDate)) {
        const phase = classifyPhase(l.date, c, bleedingSet);
        daysLogged[phase] += 1;
        for (const symptom of l.symptoms) {
          counts[phase].set(symptom, (counts[phase].get(symptom) ?? 0) + 1);
        }
      }
    }

    const byPhase: Record<CyclePhase, Array<{ symptom: string; count: number; frequency: number }>> = {
      MENSTRUAL: [],
      FOLLICULAR: [],
      OVULATORY: [],
      LUTEAL: [],
    };
    (Object.keys(counts) as CyclePhase[]).forEach((phase) => {
      if (daysLogged[phase] === 0) return;
      byPhase[phase] = [...counts[phase].entries()]
        .map(([symptom, count]) => ({ symptom, count, frequency: round1(count / daysLogged[phase]) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
    });

    insights.push({
      type: 'TOP_SYMPTOMS',
      evidenceCount: dailyLogs.length,
      data: { byPhase },
    });
  }

  return {
    eligible: insights.length > 0,
    cycleScoreToday,
    insights,
    meta: {
      completeCyclesAnalyzed: completeCycles.length,
      dailyLogsAnalyzed: dailyLogs.length,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/insights/compute-insights.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck + lint + format**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/server/insights/compute-insights.ts frontend/src/lib/server/insights/compute-insights.test.ts
git commit -m "feat(insights): deriveInsights orchestrator (6 insight types)

Pure function taking already-fetched plain data (no Prisma types) -
fully unit-testable without mocks, mirrors this codebase's existing
split between pure cycles/*.ts algorithms and DB-fetching route code.
Two independent minimum-data gates (PRD §9.1): cycleScoreToday needs
only today's own >=2-dimension check; the 5 cycle-dependent insight
types need >=2 complete cycles; TOP_SYMPTOMS has its own >=5-daily-logs
threshold, included whenever ITS threshold is met regardless of the
cycle-count gate. Reuses groupIntoEpisodes() for period-length instead
of reimplementing episode grouping."
```

---

### Task 4: `GET /api/insights` route

**Files:**
- Create: `frontend/src/app/api/insights/route.ts`
- Create: `frontend/src/app/api/insights/route.test.ts`

**Interfaces:**
- Consumes: `deriveInsights(input: InsightsInput): InsightsResult` + `InsightsInput` type (Task 3), `requireAuth` (from `@/lib/server/middleware`, already exists), `makeRequestContext`/`withRequestContext` (from `@/lib/server/observability/request-context`, already exists).
- Produces: `GET /api/insights` — terminal task, nothing downstream in this plan consumes it.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/insights/route.test.ts`:

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'u1', email: 'a@b.com' } })),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/insights', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } });
  prismaMock.cycle.findMany.mockResolvedValue([]);
  prismaMock.dailyLog.findMany.mockResolvedValue([]);
  prismaMock.periodEvent.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/insights', () => {
  it('returns eligible:false with all-zero meta for a user with no data (never 404)', async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      eligible: false,
      cycleScoreToday: null,
      insights: [],
      meta: { completeCyclesAnalyzed: 0, dailyLogsAnalyzed: 0 },
    });
  });

  it('queries cycles, dailyLogs (with symptoms), and periodEvents scoped to the authenticated user, ascending by date', async () => {
    await GET(makeReq());

    expect(prismaMock.cycle.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { startDate: 'asc' },
      select: { startDate: true, endDate: true, length: true },
    });
    expect(prismaMock.dailyLog.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { date: 'asc' },
      include: { symptoms: true },
    });
    expect(prismaMock.periodEvent.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
  });

  it('maps DailyLog + SymptomLog rows into the shape compute-insights expects and returns a real cycleScoreToday', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T12:00:00Z'));

    prismaMock.dailyLog.findMany.mockResolvedValue([
      {
        id: 'dl1',
        userId: 'u1',
        date: new Date('2026-02-01'),
        painLevel: null,
        painLocation: null,
        mood: 'GOOD',
        energy: 'HIGH',
        sleepQuality: null,
        sleepHours: null,
        note: null,
        symptoms: [],
      },
    ] as never);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.cycleScoreToday).toBe(75); // mood GOOD=75, energy HIGH=75, average=75
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/insights/route.test.ts`
Expected: FAIL — `Cannot find module './route'` (file doesn't exist yet).

- [ ] **Step 3: Write the route**

Create `frontend/src/app/api/insights/route.ts`:

```ts
// GET /api/insights — Phase 6 (E6 Insights & Cycle Score).
//
// Read-only, no CSRF. Computes everything live from already-existing
// DailyLog/SymptomLog/Cycle/PeriodEvent rows — no new table, no
// materialization (spec §1). An authenticated user with no Profile/data
// yet gets a normal 200 with eligible:false, never a 404 — "not enough
// data" is not an error.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { deriveInsights, type InsightsInput } from '@/lib/server/insights/compute-insights';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const userId = auth.user.sub;
    const [cycles, dailyLogs, periodEvents] = await Promise.all([
      prisma.cycle.findMany({
        where: { userId },
        orderBy: { startDate: 'asc' },
        select: { startDate: true, endDate: true, length: true },
      }),
      prisma.dailyLog.findMany({
        where: { userId },
        orderBy: { date: 'asc' },
        include: { symptoms: true },
      }),
      prisma.periodEvent.findMany({
        where: { userId },
        orderBy: { date: 'asc' },
        select: { date: true },
      }),
    ]);

    const input: InsightsInput = {
      cycles,
      dailyLogs: dailyLogs.map((log) => ({
        date: log.date,
        mood: log.mood,
        energy: log.energy,
        sleepQuality: log.sleepQuality,
        painLevel: log.painLevel,
        symptoms: log.symptoms.map((s) => s.symptom),
      })),
      periodEventDates: periodEvents.map((e) => e.date),
    };

    const result = deriveInsights(input);

    return NextResponse.json(result, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/insights/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + lint + format**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: all clean.

- [ ] **Step 6: Full test suite + build**

Run: `pnpm test && pnpm build`
Expected: all green; `/api/insights` appears in the build's route list.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/api/insights/route.ts frontend/src/app/api/insights/route.test.ts
git commit -m "feat(insights): GET /api/insights route

Thin DB-fetching wrapper around deriveInsights() — fetches Cycle,
DailyLog (with SymptomLog), and PeriodEvent rows for the authenticated
user, maps them into the orchestrator's plain-data input shape, returns
its result directly. No CSRF (read-only), no PROFILE_NOT_FOUND guard (a
user with no Profile also has no data, which deriveInsights() already
handles as an honest eligible:false response, not an error)."
```

---

## Post-plan (not part of SDD, handled after all tasks land)

- Update `.planning/banani/STATUS.md`: move `Analytics` from "Pending" to a
  new "Backend ready, UI pending" note — the `❌ needs Phase 1 + 3 + 6`
  blocker is now resolved; the UI pass is the only remaining step.
- No UI is built in this plan (spec §8) — a separate
  `banani-design-implementation` pass builds `/app/insights` against the
  already-fetched Banani `Analytics` screen, consuming this endpoint.
