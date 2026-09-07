# Phase 4 — Daily Journal (E4) Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `GET`/`PUT /api/daily-logs/today` so the app can read and save a user's daily wellness entry (pain, mood, energy, sleep, symptoms, note) against the already-existing `DailyLog`/`SymptomLog` Prisma models.

**Architecture:** One new route file mirrors the existing `period-events`/`profile` route conventions (`requireAuth`, `verifyCsrf`, the `PROFILE_NOT_FOUND` consent-gate). `GET` reads today's row + its symptom children. `PUT` is a full-replace upsert inside one transaction: upsert the scalar `DailyLog` fields, then delete-and-recreate the `SymptomLog` children from a deduplicated symptom list. No call to `recomputeCyclesAndPrediction` — this data is completely independent of cycle computation. UI (`/app/log`) is explicitly out of scope for this plan — backend only, matching Phase 3's precedent of shipping backend first, UI in a separate `banani-design-implementation` pass.

**Tech Stack:** Next.js 16 Route Handlers, Prisma 5, Zod, Vitest + `vitest-mock-extended` (`prismaMock`).

**Spec:** `docs/superpowers/specs/2026-09-07-phase4-daily-journal-design.md`

## Global Constraints

- `export const runtime = 'nodejs'` on the route file (CLAUDE.md invariant — Prisma requires it).
- `GET` needs no CSRF check (safe method); `PUT` MUST call `verifyCsrf(req)` first and bail on a non-null result.
- Today-only: both handlers operate on `todayUtcDate()` (from `@/lib/server/cycles/date-utils`) — no date parameter accepted from the client.
- Writing requires a completed onboarding: `PUT` returns 404 `PROFILE_NOT_FOUND` when `prisma.profile.findUnique` finds nothing for the user (same pattern as `period-events`).
- `PUT` is a full-replace upsert — every body field is required-but-nullable (no partial-patch semantics).
- `symptoms` array MUST be deduplicated (`[...new Set(symptoms)]`) before `symptomLog.createMany` — `SymptomLog` has `@@unique([dailyLogId, symptom])`, so an un-deduplicated duplicate would crash the transaction instead of failing cleanly.
- No call to `recomputeCyclesAndPrediction` anywhere in this route — `DailyLog` does not affect cycle computation.
- All error bodies use the existing `{ error: CODE, message?: string }` shape via a local `jsonError` helper, matching every other route in this codebase.

---

### Task 1: `GET`/`PUT /api/daily-logs/today`

**Files:**
- Create: `frontend/src/app/api/daily-logs/today/route.ts`
- Test: `frontend/src/app/api/daily-logs/today/route.test.ts`

**Interfaces:**
- Consumes: `requireAuth` from `@/lib/server/middleware` (returns `{ user: { sub, email } } | NextResponse`), `verifyCsrf` from `@/lib/server/auth` (returns `NextResponse | null`), `prisma` from `@/lib/server/prisma`, `todayUtcDate` from `@/lib/server/cycles/date-utils`, `makeRequestContext`/`withRequestContext` from `@/lib/server/observability/request-context`, `log` from `@/lib/server/observability/log`.
- Produces: `GET` and `PUT` named exports consumed later by the `/app/log` page (a future, separate plan) via `api<T>('/api/daily-logs/today')` / `api('/api/daily-logs/today', { method: 'PUT', body: {...} })`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/daily-logs/today/route.test.ts`:

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

const FULL_BODY = {
  painLevel: 4,
  painLocation: 'Bas du dos',
  mood: 'TIRED',
  energy: 'LOW',
  sleepQuality: 'FAIR',
  sleepHours: 6.5,
  note: 'Un peu fatiguée aujourd’hui.',
  symptoms: ['CRAMPS', 'FATIGUE'],
};

function makeGetReq(): NextRequest {
  return new NextRequest('http://test/api/daily-logs/today', { method: 'GET' });
}

function makePutReq(body?: unknown): NextRequest {
  return new NextRequest('http://test/api/daily-logs/today', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function makeRawPutReq(raw: string): NextRequest {
  return new NextRequest('http://test/api/daily-logs/today', {
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
});

describe('GET /api/daily-logs/today', () => {
  it('returns log: null when nothing is logged today', async () => {
    prismaMock.dailyLog.findUnique.mockResolvedValue(null);

    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ log: null });
  });

  it('returns the mapped fields and symptoms when an entry exists', async () => {
    prismaMock.dailyLog.findUnique.mockResolvedValue({
      id: 'dl1',
      userId: 'u1',
      date: new Date('2026-09-07'),
      painLevel: 4,
      painLocation: 'Bas du dos',
      mood: 'TIRED',
      energy: 'LOW',
      sleepQuality: 'FAIR',
      sleepHours: 6.5,
      note: 'Un peu fatiguée aujourd’hui.',
      symptoms: [
        { id: 's1', dailyLogId: 'dl1', symptom: 'CRAMPS' },
        { id: 's2', dailyLogId: 'dl1', symptom: 'FATIGUE' },
      ],
    } as never);

    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.log).toEqual({
      painLevel: 4,
      painLocation: 'Bas du dos',
      mood: 'TIRED',
      energy: 'LOW',
      sleepQuality: 'FAIR',
      sleepHours: 6.5,
      note: 'Un peu fatiguée aujourd’hui.',
      symptoms: ['CRAMPS', 'FATIGUE'],
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

describe('PUT /api/daily-logs/today', () => {
  it('upserts the DailyLog and replaces symptoms from a full body', async () => {
    prismaMock.dailyLog.upsert.mockResolvedValue({ id: 'dl1' } as never);

    const res = await PUT(makePutReq(FULL_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    const upsertArg = prismaMock.dailyLog.upsert.mock.calls[0]?.[0];
    expect(upsertArg?.create?.userId).toBe('u1');
    expect(upsertArg?.create?.painLevel).toBe(4);
    expect(upsertArg?.update?.mood).toBe('TIRED');

    expect(prismaMock.symptomLog.deleteMany).toHaveBeenCalledWith({
      where: { dailyLogId: 'dl1' },
    });
    expect(prismaMock.symptomLog.createMany).toHaveBeenCalledWith({
      data: [
        { dailyLogId: 'dl1', symptom: 'CRAMPS' },
        { dailyLogId: 'dl1', symptom: 'FATIGUE' },
      ],
    });
  });

  it('deduplicates repeated symptom values instead of crashing', async () => {
    prismaMock.dailyLog.upsert.mockResolvedValue({ id: 'dl1' } as never);

    const res = await PUT(makePutReq({ ...FULL_BODY, symptoms: ['CRAMPS', 'CRAMPS', 'FATIGUE'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.symptomLog.createMany).toHaveBeenCalledWith({
      data: [
        { dailyLogId: 'dl1', symptom: 'CRAMPS' },
        { dailyLogId: 'dl1', symptom: 'FATIGUE' },
      ],
    });
  });

  it('accepts an all-null body (clearing every field)', async () => {
    prismaMock.dailyLog.upsert.mockResolvedValue({ id: 'dl1' } as never);

    const res = await PUT(
      makePutReq({
        painLevel: null,
        painLocation: null,
        mood: null,
        energy: null,
        sleepQuality: null,
        sleepHours: null,
        note: null,
        symptoms: [],
      }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.symptomLog.createMany).toHaveBeenCalledWith({ data: [] });
  });

  it('rejects an invalid mood value with VALIDATION_FAILED', async () => {
    const res = await PUT(makePutReq({ ...FULL_BODY, mood: 'FURIOUS' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.dailyLog.upsert).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range painLevel with VALIDATION_FAILED', async () => {
    const res = await PUT(makePutReq({ ...FULL_BODY, painLevel: 11 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('rejects an invalid symptom value with VALIDATION_FAILED', async () => {
    const res = await PUT(makePutReq({ ...FULL_BODY, symptoms: ['NOT_A_SYMPTOM'] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('rejects a malformed JSON body with VALIDATION_FAILED', async () => {
    const res = await PUT(makeRawPutReq('not json'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.dailyLog.upsert).not.toHaveBeenCalled();
  });

  it('returns 404 PROFILE_NOT_FOUND when the user never completed onboarding', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);

    const res = await PUT(makePutReq(FULL_BODY));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('PROFILE_NOT_FOUND');
    expect(prismaMock.dailyLog.upsert).not.toHaveBeenCalled();
  });

  it('returns 403 when the CSRF check fails', async () => {
    vi.mocked(verifyCsrf).mockReturnValue(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }) as never,
    );
    const res = await PUT(makePutReq(FULL_BODY));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/daily-logs/today/route.test.ts`
Expected: FAIL — `./route` has no exported `GET`/`PUT` (module doesn't exist yet).

- [ ] **Step 3: Write the route implementation**

Create `frontend/src/app/api/daily-logs/today/route.ts`:

```ts
// GET/PUT /api/daily-logs/today — Phase 4 (E4 daily journal).
//
// Today-only: both handlers operate on todayUtcDate(), no date param
// accepted. PUT is a full-replace upsert, not a partial patch — every
// body field is required-but-nullable, matching how the /app/log form
// always submits the complete current state of the whole form in one
// save. No call to recomputeCyclesAndPrediction — DailyLog is
// completely independent of cycle computation (Phase 3).
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

const SYMPTOMS = [
  'CRAMPS',
  'HEADACHE',
  'BLOATING',
  'NAUSEA',
  'ACNE',
  'TENDER_BREASTS',
  'FATIGUE',
  'BACK_PAIN',
  'CONSTIPATION',
  'DIARRHEA',
  'FOOD_CRAVINGS',
  'LIBIDO_CHANGE',
] as const;

const Body = z.object({
  painLevel: z.number().int().min(0).max(10).nullable(),
  painLocation: z.string().max(100).nullable(),
  mood: z.enum(['VERY_GOOD', 'GOOD', 'TIRED', 'STRESSED', 'LOW']).nullable(),
  energy: z.enum(['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']).nullable(),
  sleepQuality: z.enum(['POOR', 'FAIR', 'GOOD', 'EXCELLENT']).nullable(),
  sleepHours: z.number().min(0).max(24).nullable(),
  note: z.string().max(1000).nullable(),
  symptoms: z.array(z.enum(SYMPTOMS)),
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const dailyLog = await prisma.dailyLog.findUnique({
      where: { userId_date: { userId: auth.user.sub, date: todayUtcDate() } },
      include: { symptoms: true },
    });

    return NextResponse.json(
      {
        log: dailyLog
          ? {
              painLevel: dailyLog.painLevel,
              painLocation: dailyLog.painLocation,
              mood: dailyLog.mood,
              energy: dailyLog.energy,
              sleepQuality: dailyLog.sleepQuality,
              sleepHours: dailyLog.sleepHours,
              note: dailyLog.note,
              symptoms: dailyLog.symptoms.map((s) => s.symptom),
            }
          : null,
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
    const uniqueSymptoms = [...new Set(body.symptoms)];

    await prisma.$transaction(async (tx) => {
      const dailyLog = await tx.dailyLog.upsert({
        where: { userId_date: { userId: auth.user.sub, date: today } },
        create: {
          userId: auth.user.sub,
          date: today,
          painLevel: body.painLevel,
          painLocation: body.painLocation,
          mood: body.mood,
          energy: body.energy,
          sleepQuality: body.sleepQuality,
          sleepHours: body.sleepHours,
          note: body.note,
        },
        update: {
          painLevel: body.painLevel,
          painLocation: body.painLocation,
          mood: body.mood,
          energy: body.energy,
          sleepQuality: body.sleepQuality,
          sleepHours: body.sleepHours,
          note: body.note,
        },
      });

      await tx.symptomLog.deleteMany({ where: { dailyLogId: dailyLog.id } });
      await tx.symptomLog.createMany({
        data: uniqueSymptoms.map((symptom) => ({ dailyLogId: dailyLog.id, symptom })),
      });
    });

    log.info('daily log saved', { userId: auth.user.sub });
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/daily-logs/today/route.test.ts`
Expected: PASS — all 12 tests green.

- [ ] **Step 5: Run the full project gate**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: all four green, no regressions in the existing 652 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/daily-logs/today/route.ts frontend/src/app/api/daily-logs/today/route.test.ts
git commit -m "feat(daily-logs): GET/PUT /api/daily-logs/today

Today-only full-replace upsert against the existing DailyLog/
SymptomLog models (Phase 1, unused until now). No cycle recompute —
this data is independent of PeriodEvent-driven cycle logic."
```
