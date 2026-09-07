# Phase 5 — Fertility Window / Projet Bébé (E5) Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute and expose a fertile-window/ovulation estimate from the existing period-prediction engine, and add a today-only read/write API for fertility signals (basal temperature, cervical mucus, LH test), without any signal-based prediction adjustment or subscription gating.

**Architecture:** Task 1 adds a small, separate, versioned algorithm unit (`fertility-window.ts`) that derives ovulation/fertile-window dates from the already-computed period prediction via standard luteal-phase back-calculation, wires it into `recompute.ts`'s existing `Prediction` upsert, and surfaces the 3 already-reserved `Prediction` columns through `GET /api/predictions/current`. Task 2 is independent: it adds a `@@unique` constraint to the already-shipped (but so far unused) `FertilitySignal` model and a new `GET`/`PUT /api/fertility-signals/today` route that folds/unfolds its normalized per-type rows into one flat client-facing shape.

**Tech Stack:** Next.js 16 Route Handlers, Prisma 5 + Neon, Zod, Vitest + `vitest-mock-extended` (`prismaMock`).

**Spec:** `docs/superpowers/specs/2026-09-07-phase5-fertility-window-design.md`

## Global Constraints

- Every Route Handler MUST `export const runtime = 'nodejs'`.
- CSRF (`verifyCsrf(req)`) is checked only on the mutating verb (`PUT`), never on `GET`.
- `frontend/src/lib/server/cycles/recompute.ts` is a CLAUDE.md-protected file. This exact, minimal extension (3 additive nullable columns) was already presented and approved by the user in the Phase 5 spec's §4 — the implementer proceeds directly, no need to re-ask.
- No call to `recomputeCyclesAndPrediction` from the new `fertility-signals/today` route — signals do not feed the prediction engine this phase (no signal-adjustment rule engine yet; PRD §8.2 defers that to a future, clinically-validated version).
- No subscription/entitlement/paywall check anywhere in this phase's code — no `Subscription` model exists yet (E7, not built); `FertilitySignal` and its route are fully accessible, matching the rest of the app's current state.
- Writing health data requires a completed onboarding: `PROFILE_NOT_FOUND` 404 gate (`prisma.profile.findUnique` returning `null`) on the mutating verb, same reasoning as every other health-data route in this codebase.
- `algorithmVersion` on `Prediction` stays `'v1'` — unchanged this phase.
- Dates are UTC-midnight `@db.Date` values throughout — use `todayUtcDate()`/`addDays()` from `frontend/src/lib/server/cycles/date-utils.ts`, never hand-rolled date math.

---

### Task 1: Fertile-window algorithm + `recompute.ts` + `predictions/current` extension

**Files:**
- Create: `frontend/src/lib/server/cycles/fertility-window.ts`
- Create: `frontend/src/lib/server/cycles/fertility-window.test.ts`
- Modify: `frontend/src/lib/server/cycles/recompute.ts:5` (add import), `:80-107` (extend the `Prediction` upsert)
- Modify: `frontend/src/lib/server/cycles/recompute.test.ts:57-71` (extend one existing test with fertility-field assertions)
- Modify: `frontend/src/app/api/predictions/current/route.ts` (replace entire file — extend response shape)
- Modify: `frontend/src/app/api/predictions/current/route.test.ts:22-49` (extend existing test), add 1 new test

**Interfaces:**
- Consumes: `PredictionResult` (from `./prediction`, already exists: `{ confidence, expectedPeriodStart: Date, expectedPeriodEnd: Date, algorithmVersion: string }`), `addDays(date: Date, days: number): Date` (from `./date-utils`, already exists).
- Produces: `computeFertilityWindow(prediction: PredictionResult | null): FertilityWindowResult | null` where `FertilityWindowResult = { ovulationEstimate: Date; fertileWindowStart: Date; fertileWindowEnd: Date }`. `Prediction.ovulationEstimate`/`fertileWindowStart`/`fertileWindowEnd` populated on every recompute. `GET /api/predictions/current` response gains `ovulationEstimate`/`fertileWindowStart`/`fertileWindowEnd: string | null` (YYYY-MM-DD).

- [ ] **Step 1: Write the failing test for `computeFertilityWindow`**

Create `frontend/src/lib/server/cycles/fertility-window.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeFertilityWindow } from './fertility-window';
import type { PredictionResult } from './prediction';

function prediction(expectedPeriodStartIso: string): PredictionResult {
  return {
    confidence: 'MEDIUM',
    expectedPeriodStart: new Date(expectedPeriodStartIso),
    expectedPeriodEnd: new Date(expectedPeriodStartIso),
    algorithmVersion: 'v1',
  };
}

describe('computeFertilityWindow', () => {
  it('returns null when prediction is null', () => {
    expect(computeFertilityWindow(null)).toBeNull();
  });

  it('derives ovulation 14 days before the predicted period start, and a 5-before/1-after window', () => {
    const result = computeFertilityWindow(prediction('2026-03-31'));
    expect(result?.ovulationEstimate.toISOString().slice(0, 10)).toBe('2026-03-17');
    expect(result?.fertileWindowStart.toISOString().slice(0, 10)).toBe('2026-03-12');
    expect(result?.fertileWindowEnd.toISOString().slice(0, 10)).toBe('2026-03-18');
  });

  it('a later expectedPeriodStart shifts ovulation later by the same amount, not to a fixed calendar day', () => {
    const shortCycle = computeFertilityWindow(prediction('2026-01-27'));
    const longCycle = computeFertilityWindow(prediction('2026-02-02'));
    expect(shortCycle?.ovulationEstimate.toISOString().slice(0, 10)).toBe('2026-01-13');
    expect(longCycle?.ovulationEstimate.toISOString().slice(0, 10)).toBe('2026-01-19');
    expect(shortCycle?.ovulationEstimate.getTime()).not.toBe(
      longCycle?.ovulationEstimate.getTime(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/cycles/fertility-window.test.ts`
Expected: FAIL — `Cannot find module './fertility-window'` (file doesn't exist yet).

- [ ] **Step 3: Write `fertility-window.ts`**

Create `frontend/src/lib/server/cycles/fertility-window.ts`:

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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/cycles/fertility-window.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Extend `recompute.ts` to write the 3 new fields**

`frontend/src/lib/server/cycles/recompute.ts` is CLAUDE.md-protected — this is the pre-approved, minimal extension from the Global Constraints section above. Two edits:

Insert after line 5 (`import { computePrediction } from './prediction';`):

```ts
import { computeFertilityWindow } from './fertility-window';
```

Replace lines 80–107 (the `computePrediction` call through the end of the function) with:

```ts
  const prediction = computePrediction(cycles, episodes, {
    usualCycleLength: profile?.usualCycleLength ?? null,
    usualPeriodLength: profile?.usualPeriodLength ?? null,
  });
  const fertilityWindow = computeFertilityWindow(prediction);

  if (prediction) {
    await tx.prediction.upsert({
      where: { userId },
      create: {
        userId,
        algorithmVersion: prediction.algorithmVersion,
        confidence: prediction.confidence,
        expectedPeriodStart: prediction.expectedPeriodStart,
        expectedPeriodEnd: prediction.expectedPeriodEnd,
        ovulationEstimate: fertilityWindow?.ovulationEstimate ?? null,
        fertileWindowStart: fertilityWindow?.fertileWindowStart ?? null,
        fertileWindowEnd: fertilityWindow?.fertileWindowEnd ?? null,
        computedAt: new Date(),
      },
      update: {
        algorithmVersion: prediction.algorithmVersion,
        confidence: prediction.confidence,
        expectedPeriodStart: prediction.expectedPeriodStart,
        expectedPeriodEnd: prediction.expectedPeriodEnd,
        ovulationEstimate: fertilityWindow?.ovulationEstimate ?? null,
        fertileWindowStart: fertilityWindow?.fertileWindowStart ?? null,
        fertileWindowEnd: fertilityWindow?.fertileWindowEnd ?? null,
        computedAt: new Date(),
      },
    });
  } else {
    await tx.prediction.deleteMany({ where: { userId } });
  }
}
```

- [ ] **Step 6: Extend the existing `recompute.test.ts` case with fertility-field assertions**

In `frontend/src/lib/server/cycles/recompute.test.ts`, replace the test `'upserts a Prediction using the declared usualCycleLength when 0 cycles are complete'` (lines 57–71) with:

```ts
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
    // expectedPeriodStart = 2026-01-01 + 30 days = 2026-01-31; ovulation = that date - 14 days
    const create = arg?.create as { ovulationEstimate: Date; fertileWindowStart: Date; fertileWindowEnd: Date };
    expect(create.ovulationEstimate.toISOString().slice(0, 10)).toBe('2026-01-17');
    expect(create.fertileWindowStart.toISOString().slice(0, 10)).toBe('2026-01-12');
    expect(create.fertileWindowEnd.toISOString().slice(0, 10)).toBe('2026-01-18');
    expect(prismaMock.prediction.deleteMany).not.toHaveBeenCalled();
  });
```

- [ ] **Step 7: Run recompute tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/lib/server/cycles/recompute.test.ts`
Expected: PASS (all existing + modified tests).

- [ ] **Step 8: Extend `GET /api/predictions/current`**

Replace the full content of `frontend/src/app/api/predictions/current/route.ts` with:

```ts
// GET /api/predictions/current — Phase 3, extended Phase 5 (E5).
// Read-only. `prediction: null` is a normal, expected 200 response (0
// complete cycles, no declared usualCycleLength) — never treated as an
// error. ovulationEstimate/fertileWindowStart/fertileWindowEnd are the
// fenêtre-fertile fields computed by computeFertilityWindow() inside
// recompute.ts — null together whenever there's no prediction to derive
// them from.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function isoDateOrNull(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

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
              ovulationEstimate: isoDateOrNull(prediction.ovulationEstimate),
              fertileWindowStart: isoDateOrNull(prediction.fertileWindowStart),
              fertileWindowEnd: isoDateOrNull(prediction.fertileWindowEnd),
            }
          : null,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 9: Extend `predictions/current/route.test.ts`**

Replace the test `'returns the serialized Prediction when one exists'` (lines 22–49) with:

```ts
  it('returns the serialized Prediction when one exists', async () => {
    prismaMock.prediction.findUnique.mockResolvedValue({
      userId: 'u1',
      algorithmVersion: 'v1',
      confidence: 'MEDIUM',
      expectedPeriodStart: new Date('2026-03-01'),
      expectedPeriodEnd: new Date('2026-03-05'),
      ovulationEstimate: new Date('2026-02-15'),
      fertileWindowStart: new Date('2026-02-10'),
      fertileWindowEnd: new Date('2026-02-16'),
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
        ovulationEstimate: '2026-02-15',
        fertileWindowStart: '2026-02-10',
        fertileWindowEnd: '2026-02-16',
      },
    });

    expect(prismaMock.prediction.findUnique).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });
```

Then add a new test right after the (unmodified) `'returns { prediction: null }...'` test:

```ts
  it('maps null fertility fields to null in the response', async () => {
    prismaMock.prediction.findUnique.mockResolvedValue({
      userId: 'u1',
      algorithmVersion: 'v1',
      confidence: 'LOW',
      expectedPeriodStart: new Date('2026-03-01'),
      expectedPeriodEnd: new Date('2026-03-05'),
      ovulationEstimate: null,
      fertileWindowStart: null,
      fertileWindowEnd: null,
      computedAt: new Date('2026-02-01T10:00:00.000Z'),
    } as never);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.prediction.ovulationEstimate).toBeNull();
    expect(body.prediction.fertileWindowStart).toBeNull();
    expect(body.prediction.fertileWindowEnd).toBeNull();
  });
```

- [ ] **Step 10: Run all Task 1 tests**

Run: `pnpm --filter frontend exec vitest run src/lib/server/cycles/fertility-window.test.ts src/lib/server/cycles/recompute.test.ts src/app/api/predictions/current/route.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 11: Typecheck + lint + format**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: all clean.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/lib/server/cycles/fertility-window.ts \
  frontend/src/lib/server/cycles/fertility-window.test.ts \
  frontend/src/lib/server/cycles/recompute.ts \
  frontend/src/lib/server/cycles/recompute.test.ts \
  frontend/src/app/api/predictions/current/route.ts \
  frontend/src/app/api/predictions/current/route.test.ts
git commit -m "feat(fertility): compute and expose fertile-window/ovulation estimate

Standard luteal-phase back-calculation (ovulation = expectedPeriodStart
- 14 days), derived purely from the existing period-prediction output.
No new user input, no new confidence calculation — reuses the period
prediction's own confidence tier. Prediction.ovulationEstimate/
fertileWindowStart/fertileWindowEnd were already reserved in the schema
since Phase 1; GET /api/predictions/current now actually returns them."
```

---

### Task 2: `FertilitySignal` schema + `GET`/`PUT /api/fertility-signals/today`

**Files:**
- Modify: `frontend/prisma/schema.prisma` (`FertilitySignal` model — replace `@@index([userId, date])` with `@@unique([userId, date, type])`)
- Create: `frontend/prisma/migrations/<timestamp>_fertility_signal_unique_type/` (generated by the migrate command in Step 2 — do not hand-write)
- Create: `frontend/src/app/api/fertility-signals/today/route.ts`
- Create: `frontend/src/app/api/fertility-signals/today/route.test.ts`

**Interfaces:**
- Consumes: `todayUtcDate()` (from `@/lib/server/cycles/date-utils`, already exists), `requireAuth` (from `@/lib/server/middleware`), `verifyCsrf` (from `@/lib/server/auth`), `makeRequestContext`/`withRequestContext` (from `@/lib/server/observability/request-context`), `log` (from `@/lib/server/observability/log`) — all already exist, same imports as `daily-logs/today/route.ts`.
- Produces: `GET`/`PUT /api/fertility-signals/today`, independent of Task 1 (no shared files, no shared runtime state).

- [ ] **Step 1: Add the unique constraint to `schema.prisma`**

In `frontend/prisma/schema.prisma`, find the `FertilitySignal` model and replace its last line:

```prisma
  @@index([userId, date])
```

with:

```prisma
  @@unique([userId, date, type])
```

(No other change to the model — same fields, same `type` enum comment, same `User` relation, as already shipped in Phase 1.)

- [ ] **Step 2: Generate and apply the migration**

Run: `pnpm db:migrate:dev --name fertility_signal_unique_type`
Expected: Prisma detects the `@@index` → `@@unique` change, generates a new migration under `frontend/prisma/migrations/`, applies it to the dev database, and regenerates the Prisma Client (so `prisma.fertilitySignal.upsert` accepts a `userId_date_type` compound `where`).

- [ ] **Step 3: Write the failing tests**

Create `frontend/src/app/api/fertility-signals/today/route.test.ts`:

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'u1', email: 'a@b.com' } })),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { GET, PUT } from './route';

const ALL_NULL_BODY = {
  temperatureValue: null,
  temperatureUnit: null,
  cervicalMucusType: null,
  lhResult: null,
};

function makeGetReq(): NextRequest {
  return new NextRequest('http://test/api/fertility-signals/today', { method: 'GET' });
}

function makePutReq(body?: unknown): NextRequest {
  return new NextRequest('http://test/api/fertility-signals/today', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function makeRawPutReq(raw: string): NextRequest {
  return new NextRequest('http://test/api/fertility-signals/today', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: raw,
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
  prismaMock.profile.findUnique.mockResolvedValue({ userId: 'u1' } as never);
  prismaMock.fertilitySignal.upsert.mockResolvedValue({} as never);
  prismaMock.fertilitySignal.deleteMany.mockResolvedValue({ count: 0 } as never);
});

describe('GET /api/fertility-signals/today', () => {
  it('returns signal: null when nothing is logged today', async () => {
    prismaMock.fertilitySignal.findMany.mockResolvedValue([]);

    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ signal: null });
  });

  it('folds a single type row into the flat response shape', async () => {
    prismaMock.fertilitySignal.findMany.mockResolvedValue([
      {
        id: 'fs1',
        userId: 'u1',
        date: new Date('2026-09-07'),
        type: 'CERVICAL_MUCUS',
        temperatureValue: null,
        temperatureUnit: null,
        cervicalMucusType: 'EGG_WHITE',
        lhResult: null,
      },
    ] as never);

    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      signal: {
        temperatureValue: null,
        temperatureUnit: null,
        cervicalMucusType: 'EGG_WHITE',
        lhResult: null,
      },
    });
  });

  it('folds all 3 type rows into the flat response shape', async () => {
    prismaMock.fertilitySignal.findMany.mockResolvedValue([
      {
        id: 'fs1',
        userId: 'u1',
        date: new Date('2026-09-07'),
        type: 'BASAL_TEMPERATURE',
        temperatureValue: 36.6,
        temperatureUnit: 'CELSIUS',
        cervicalMucusType: null,
        lhResult: null,
      },
      {
        id: 'fs2',
        userId: 'u1',
        date: new Date('2026-09-07'),
        type: 'CERVICAL_MUCUS',
        temperatureValue: null,
        temperatureUnit: null,
        cervicalMucusType: 'WATERY',
        lhResult: null,
      },
      {
        id: 'fs3',
        userId: 'u1',
        date: new Date('2026-09-07'),
        type: 'LH_TEST',
        temperatureValue: null,
        temperatureUnit: null,
        cervicalMucusType: null,
        lhResult: 'PEAK',
      },
    ] as never);

    const res = await GET(makeGetReq());
    const body = await res.json();
    expect(body).toEqual({
      signal: {
        temperatureValue: 36.6,
        temperatureUnit: 'CELSIUS',
        cervicalMucusType: 'WATERY',
        lhResult: 'PEAK',
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    const res = await GET(makeGetReq());
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/fertility-signals/today', () => {
  it('upserts only the BASAL_TEMPERATURE row when only temperature is set', async () => {
    const res = await PUT(
      makePutReq({ ...ALL_NULL_BODY, temperatureValue: 36.7, temperatureUnit: 'CELSIUS' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(prismaMock.fertilitySignal.upsert).toHaveBeenCalledTimes(1);
    const arg = prismaMock.fertilitySignal.upsert.mock.calls[0]?.[0];
    expect(arg?.where).toMatchObject({
      userId_date_type: { userId: 'u1', type: 'BASAL_TEMPERATURE' },
    });
    expect(arg?.create).toMatchObject({
      userId: 'u1',
      type: 'BASAL_TEMPERATURE',
      temperatureValue: 36.7,
      temperatureUnit: 'CELSIUS',
    });
    expect(prismaMock.fertilitySignal.deleteMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.fertilitySignal.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: 'CERVICAL_MUCUS' }) }),
    );
    expect(prismaMock.fertilitySignal.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: 'LH_TEST' }) }),
    );
  });

  it('upserts all 3 type rows independently in one call', async () => {
    const res = await PUT(
      makePutReq({
        temperatureValue: 36.5,
        temperatureUnit: 'CELSIUS',
        cervicalMucusType: 'CREAMY',
        lhResult: 'NEGATIVE',
      }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.fertilitySignal.upsert).toHaveBeenCalledTimes(3);
    expect(prismaMock.fertilitySignal.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes a type row when its value is cleared to null', async () => {
    const res = await PUT(makePutReq(ALL_NULL_BODY));
    expect(res.status).toBe(200);
    expect(prismaMock.fertilitySignal.upsert).not.toHaveBeenCalled();
    expect(prismaMock.fertilitySignal.deleteMany).toHaveBeenCalledTimes(3);
  });

  it('rejects an invalid cervicalMucusType with VALIDATION_FAILED', async () => {
    const res = await PUT(makePutReq({ ...ALL_NULL_BODY, cervicalMucusType: 'SOGGY' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.fertilitySignal.upsert).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range temperatureValue with VALIDATION_FAILED', async () => {
    const res = await PUT(
      makePutReq({ ...ALL_NULL_BODY, temperatureValue: 50, temperatureUnit: 'CELSIUS' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('rejects temperatureValue without temperatureUnit with VALIDATION_FAILED', async () => {
    const res = await PUT(makePutReq({ ...ALL_NULL_BODY, temperatureValue: 36.6 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('rejects a malformed JSON body with VALIDATION_FAILED', async () => {
    const res = await PUT(makeRawPutReq('not json'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.fertilitySignal.upsert).not.toHaveBeenCalled();
  });

  it('returns 404 PROFILE_NOT_FOUND when the user never completed onboarding', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);

    const res = await PUT(makePutReq(ALL_NULL_BODY));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('PROFILE_NOT_FOUND');
    expect(prismaMock.fertilitySignal.upsert).not.toHaveBeenCalled();
  });

  it('returns 403 when the CSRF check fails', async () => {
    vi.mocked(verifyCsrf).mockReturnValue(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }) as never,
    );
    const res = await PUT(makePutReq(ALL_NULL_BODY));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/fertility-signals/today/route.test.ts`
Expected: FAIL — `Cannot find module './route'` (route file doesn't exist yet).

- [ ] **Step 5: Write the route**

Create `frontend/src/app/api/fertility-signals/today/route.ts`:

```ts
// GET/PUT /api/fertility-signals/today — Phase 5 (E5 Projet Bébé).
//
// Today-only, like daily-logs/today. Unlike daily-logs/today (one row,
// full-replace upsert), FertilitySignal is normalized: up to 3 rows per
// day, one per `type` (BASAL_TEMPERATURE | CERVICAL_MUCUS | LH_TEST).
// The client-facing shape stays flat; this route folds/unfolds it
// against the 3 typed rows. No call to recomputeCyclesAndPrediction —
// signals do not feed the prediction engine this phase (no signal-
// adjustment rule engine yet — PRD §8.2 defers that to a future,
// clinically-validated version).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { todayUtcDate } from '@/lib/server/cycles/date-utils';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const rows = await prisma.fertilitySignal.findMany({
      where: { userId: auth.user.sub, date: todayUtcDate() },
    });

    if (rows.length === 0) {
      return NextResponse.json(
        { signal: null },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const byType = new Map(rows.map((r) => [r.type, r]));
    const temperature = byType.get('BASAL_TEMPERATURE');
    const mucus = byType.get('CERVICAL_MUCUS');
    const lh = byType.get('LH_TEST');

    return NextResponse.json(
      {
        signal: {
          temperatureValue: temperature?.temperatureValue ?? null,
          temperatureUnit: temperature?.temperatureUnit ?? null,
          cervicalMucusType: mucus?.cervicalMucusType ?? null,
          lhResult: lh?.lhResult ?? null,
        },
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
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
      const text = await req.text();
      const json: unknown = text.trim().length > 0 ? JSON.parse(text) : {};
      body = Body.parse(json);
    } catch {
      return jsonError('VALIDATION_FAILED', 400, ctx.requestId, 'Invalid request body');
    }

    const profile = await prisma.profile.findUnique({
      where: { userId: auth.user.sub },
      select: { userId: true },
    });
    if (!profile) {
      return jsonError('PROFILE_NOT_FOUND', 404, ctx.requestId);
    }

    const today = todayUtcDate();
    const userId = auth.user.sub;

    await prisma.$transaction(async (tx) => {
      if (body.temperatureValue !== null) {
        await tx.fertilitySignal.upsert({
          where: { userId_date_type: { userId, date: today, type: 'BASAL_TEMPERATURE' } },
          create: {
            userId,
            date: today,
            type: 'BASAL_TEMPERATURE',
            temperatureValue: body.temperatureValue,
            temperatureUnit: body.temperatureUnit,
          },
          update: {
            temperatureValue: body.temperatureValue,
            temperatureUnit: body.temperatureUnit,
          },
        });
      } else {
        await tx.fertilitySignal.deleteMany({
          where: { userId, date: today, type: 'BASAL_TEMPERATURE' },
        });
      }

      if (body.cervicalMucusType !== null) {
        await tx.fertilitySignal.upsert({
          where: { userId_date_type: { userId, date: today, type: 'CERVICAL_MUCUS' } },
          create: {
            userId,
            date: today,
            type: 'CERVICAL_MUCUS',
            cervicalMucusType: body.cervicalMucusType,
          },
          update: { cervicalMucusType: body.cervicalMucusType },
        });
      } else {
        await tx.fertilitySignal.deleteMany({
          where: { userId, date: today, type: 'CERVICAL_MUCUS' },
        });
      }

      if (body.lhResult !== null) {
        await tx.fertilitySignal.upsert({
          where: { userId_date_type: { userId, date: today, type: 'LH_TEST' } },
          create: { userId, date: today, type: 'LH_TEST', lhResult: body.lhResult },
          update: { lhResult: body.lhResult },
        });
      } else {
        await tx.fertilitySignal.deleteMany({ where: { userId, date: today, type: 'LH_TEST' } });
      }
    });

    log.info('fertility signal saved', { userId });
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/fertility-signals/today/route.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 7: Typecheck + lint + format**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: all clean. (Typecheck in particular confirms the regenerated Prisma Client's `userId_date_type` compound-key type matches the route's usage.)

- [ ] **Step 8: Full test suite + build**

Run: `pnpm test && pnpm build`
Expected: all green; `/api/fertility-signals/today` appears in the build's route list.

- [ ] **Step 9: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/ \
  frontend/src/app/api/fertility-signals/today/route.ts \
  frontend/src/app/api/fertility-signals/today/route.test.ts
git commit -m "feat(fertility-signals): GET/PUT /api/fertility-signals/today

Today-only read/write for basal temperature, cervical mucus, and LH
test signals against the existing (Phase 1, previously unused)
FertilitySignal model. Adds @@unique([userId, date, type]) so each
signal type upserts independently — the model is normalized (up to 3
rows/day), not a single flat row; the API folds/unfolds that into one
flat client shape. No recompute call: signals don't feed the prediction
engine yet (no signal-adjustment rule engine this phase)."
```
