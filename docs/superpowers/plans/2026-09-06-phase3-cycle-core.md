# Phase 3 — NAWIRA Cycle Core (E3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the cycle-detection + prediction engine (PRD §7) and the
three API endpoints that expose it, so a user's logged periods produce a
stored `Cycle` history and a `Prediction` row without any cron/background
job.

**Architecture:** Pure, independently-testable algorithm modules
(episode-grouping → cycle-building/outlier-detection → prediction) are
composed by one orchestrator function,
`recomputeCyclesAndPrediction(tx, userId)`, called synchronously inside
the same Prisma transaction as any `PeriodEvent` write — from a new
`POST /api/period-events` endpoint and (as a small addition) from the
existing `POST /api/onboarding/complete`. Two new `GET` endpoints
(`/api/cycles`, `/api/predictions/current`) only ever read the stored
rows.

**Tech Stack:** Next.js 16 Route Handlers, Prisma 5 (Neon Postgres),
Zod, Vitest + `vitest-mock-extended` (`prismaMock`) — no new
dependencies.

**Spec:** `docs/superpowers/specs/2026-09-06-phase3-cycle-core-design.md`

**Out of scope for this plan** (per the spec): the `/app/today` and
`/app/calendar` page UI. Those are implemented in a separate follow-up
using the `banani-design-implementation` skill against the already
-fetched `DashboardAujourdhui` and `Calendar` Banani screens, once this
backend is merged. This plan is backend-only.

## Global Constraints

- Every Route Handler MUST `export const runtime = 'nodejs'`.
- Mutating routes call `verifyCsrf(req)` before `requireAuth(...)`, and
  bail with `if (csrfFail) return csrfFail;` — matches
  `frontend/src/app/api/onboarding/complete/route.ts`.
- `requireAuth` is called as `requireAuth(req.headers.get('authorization'))`,
  returns `AuthContext | NextResponse` — check
  `auth instanceof NextResponse` and return it.
- Wrap every handler body in `withRequestContext(ctx, async () => { ... })`
  where `ctx = makeRequestContext(req.headers)`, and set
  `x-request-id` on every response header (success and error paths).
- All new server-only modules start with `import 'server-only';` and
  `export const runtime = 'nodejs';` (route files only — plain lib
  modules under `lib/server/cycles/` need `import 'server-only';` but
  NOT the `runtime` export, matching `frontend/src/lib/server/withdrawals/lock.ts`).
- Money/date values: `PeriodEvent.date`, `Cycle.startDate`/`endDate`,
  `Prediction.expectedPeriodStart`/`expectedPeriodEnd` are all
  `@db.Date` columns — always construct/compare them as UTC-midnight
  `Date` objects (see Task 1's `date-utils.ts`).
- Tests use the existing `prismaMock` from `@/test-utils/prisma-mock`
  (import it FIRST in every test file, before any module that imports
  `@/lib/server/prisma`) — this repo has no real-database test harness;
  do not introduce one.
- `Cycle`'s compound unique key is `userId_startDate` (Prisma's default
  name for `@@unique([userId, startDate])`); `PeriodEvent`'s is
  `userId_date`. Use these exact key names in `where: { userId_startDate: { userId, startDate } }` /
  `where: { userId_date: { userId, date } }`.
- `Prediction.userId` is the `@id` (one row per user) — always
  `upsert({ where: { userId }, ... })`, never `create`.
- `algorithmVersion` is the string constant `'v1'`, exported from
  `frontend/src/lib/server/cycles/prediction.ts` as `ALGORITHM_VERSION`
  — bump it (and only it) if the numeric thresholds in Task 4 are ever
  retuned.
- `ovulationEstimate`, `fertileWindowStart`, `fertileWindowEnd` are never
  set by this plan (stay `null` — E5 fertility engine, later phase) and
  are never included in this plan's `GET /api/predictions/current`
  response shape.

---

## Task 1: Date utilities

**Files:**
- Create: `frontend/src/lib/server/cycles/date-utils.ts`
- Test: `frontend/src/lib/server/cycles/date-utils.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces: `daysBetween(a: Date, b: Date): number`, `addDays(date: Date, days: number): Date`, `todayUtcDate(): Date` — used by every later task in this plan.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/server/cycles/date-utils.test.ts
import { describe, it, expect } from 'vitest';
import { daysBetween, addDays, todayUtcDate } from './date-utils';

describe('daysBetween', () => {
  it('returns the number of days between two UTC dates', () => {
    expect(daysBetween(new Date('2026-01-01'), new Date('2026-01-05'))).toBe(4);
  });

  it('returns a negative number when b is before a', () => {
    expect(daysBetween(new Date('2026-01-05'), new Date('2026-01-01'))).toBe(-4);
  });

  it('returns 0 for the same date', () => {
    expect(daysBetween(new Date('2026-01-01'), new Date('2026-01-01'))).toBe(0);
  });
});

describe('addDays', () => {
  it('adds days within the same month', () => {
    expect(addDays(new Date('2026-01-01'), 5).toISOString().slice(0, 10)).toBe('2026-01-06');
  });

  it('rolls over into the next month', () => {
    expect(addDays(new Date('2026-01-31'), 1).toISOString().slice(0, 10)).toBe('2026-02-01');
  });

  it('supports negative offsets', () => {
    expect(addDays(new Date('2026-02-01'), -1).toISOString().slice(0, 10)).toBe('2026-01-31');
  });
});

describe('todayUtcDate', () => {
  it('returns a Date at UTC midnight matching the current UTC date', () => {
    const result = todayUtcDate();
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
    expect(result.getUTCMilliseconds()).toBe(0);
    expect(result.toISOString().slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/cycles/date-utils.test.ts`
Expected: FAIL — `Cannot find module './date-utils'`

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/server/cycles/date-utils.ts
import 'server-only';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from `a` to `b` (positive if `b` is after `a`). Both dates must be UTC-midnight `@db.Date`-style values. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/** Returns a new Date `days` days after `date` (negative `days` goes backward). */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Today's date at UTC midnight — matches how Prisma reads/writes `@db.Date` columns. */
export function todayUtcDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/cycles/date-utils.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/cycles/date-utils.ts frontend/src/lib/server/cycles/date-utils.test.ts
git commit -m "feat(cycles): add UTC date-math utilities"
```

---

## Task 2: Episode grouping

**Files:**
- Create: `frontend/src/lib/server/cycles/episodes.ts`
- Test: `frontend/src/lib/server/cycles/episodes.test.ts`

**Interfaces:**
- Consumes: `daysBetween` from `./date-utils` (Task 1).
- Produces: `interface Episode { start: Date; end: Date; length: number }` and `groupIntoEpisodes(sortedDates: Date[]): Episode[]` — consumed by Task 3 (`build-cycles.ts`) and Task 5 (`recompute.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/server/cycles/episodes.test.ts
import { describe, it, expect } from 'vitest';
import { groupIntoEpisodes } from './episodes';

function d(iso: string): Date {
  return new Date(iso);
}

describe('groupIntoEpisodes', () => {
  it('returns an empty array for no dates', () => {
    expect(groupIntoEpisodes([])).toEqual([]);
  });

  it('groups a single date into one one-day episode', () => {
    const result = groupIntoEpisodes([d('2026-01-01')]);
    expect(result).toEqual([{ start: d('2026-01-01'), end: d('2026-01-01'), length: 1 }]);
  });

  it('groups consecutive dates into a single episode', () => {
    const result = groupIntoEpisodes([d('2026-01-01'), d('2026-01-02'), d('2026-01-03')]);
    expect(result).toEqual([{ start: d('2026-01-01'), end: d('2026-01-03'), length: 3 }]);
  });

  it('starts a new episode after a gap of more than 1 day', () => {
    const result = groupIntoEpisodes([
      d('2026-01-01'),
      d('2026-01-02'),
      d('2026-01-30'),
      d('2026-01-31'),
    ]);
    expect(result).toEqual([
      { start: d('2026-01-01'), end: d('2026-01-02'), length: 2 },
      { start: d('2026-01-30'), end: d('2026-01-31'), length: 2 },
    ]);
  });

  it('handles a consecutive run spanning a month boundary as one episode', () => {
    const result = groupIntoEpisodes([d('2026-01-31'), d('2026-02-01'), d('2026-02-02')]);
    expect(result).toEqual([{ start: d('2026-01-31'), end: d('2026-02-02'), length: 3 }]);
  });

  it('produces one episode per isolated single-day entry', () => {
    const result = groupIntoEpisodes([d('2026-01-01'), d('2026-01-10'), d('2026-01-20')]);
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.length)).toEqual([1, 1, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/cycles/episodes.test.ts`
Expected: FAIL — `Cannot find module './episodes'`

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/server/cycles/episodes.ts
import 'server-only';
import { daysBetween } from './date-utils';

export interface Episode {
  start: Date;
  end: Date;
  length: number;
}

/**
 * Groups sorted, ascending, unique dates into contiguous-date episodes.
 * A gap of more than 1 day between two dates starts a new episode.
 * Caller must pass dates already sorted ascending (e.g. from a Prisma
 * `orderBy: { date: 'asc' }` query).
 */
export function groupIntoEpisodes(sortedDates: Date[]): Episode[] {
  if (sortedDates.length === 0) return [];

  const episodes: Episode[] = [];
  let start = sortedDates[0]!;
  let end = sortedDates[0]!;

  for (let i = 1; i < sortedDates.length; i++) {
    const current = sortedDates[i]!;
    if (daysBetween(end, current) === 1) {
      end = current;
    } else {
      episodes.push({ start, end, length: daysBetween(start, end) + 1 });
      start = current;
      end = current;
    }
  }
  episodes.push({ start, end, length: daysBetween(start, end) + 1 });

  return episodes;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/cycles/episodes.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/cycles/episodes.ts frontend/src/lib/server/cycles/episodes.test.ts
git commit -m "feat(cycles): add PeriodEvent-to-episode grouping"
```

---

## Task 3: Cycle building and outlier detection

**Files:**
- Create: `frontend/src/lib/server/cycles/build-cycles.ts`
- Test: `frontend/src/lib/server/cycles/build-cycles.test.ts`

**Interfaces:**
- Consumes: `Episode` type from `./episodes` (Task 2), `daysBetween`/`addDays` from `./date-utils` (Task 1).
- Produces: `interface ComputedCycle { startDate: Date; endDate: Date | null; length: number | null; isOutlier: boolean }` and `buildCycles(episodes: Episode[]): ComputedCycle[]` — consumed by Task 4 (`prediction.ts`) and Task 5 (`recompute.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/server/cycles/build-cycles.test.ts
import { describe, it, expect } from 'vitest';
import { buildCycles } from './build-cycles';
import type { Episode } from './episodes';

function d(iso: string): Date {
  return new Date(iso);
}

function episode(startIso: string): Episode {
  const start = d(startIso);
  return { start, end: start, length: 1 };
}

describe('buildCycles', () => {
  it('returns an empty array for no episodes', () => {
    expect(buildCycles([])).toEqual([]);
  });

  it('returns a single open cycle for one episode', () => {
    const result = buildCycles([episode('2026-01-01')]);
    expect(result).toEqual([
      { startDate: d('2026-01-01'), endDate: null, length: null, isOutlier: false },
    ]);
  });

  it('builds one complete cycle plus one open cycle for two episodes', () => {
    const result = buildCycles([episode('2026-01-01'), episode('2026-01-29')]);
    expect(result).toEqual([
      { startDate: d('2026-01-01'), endDate: d('2026-01-28'), length: 28, isOutlier: false },
      { startDate: d('2026-01-29'), endDate: null, length: null, isOutlier: false },
    ]);
  });

  it('does not run outlier detection with fewer than 3 complete cycles', () => {
    // 3 episodes -> 2 complete cycles with wildly different lengths (10, 90)
    const result = buildCycles([episode('2026-01-01'), episode('2026-01-11'), episode('2026-04-11')]);
    expect(result[0]?.isOutlier).toBe(false);
    expect(result[1]?.isOutlier).toBe(false);
  });

  it('flags a cycle whose length deviates from the median of the others beyond max(7, 30%)', () => {
    // Episode starts 28 days apart, except one 60-day gap -> complete lengths [28, 28, 60, 28]
    const episodes: Episode[] = [
      episode('2026-01-01'),
      episode('2026-01-29'), // +28
      episode('2026-02-26'), // +28
      episode('2026-04-27'), // +60
      episode('2026-05-25'), // +28 (this episode becomes the open cycle)
    ];

    const result = buildCycles(episodes);

    expect(result).toEqual([
      { startDate: d('2026-01-01'), endDate: d('2026-01-28'), length: 28, isOutlier: false },
      { startDate: d('2026-01-29'), endDate: d('2026-02-25'), length: 28, isOutlier: false },
      { startDate: d('2026-02-26'), endDate: d('2026-04-26'), length: 60, isOutlier: true },
      { startDate: d('2026-04-27'), endDate: d('2026-05-24'), length: 28, isOutlier: false },
      { startDate: d('2026-05-25'), endDate: null, length: null, isOutlier: false },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/cycles/build-cycles.test.ts`
Expected: FAIL — `Cannot find module './build-cycles'`

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/server/cycles/build-cycles.ts
import 'server-only';
import { daysBetween, addDays } from './date-utils';
import type { Episode } from './episodes';

export interface ComputedCycle {
  startDate: Date;
  endDate: Date | null;
  length: number | null;
  isOutlier: boolean;
}

const MIN_COMPLETE_CYCLES_FOR_OUTLIER_CHECK = 3;
const OUTLIER_MIN_ABS_DAYS = 7;
const OUTLIER_RELATIVE_FRACTION = 0.3;

/**
 * Pairs consecutive episode starts into `Cycle` rows. The most recent
 * episode always becomes an open cycle (`endDate`/`length` null). Runs
 * outlier detection (see `markOutliers`) once >=3 complete cycles exist.
 */
export function buildCycles(episodes: Episode[]): ComputedCycle[] {
  if (episodes.length === 0) return [];

  const cycles: ComputedCycle[] = [];
  for (let i = 0; i < episodes.length - 1; i++) {
    const current = episodes[i]!;
    const next = episodes[i + 1]!;
    cycles.push({
      startDate: current.start,
      endDate: addDays(next.start, -1),
      length: daysBetween(current.start, next.start),
      isOutlier: false,
    });
  }

  const lastEpisode = episodes[episodes.length - 1]!;
  cycles.push({ startDate: lastEpisode.start, endDate: null, length: null, isOutlier: false });

  markOutliers(cycles);
  return cycles;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Marks each complete cycle whose length deviates from the median of the
 * OTHER complete cycles' lengths by more than `max(7, 30% of that
 * median)`. This exact threshold is this codebase's own design decision
 * (not PRD-specified) — see the Phase 3 spec's "Cycle-detection
 * algorithm" section. Mutates `cycles` in place.
 */
function markOutliers(cycles: ComputedCycle[]): void {
  const completeIndices = cycles
    .map((c, i) => (c.length !== null ? i : -1))
    .filter((i) => i !== -1);

  if (completeIndices.length < MIN_COMPLETE_CYCLES_FOR_OUTLIER_CHECK) return;

  const lengths = completeIndices.map((i) => cycles[i]!.length!);

  completeIndices.forEach((cycleIndex, pos) => {
    const othersLengths = lengths.filter((_, p) => p !== pos);
    const med = median(othersLengths);
    const threshold = Math.max(OUTLIER_MIN_ABS_DAYS, OUTLIER_RELATIVE_FRACTION * med);
    const length = cycles[cycleIndex]!.length!;
    cycles[cycleIndex]!.isOutlier = Math.abs(length - med) > threshold;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/cycles/build-cycles.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/cycles/build-cycles.ts frontend/src/lib/server/cycles/build-cycles.test.ts
git commit -m "feat(cycles): build Cycle rows from episodes with outlier detection"
```

---

## Task 4: Prediction algorithm

**Files:**
- Create: `frontend/src/lib/server/cycles/prediction.ts`
- Test: `frontend/src/lib/server/cycles/prediction.test.ts`

**Interfaces:**
- Consumes: `ComputedCycle` from `./build-cycles` (Task 3), `Episode` from `./episodes` (Task 2), `addDays` from `./date-utils` (Task 1).
- Produces: `ALGORITHM_VERSION: string`, `interface PredictionResult { confidence: 'LOW' | 'MEDIUM' | 'HIGH'; expectedPeriodStart: Date; expectedPeriodEnd: Date; algorithmVersion: string }`, `computePrediction(cycles: ComputedCycle[], episodes: Episode[], profile: { usualCycleLength: number | null; usualPeriodLength: number | null }): PredictionResult | null` — consumed by Task 5 (`recompute.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/server/cycles/prediction.test.ts
import { describe, it, expect } from 'vitest';
import { computePrediction, ALGORITHM_VERSION } from './prediction';
import type { ComputedCycle } from './build-cycles';
import type { Episode } from './episodes';

function d(iso: string): Date {
  return new Date(iso);
}

function completeCycle(startIso: string, length: number, isOutlier = false): ComputedCycle {
  const start = d(startIso);
  return {
    startDate: start,
    endDate: new Date(start.getTime() + (length - 1) * 86400000),
    length,
    isOutlier,
  };
}

function openCycle(startIso: string): ComputedCycle {
  return { startDate: d(startIso), endDate: null, length: null, isOutlier: false };
}

function episode(startIso: string, length = 5): Episode {
  const start = d(startIso);
  return { start, end: new Date(start.getTime() + (length - 1) * 86400000), length };
}

describe('computePrediction — 0 complete cycles', () => {
  it('returns null when no usualCycleLength is declared', () => {
    const cycles = [openCycle('2026-01-01')];
    const episodes = [episode('2026-01-01')];
    const result = computePrediction(cycles, episodes, {
      usualCycleLength: null,
      usualPeriodLength: null,
    });
    expect(result).toBeNull();
  });

  it('uses the declared usualCycleLength, confidence LOW', () => {
    const cycles = [openCycle('2026-01-01')];
    const episodes = [episode('2026-01-01', 5)];
    const result = computePrediction(cycles, episodes, {
      usualCycleLength: 30,
      usualPeriodLength: null,
    });
    expect(result?.confidence).toBe('LOW');
    expect(result?.algorithmVersion).toBe(ALGORITHM_VERSION);
    expect(result?.expectedPeriodStart.toISOString().slice(0, 10)).toBe('2026-01-31');
    // periodLength falls back to the median of observed episode lengths (5)
    expect(result?.expectedPeriodEnd.toISOString().slice(0, 10)).toBe('2026-02-04');
  });

  it('uses Profile.usualPeriodLength over the episode-length fallback when declared', () => {
    const cycles = [openCycle('2026-01-01')];
    const episodes = [episode('2026-01-01', 5)];
    const result = computePrediction(cycles, episodes, {
      usualCycleLength: 30,
      usualPeriodLength: 7,
    });
    expect(result?.expectedPeriodEnd.toISOString().slice(0, 10)).toBe('2026-02-06');
  });
});

describe('computePrediction — 1-2 complete cycles', () => {
  it('averages a single complete cycle, confidence LOW', () => {
    const cycles = [completeCycle('2026-01-01', 30), openCycle('2026-01-31')];
    const episodes = [episode('2026-01-01'), episode('2026-01-31')];
    const result = computePrediction(cycles, episodes, {
      usualCycleLength: null,
      usualPeriodLength: null,
    });
    expect(result?.confidence).toBe('LOW');
    expect(result?.expectedPeriodStart.toISOString().slice(0, 10)).toBe('2026-03-02');
  });

  it('averages two complete cycles regardless of their variance, confidence LOW', () => {
    const cycles = [
      completeCycle('2026-01-01', 28),
      completeCycle('2026-01-29', 32),
      openCycle('2026-03-01'),
    ];
    const episodes = [episode('2026-01-01'), episode('2026-01-29'), episode('2026-03-01')];
    const result = computePrediction(cycles, episodes, {
      usualCycleLength: null,
      usualPeriodLength: null,
    });
    expect(result?.confidence).toBe('LOW');
    // average(28, 32) = 30
    expect(result?.expectedPeriodStart.toISOString().slice(0, 10)).toBe('2026-03-31');
  });
});

describe('computePrediction — 3-5 complete cycles', () => {
  it('weighted average with low CV yields MEDIUM confidence', () => {
    const cycles = [
      completeCycle('2026-01-01', 28),
      completeCycle('2026-01-29', 28),
      completeCycle('2026-02-26', 30),
      openCycle('2026-03-28'),
    ];
    const episodes = cycles.map((c) => episode(c.startDate.toISOString().slice(0, 10)));
    const result = computePrediction(cycles, episodes, {
      usualCycleLength: null,
      usualPeriodLength: null,
    });
    expect(result?.confidence).toBe('MEDIUM');
    // weighted average of [28,28,30] with weights [1,2,3] = 174/6 = 29
    expect(result?.expectedPeriodStart.toISOString().slice(0, 10)).toBe('2026-04-26');
  });

  it('weighted average with high CV yields LOW confidence', () => {
    const cycles = [
      completeCycle('2026-01-01', 20),
      completeCycle('2026-01-21', 28),
      completeCycle('2026-02-18', 40),
      openCycle('2026-03-30'),
    ];
    const episodes = cycles.map((c) => episode(c.startDate.toISOString().slice(0, 10)));
    const result = computePrediction(cycles, episodes, {
      usualCycleLength: null,
      usualPeriodLength: null,
    });
    expect(result?.confidence).toBe('LOW');
  });
});

describe('computePrediction — 6+ complete cycles', () => {
  it('median with low CV and <=1 outlier in the window yields HIGH confidence', () => {
    const lengths = [28, 28, 29, 28, 27, 28];
    let cursor = d('2026-01-01');
    const cycles: ComputedCycle[] = [];
    for (const length of lengths) {
      cycles.push(completeCycle(cursor.toISOString().slice(0, 10), length));
      cursor = new Date(cursor.getTime() + length * 86400000);
    }
    cycles.push(openCycle(cursor.toISOString().slice(0, 10)));
    const episodes = cycles.map((c) => episode(c.startDate.toISOString().slice(0, 10)));

    const result = computePrediction(cycles, episodes, {
      usualCycleLength: null,
      usualPeriodLength: null,
    });
    expect(result?.confidence).toBe('HIGH');
  });

  it('median with CV >= 0.15 and 0 outliers yields MEDIUM confidence', () => {
    const lengths = [20, 28, 36, 22, 34, 28];
    let cursor = d('2026-01-01');
    const cycles: ComputedCycle[] = [];
    for (const length of lengths) {
      cycles.push(completeCycle(cursor.toISOString().slice(0, 10), length));
      cursor = new Date(cursor.getTime() + length * 86400000);
    }
    cycles.push(openCycle(cursor.toISOString().slice(0, 10)));
    const episodes = cycles.map((c) => episode(c.startDate.toISOString().slice(0, 10)));

    const result = computePrediction(cycles, episodes, {
      usualCycleLength: null,
      usualPeriodLength: null,
    });
    expect(result?.confidence).toBe('MEDIUM');
  });

  it('more than 1 outlier in the window forces MEDIUM even with 0 residual CV', () => {
    // isOutlier flags are set directly (this test exercises computePrediction's own
    // confidence logic in isolation from build-cycles' outlier detection).
    const cycles: ComputedCycle[] = [
      completeCycle('2026-01-01', 28),
      completeCycle('2026-01-29', 28),
      completeCycle('2026-02-26', 28),
      completeCycle('2026-03-26', 28),
      completeCycle('2026-04-23', 70, true),
      completeCycle('2026-07-02', 5, true),
      openCycle('2026-07-07'),
    ];
    const episodes = cycles.map((c) => episode(c.startDate.toISOString().slice(0, 10)));

    const result = computePrediction(cycles, episodes, {
      usualCycleLength: null,
      usualPeriodLength: null,
    });
    expect(result?.confidence).toBe('MEDIUM');
  });

  it('forces LOW when CV > 0.30 even though the base table would say MEDIUM', () => {
    const cycles: ComputedCycle[] = [
      completeCycle('2026-01-01', 15),
      completeCycle('2026-01-16', 45),
      completeCycle('2026-03-02', 15),
      completeCycle('2026-03-17', 45),
      completeCycle('2026-05-01', 15),
      completeCycle('2026-05-16', 45),
      openCycle('2026-06-30'),
    ];
    const episodes = cycles.map((c) => episode(c.startDate.toISOString().slice(0, 10)));

    const result = computePrediction(cycles, episodes, {
      usualCycleLength: null,
      usualPeriodLength: null,
    });
    expect(result?.confidence).toBe('LOW');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/cycles/prediction.test.ts`
Expected: FAIL — `Cannot find module './prediction'`

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/server/cycles/prediction.ts
import 'server-only';
import { addDays } from './date-utils';
import type { ComputedCycle } from './build-cycles';
import type { Episode } from './episodes';

export const ALGORITHM_VERSION = 'v1';

const CV_MEDIUM_THRESHOLD = 0.15;
const CV_FORCE_LOW_THRESHOLD = 0.3;
const SLIDING_WINDOW_SIZE = 6;
const DEFAULT_PERIOD_LENGTH_DAYS = 5;
const MEDIUM_TIER_MAX_COMPLETE = 5;

export interface PredictionResult {
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  expectedPeriodStart: Date;
  expectedPeriodEnd: Date;
  algorithmVersion: string;
}

interface ProfileLengths {
  usualCycleLength: number | null;
  usualPeriodLength: number | null;
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Linearly increasing weights: oldest (index 0) = weight 1, ... newest = weight n. `values` MUST be chronologically ascending. */
function weightedAverage(values: number[]): number {
  const weights = values.map((_, i) => i + 1);
  const weightedSum = values.reduce((sum, v, i) => sum + v * weights[i]!, 0);
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  return weightedSum / weightSum;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = average(values);
  if (mean === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/** Non-outlier lengths, or all lengths if every cycle in `group` is flagged (never return an empty array). */
function nonOutlierLengths(group: ComputedCycle[]): number[] {
  const nonOutlier = group.filter((c) => !c.isOutlier).map((c) => c.length!);
  return nonOutlier.length > 0 ? nonOutlier : group.map((c) => c.length!);
}

function resolvePeriodLengthDays(usualPeriodLength: number | null, episodes: Episode[]): number {
  if (usualPeriodLength !== null) return usualPeriodLength;
  if (episodes.length === 0) return DEFAULT_PERIOD_LENGTH_DAYS;
  return Math.round(median(episodes.map((e) => e.length)));
}

/**
 * Implements the Phase 3 spec's 4-tier prediction algorithm (PRD §7.2)
 * plus the CV-based confidence rules (§7.3, thresholds fixed by this
 * codebase — see the spec's "Prediction algorithm" section). Returns
 * `null` when no prediction can be computed (0 complete cycles and no
 * declared `usualCycleLength`) — callers must delete any existing
 * `Prediction` row in that case, not leave a stale one.
 */
export function computePrediction(
  cycles: ComputedCycle[],
  episodes: Episode[],
  profile: ProfileLengths,
): PredictionResult | null {
  const mostRecentEpisode = episodes[episodes.length - 1];
  if (!mostRecentEpisode) return null;

  const allComplete = cycles.filter((c) => c.length !== null);
  const completeCount = allComplete.length;

  let cycleLengthEstimate: number;
  let confidence: 'LOW' | 'MEDIUM' | 'HIGH';

  if (completeCount === 0) {
    if (profile.usualCycleLength === null) return null;
    cycleLengthEstimate = profile.usualCycleLength;
    confidence = 'LOW';
  } else if (completeCount <= 2) {
    cycleLengthEstimate = average(nonOutlierLengths(allComplete));
    confidence = 'LOW';
  } else if (completeCount <= MEDIUM_TIER_MAX_COMPLETE) {
    const lengths = nonOutlierLengths(allComplete);
    cycleLengthEstimate = weightedAverage(lengths);
    const cv = coefficientOfVariation(lengths);
    confidence = cv < CV_MEDIUM_THRESHOLD ? 'MEDIUM' : 'LOW';
  } else {
    const window = allComplete.slice(-SLIDING_WINDOW_SIZE);
    const nonOutlierInWindow = window.filter((c) => !c.isOutlier);
    const outlierCountInWindow = window.length - nonOutlierInWindow.length;
    const lengths = nonOutlierLengths(window);
    cycleLengthEstimate = median(lengths);
    const cv = coefficientOfVariation(lengths);
    confidence = cv < CV_MEDIUM_THRESHOLD && outlierCountInWindow <= 1 ? 'HIGH' : 'MEDIUM';
    // The >=6 tier is the only one where this override changes the
    // outcome: the table above already resolves every CV >= 0.15 to LOW
    // at the 1-2 and 3-5 tiers (a superset of CV > 0.30), so re-checking
    // it there would be dead code.
    if (cv > CV_FORCE_LOW_THRESHOLD) confidence = 'LOW';
  }

  const periodLengthDays = resolvePeriodLengthDays(profile.usualPeriodLength, episodes);
  const expectedPeriodStart = addDays(mostRecentEpisode.start, Math.round(cycleLengthEstimate));
  const expectedPeriodEnd = addDays(expectedPeriodStart, periodLengthDays - 1);

  return {
    confidence,
    expectedPeriodStart,
    expectedPeriodEnd,
    algorithmVersion: ALGORITHM_VERSION,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/cycles/prediction.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/cycles/prediction.ts frontend/src/lib/server/cycles/prediction.test.ts
git commit -m "feat(cycles): add prediction algorithm with tiered confidence"
```

---

## Task 5: Recompute orchestrator

**Files:**
- Create: `frontend/src/lib/server/cycles/recompute.ts`
- Test: `frontend/src/lib/server/cycles/recompute.test.ts`

**Interfaces:**
- Consumes: `groupIntoEpisodes` (Task 2), `buildCycles` (Task 3), `computePrediction`/`ALGORITHM_VERSION` (Task 4).
- Produces: `recomputeCyclesAndPrediction(tx: Prisma.TransactionClient, userId: string): Promise<void>` — consumed by Task 6 (`POST /api/period-events`) and Task 9 (`POST /api/onboarding/complete`).

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/lib/server/cycles/recompute.test.ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { recomputeCyclesAndPrediction } from './recompute';

function d(iso: string): Date {
  return new Date(iso);
}

beforeEach(() => {
  prismaMock.cycle.upsert.mockResolvedValue({} as never);
  prismaMock.prediction.upsert.mockResolvedValue({} as never);
  prismaMock.prediction.deleteMany.mockResolvedValue({ count: 0 } as never);
});

describe('recomputeCyclesAndPrediction', () => {
  it('does nothing but delete any stale Prediction when there are no PeriodEvents', async () => {
    prismaMock.periodEvent.findMany.mockResolvedValue([]);
    prismaMock.profile.findUnique.mockResolvedValue(null);

    await recomputeCyclesAndPrediction(prismaMock, 'u1');

    expect(prismaMock.periodEvent.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
    expect(prismaMock.cycle.upsert).not.toHaveBeenCalled();
    expect(prismaMock.prediction.upsert).not.toHaveBeenCalled();
    expect(prismaMock.prediction.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('upserts a single open Cycle and skips Prediction when no length is known', async () => {
    prismaMock.periodEvent.findMany.mockResolvedValue([{ date: d('2026-01-01') }] as never);
    prismaMock.profile.findUnique.mockResolvedValue({
      usualCycleLength: null,
      usualPeriodLength: null,
    } as never);

    await recomputeCyclesAndPrediction(prismaMock, 'u1');

    expect(prismaMock.cycle.upsert).toHaveBeenCalledTimes(1);
    const arg = prismaMock.cycle.upsert.mock.calls[0]?.[0];
    expect(arg?.where).toEqual({ userId_startDate: { userId: 'u1', startDate: d('2026-01-01') } });
    expect(arg?.create).toMatchObject({
      userId: 'u1',
      startDate: d('2026-01-01'),
      endDate: null,
      length: null,
      isOutlier: false,
    });
    expect(prismaMock.prediction.upsert).not.toHaveBeenCalled();
    expect(prismaMock.prediction.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('upserts a Prediction using the declared usualCycleLength when 0 cycles are complete', async () => {
    prismaMock.periodEvent.findMany.mockResolvedValue([{ date: d('2026-01-01') }] as never);
    prismaMock.profile.findUnique.mockResolvedValue({
      usualCycleLength: 30,
      usualPeriodLength: 5,
    } as never);

    await recomputeCyclesAndPrediction(prismaMock, 'u1');

    expect(prismaMock.prediction.upsert).toHaveBeenCalledTimes(1);
    const arg = prismaMock.prediction.upsert.mock.calls[0]?.[0];
    expect(arg?.where).toEqual({ userId: 'u1' });
    expect(arg?.create).toMatchObject({ userId: 'u1', confidence: 'LOW', algorithmVersion: 'v1' });
    expect(prismaMock.prediction.deleteMany).not.toHaveBeenCalled();
  });

  it('upserts one Cycle per episode pair for multiple PeriodEvents', async () => {
    prismaMock.periodEvent.findMany.mockResolvedValue([
      { date: d('2026-01-01') },
      { date: d('2026-01-29') },
    ] as never);
    prismaMock.profile.findUnique.mockResolvedValue({
      usualCycleLength: null,
      usualPeriodLength: null,
    } as never);

    await recomputeCyclesAndPrediction(prismaMock, 'u1');

    expect(prismaMock.cycle.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.prediction.upsert).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/cycles/recompute.test.ts`
Expected: FAIL — `Cannot find module './recompute'`

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/lib/server/cycles/recompute.ts
import 'server-only';
import type { Prisma } from '@prisma/client';
import { groupIntoEpisodes } from './episodes';
import { buildCycles } from './build-cycles';
import { computePrediction } from './prediction';

/**
 * Re-derives every `Cycle` row and the single `Prediction` row for a
 * user from their `PeriodEvent` history. Call this inside the SAME
 * transaction as any `PeriodEvent` write (see `POST /api/period-events`
 * and `POST /api/onboarding/complete`) — never outside a transaction,
 * and never from a cron/background job (Phase 3 spec: event-driven,
 * materialized computation, no outbox).
 */
export async function recomputeCyclesAndPrediction(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const [periodEvents, profile] = await Promise.all([
    tx.periodEvent.findMany({
      where: { userId },
      orderBy: { date: 'asc' },
      select: { date: true },
    }),
    tx.profile.findUnique({
      where: { userId },
      select: { usualCycleLength: true, usualPeriodLength: true },
    }),
  ]);

  const episodes = groupIntoEpisodes(periodEvents.map((e) => e.date));
  const cycles = buildCycles(episodes);

  for (const cycle of cycles) {
    await tx.cycle.upsert({
      where: { userId_startDate: { userId, startDate: cycle.startDate } },
      create: {
        userId,
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        length: cycle.length,
        isOutlier: cycle.isOutlier,
      },
      update: {
        endDate: cycle.endDate,
        length: cycle.length,
        isOutlier: cycle.isOutlier,
      },
    });
  }

  const prediction = computePrediction(cycles, episodes, {
    usualCycleLength: profile?.usualCycleLength ?? null,
    usualPeriodLength: profile?.usualPeriodLength ?? null,
  });

  if (prediction) {
    await tx.prediction.upsert({
      where: { userId },
      create: {
        userId,
        algorithmVersion: prediction.algorithmVersion,
        confidence: prediction.confidence,
        expectedPeriodStart: prediction.expectedPeriodStart,
        expectedPeriodEnd: prediction.expectedPeriodEnd,
        computedAt: new Date(),
      },
      update: {
        algorithmVersion: prediction.algorithmVersion,
        confidence: prediction.confidence,
        expectedPeriodStart: prediction.expectedPeriodStart,
        expectedPeriodEnd: prediction.expectedPeriodEnd,
        computedAt: new Date(),
      },
    });
  } else {
    await tx.prediction.deleteMany({ where: { userId } });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/cycles/recompute.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/cycles/recompute.ts frontend/src/lib/server/cycles/recompute.test.ts
git commit -m "feat(cycles): add recomputeCyclesAndPrediction orchestrator"
```

---

## Task 6: `POST /api/period-events`

**Files:**
- Create: `frontend/src/app/api/period-events/route.ts`
- Test: `frontend/src/app/api/period-events/route.test.ts`

**Interfaces:**
- Consumes: `recomputeCyclesAndPrediction` (Task 5), `todayUtcDate` (Task 1), `requireAuth`/`verifyCsrf` (existing).
- Produces: `POST /api/period-events` — `{ ok: true }` on success. No other task consumes this route directly.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/app/api/period-events/route.test.ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'u1', email: 'a@b.com' } })),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/cycles/recompute', () => ({
  recomputeCyclesAndPrediction: vi.fn(async () => {}),
}));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { recomputeCyclesAndPrediction } from '@/lib/server/cycles/recompute';
import { POST } from './route';

function makeReq(body?: unknown): NextRequest {
  return new NextRequest('http://test/api/period-events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } });
  vi.mocked(verifyCsrf).mockReturnValue(null);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
  prismaMock.periodEvent.upsert.mockResolvedValue({} as never);
});

describe('POST /api/period-events', () => {
  it('upserts a PeriodEvent for today with the default flow MEDIUM and triggers recompute', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(prismaMock.periodEvent.upsert).toHaveBeenCalledTimes(1);
    const arg = prismaMock.periodEvent.upsert.mock.calls[0]?.[0];
    expect(arg?.create?.userId).toBe('u1');
    expect(arg?.create?.flow).toBe('MEDIUM');
    expect(arg?.update).toEqual({ flow: 'MEDIUM' });

    expect(recomputeCyclesAndPrediction).toHaveBeenCalledWith(prismaMock, 'u1');
  });

  it('accepts no request body at all (defaults still apply)', async () => {
    const res = await POST(makeReq(undefined));
    expect(res.status).toBe(200);
    expect(prismaMock.periodEvent.upsert).toHaveBeenCalledTimes(1);
  });

  it('accepts an explicit flow value', async () => {
    const res = await POST(makeReq({ flow: 'HEAVY' }));
    expect(res.status).toBe(200);
    const arg = prismaMock.periodEvent.upsert.mock.calls[0]?.[0];
    expect(arg?.create?.flow).toBe('HEAVY');
  });

  it('rejects an invalid flow value with VALIDATION_FAILED', async () => {
    const res = await POST(makeReq({ flow: 'NOT_A_FLOW' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.periodEvent.upsert).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
  });

  it('returns 403 when the CSRF check fails', async () => {
    vi.mocked(verifyCsrf).mockReturnValue(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }) as never,
    );
    const res = await POST(makeReq({}));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/period-events/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/app/api/period-events/route.ts
// POST /api/period-events — Phase 3.
//
// The minimal "Mes règles ont commencé" logging CTA. Always logs TODAY
// (no free-date entry — that is the full journal, E4, a later phase).
// Idempotent: a second call on the same day updates the existing row's
// flow instead of creating a duplicate, so a double-tap can never split
// an episode into two.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { recomputeCyclesAndPrediction } from '@/lib/server/cycles/recompute';
import { todayUtcDate } from '@/lib/server/cycles/date-utils';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const Body = z.object({
  flow: z.enum(['SPOTTING', 'LIGHT', 'MEDIUM', 'HEAVY']).default('MEDIUM'),
});

function jsonError(
  code: string,
  status: number,
  requestId: string,
  message?: string,
): NextResponse {
  const res = NextResponse.json({ error: code, ...(message ? { message } : {}) }, { status });
  res.headers.set('x-request-id', requestId);
  return res;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) {
      csrfFail.headers.set('x-request-id', ctx.requestId);
      return csrfFail;
    }

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    let body: z.infer<typeof Body>;
    try {
      const json = await req.json().catch(() => ({}));
      body = Body.parse(json);
    } catch {
      return jsonError('VALIDATION_FAILED', 400, ctx.requestId, 'Invalid request body');
    }

    const today = todayUtcDate();

    await prisma.$transaction(async (tx) => {
      await tx.periodEvent.upsert({
        where: { userId_date: { userId: auth.user.sub, date: today } },
        create: { userId: auth.user.sub, date: today, flow: body.flow },
        update: { flow: body.flow },
      });

      await recomputeCyclesAndPrediction(tx, auth.user.sub);
    });

    log.info('period event logged', { userId: auth.user.sub, flow: body.flow });
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/period-events/route.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/period-events/route.ts frontend/src/app/api/period-events/route.test.ts
git commit -m "feat(api): add POST /api/period-events logging endpoint"
```

---

## Task 7: `GET /api/cycles`

**Files:**
- Create: `frontend/src/app/api/cycles/route.ts`
- Test: `frontend/src/app/api/cycles/route.test.ts`

**Interfaces:**
- Consumes: `todayUtcDate` (Task 1), `requireAuth` (existing).
- Produces: `GET /api/cycles` → `{ cycles: Array<{ startDate: string; endDate: string | null; length: number | null; isOutlier: boolean }>; todayLogged: boolean }` — consumed by the follow-up Home/Calendar UI work (out of this plan's scope).

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/app/api/cycles/route.test.ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'u1', email: 'a@b.com' } })),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/cycles', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } });
});

describe('GET /api/cycles', () => {
  it('returns cycles sorted startDate desc with todayLogged=false when none logged today', async () => {
    prismaMock.cycle.findMany.mockResolvedValue([
      {
        startDate: new Date('2026-02-01'),
        endDate: null,
        length: null,
        isOutlier: false,
      },
      {
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
        length: 31,
        isOutlier: true,
      },
    ] as never);
    prismaMock.periodEvent.findUnique.mockResolvedValue(null);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      cycles: [
        { startDate: '2026-02-01', endDate: null, length: null, isOutlier: false },
        { startDate: '2026-01-01', endDate: '2026-01-31', length: 31, isOutlier: true },
      ],
      todayLogged: false,
    });

    expect(prismaMock.cycle.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { startDate: 'desc' },
      select: { startDate: true, endDate: true, length: true, isOutlier: true },
    });
  });

  it('returns todayLogged=true when a PeriodEvent exists for today', async () => {
    prismaMock.cycle.findMany.mockResolvedValue([]);
    prismaMock.periodEvent.findUnique.mockResolvedValue({ userId: 'u1' } as never);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.todayLogged).toBe(true);
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

Run: `pnpm --filter frontend exec vitest run src/app/api/cycles/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/app/api/cycles/route.ts
// GET /api/cycles — Phase 3. Read-only: returns the caller's full Cycle
// history (no pagination — a user's history is a few dozen rows even
// after years of use) plus `todayLogged`, the one boolean the Home
// screen's logging CTA needs to know whether to show itself.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { todayUtcDate } from '@/lib/server/cycles/date-utils';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const [cycles, todayEvent] = await Promise.all([
      prisma.cycle.findMany({
        where: { userId: auth.user.sub },
        orderBy: { startDate: 'desc' },
        select: { startDate: true, endDate: true, length: true, isOutlier: true },
      }),
      prisma.periodEvent.findUnique({
        where: { userId_date: { userId: auth.user.sub, date: todayUtcDate() } },
        select: { userId: true },
      }),
    ]);

    return NextResponse.json(
      {
        cycles: cycles.map((c) => ({
          startDate: c.startDate.toISOString().slice(0, 10),
          endDate: c.endDate ? c.endDate.toISOString().slice(0, 10) : null,
          length: c.length,
          isOutlier: c.isOutlier,
        })),
        todayLogged: todayEvent !== null,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/cycles/route.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/cycles/route.ts frontend/src/app/api/cycles/route.test.ts
git commit -m "feat(api): add GET /api/cycles"
```

---

## Task 8: `GET /api/predictions/current`

**Files:**
- Create: `frontend/src/app/api/predictions/current/route.ts`
- Test: `frontend/src/app/api/predictions/current/route.test.ts`

**Interfaces:**
- Consumes: `requireAuth` (existing).
- Produces: `GET /api/predictions/current` → `{ prediction: { confidence; expectedPeriodStart; expectedPeriodEnd; algorithmVersion; computedAt } | null }` — consumed by the follow-up Home/Calendar UI work (out of this plan's scope).

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/app/api/predictions/current/route.test.ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'u1', email: 'a@b.com' } })),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/predictions/current', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } });
});

describe('GET /api/predictions/current', () => {
  it('returns the serialized Prediction when one exists', async () => {
    prismaMock.prediction.findUnique.mockResolvedValue({
      userId: 'u1',
      algorithmVersion: 'v1',
      confidence: 'MEDIUM',
      expectedPeriodStart: new Date('2026-03-01'),
      expectedPeriodEnd: new Date('2026-03-05'),
      ovulationEstimate: null,
      fertileWindowStart: null,
      fertileWindowEnd: null,
      computedAt: new Date('2026-02-01T10:00:00.000Z'),
    } as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      prediction: {
        confidence: 'MEDIUM',
        expectedPeriodStart: '2026-03-01',
        expectedPeriodEnd: '2026-03-05',
        algorithmVersion: 'v1',
        computedAt: '2026-02-01T10:00:00.000Z',
      },
    });

    expect(prismaMock.prediction.findUnique).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('returns { prediction: null } as a normal 200 response when none exists', async () => {
    prismaMock.prediction.findUnique.mockResolvedValue(null);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ prediction: null });
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

Run: `pnpm --filter frontend exec vitest run src/app/api/predictions/current/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/app/api/predictions/current/route.ts
// GET /api/predictions/current — Phase 3. Read-only. `prediction: null`
// is a normal, expected 200 response (0 complete cycles, no declared
// usualCycleLength) — never treated as an error. Fertility fields
// (ovulationEstimate, fertileWindowStart/End) are intentionally omitted
// from this response shape — always null in this phase (E5, later).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const prediction = await prisma.prediction.findUnique({ where: { userId: auth.user.sub } });

    return NextResponse.json(
      {
        prediction: prediction
          ? {
              confidence: prediction.confidence,
              expectedPeriodStart: prediction.expectedPeriodStart.toISOString().slice(0, 10),
              expectedPeriodEnd: prediction.expectedPeriodEnd.toISOString().slice(0, 10),
              algorithmVersion: prediction.algorithmVersion,
              computedAt: prediction.computedAt.toISOString(),
            }
          : null,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/predictions/current/route.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/predictions/current/route.ts frontend/src/app/api/predictions/current/route.test.ts
git commit -m "feat(api): add GET /api/predictions/current"
```

---

## Task 9: Wire recompute into `POST /api/onboarding/complete`

**Files:**
- Modify: `frontend/src/app/api/onboarding/complete/route.ts`
- Modify: `frontend/src/app/api/onboarding/complete/route.test.ts`

**Interfaces:**
- Consumes: `recomputeCyclesAndPrediction` (Task 5).
- Produces: no new exports — this task only adds a call inside the existing transaction so a user who declared `lastPeriodDate`/`usualCycleLength` at onboarding gets an immediate `Prediction`.

- [ ] **Step 1: Write the failing test**

Add these two `it` blocks inside the existing `describe('POST /api/onboarding/complete', ...)` block in `frontend/src/app/api/onboarding/complete/route.test.ts`, and add the mock + import at the top of the file alongside the existing `vi.mock` calls:

```ts
// Add near the top, alongside the existing vi.mock calls:
vi.mock('@/lib/server/cycles/recompute', () => ({
  recomputeCyclesAndPrediction: vi.fn(async () => {}),
}));

// Add near the other imports:
import { recomputeCyclesAndPrediction } from '@/lib/server/cycles/recompute';
```

```ts
  it('calls recomputeCyclesAndPrediction after creating a PeriodEvent from lastPeriodDate', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);
    prismaMock.profile.create.mockResolvedValue({} as never);
    prismaMock.consent.create.mockResolvedValue({} as never);
    prismaMock.periodEvent.create.mockResolvedValue({} as never);

    await POST(makeReq({ ...VALID_BODY, lastPeriodDate: '2026-08-01' }));

    expect(recomputeCyclesAndPrediction).toHaveBeenCalledWith(prismaMock, 'u1');
  });

  it('calls recomputeCyclesAndPrediction even when lastPeriodDate is null', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);
    prismaMock.profile.create.mockResolvedValue({} as never);
    prismaMock.consent.create.mockResolvedValue({} as never);

    await POST(makeReq(VALID_BODY));

    expect(recomputeCyclesAndPrediction).toHaveBeenCalledWith(prismaMock, 'u1');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/onboarding/complete/route.test.ts`
Expected: FAIL — the two new tests fail with "expected recomputeCyclesAndPrediction to have been called" (the mock exists but `route.ts` never calls it yet).

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/app/api/onboarding/complete/route.ts`, add the import alongside the existing ones:

```ts
import { recomputeCyclesAndPrediction } from '@/lib/server/cycles/recompute';
```

Then change the end of the `prisma.$transaction(async (tx) => { ... })` block from:

```ts
      if (body.lastPeriodDate) {
        await tx.periodEvent.create({
          data: {
            userId: auth.user.sub,
            date: new Date(body.lastPeriodDate),
            flow: 'MEDIUM',
          },
        });
      }
    });
```

to:

```ts
      if (body.lastPeriodDate) {
        await tx.periodEvent.create({
          data: {
            userId: auth.user.sub,
            date: new Date(body.lastPeriodDate),
            flow: 'MEDIUM',
          },
        });
      }

      await recomputeCyclesAndPrediction(tx, auth.user.sub);
    });
```

This call is unconditional (runs every onboarding completion, not only when `lastPeriodDate` was provided) — a user who declares `usualCycleLength` but answers "Je ne sais pas" to `lastPeriodDate` still needs the tier-0 "declared length" branch of the prediction algorithm to run.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/onboarding/complete/route.test.ts`
Expected: PASS (all tests, including the 2 new ones — 10 total)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/onboarding/complete/route.ts frontend/src/app/api/onboarding/complete/route.test.ts
git commit -m "feat(onboarding): trigger recomputeCyclesAndPrediction on completion"
```

---

## Final verification

After Task 9, run the full suite and static checks before considering this plan complete:

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
```

Expected: all green, including every pre-existing test (no regressions in `onboarding/complete`, `profile`, `auth/me`, etc.).
