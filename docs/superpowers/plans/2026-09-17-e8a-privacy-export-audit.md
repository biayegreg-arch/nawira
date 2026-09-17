# E8 Part A — Data Export & Privacy/Security Audit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user download all of their own data (droit à la portabilité) and see their consent history + recent account-security activity (login, password changes, OAuth, exports) in one privacy page — zero deletion, zero anonymization, zero mutation of existing domain data.

**Architecture:** Two new read-only `GET` route handlers (`/api/account/export`, `/api/account/privacy`) backed by a new append-only `AccountActivity` Prisma model and a single `logAccountActivity()` entry point (mirrors the existing `logAdminAction()` pattern). The logger is called from 5 places: the new export route itself, and 4 existing auth-success paths (login, set-password, change-password, and — as one pre-approved, minimal addition — the protected Google OAuth callback).

**Tech Stack:** Next.js 16 Route Handlers, Prisma 5, Upstash Redis (`RedisRateLimitStore`, reused pattern from the existing per-userId admin rate limiter), Vitest + `vitest-mock-extended` (`prismaMock`) for tests.

**Spec:** `docs/superpowers/specs/2026-09-17-e8a-privacy-export-audit-design.md`

## Global Constraints

- Client-only from the data-mutation perspective: the only new writes anywhere in this plan are `AccountActivity` rows. No existing domain data (Cycle, DailyLog, Order, Withdrawal, etc.) is ever modified, deleted, or anonymized by this plan.
- Both new route handlers (`GET /api/account/export`, `GET /api/account/privacy`) are `GET`, require `requireAuth`, and do **NOT** call `verifyCsrf` — this project's CSRF policy only covers mutating verbs (`POST`/`PUT`/`PATCH`/`DELETE`); `GET` is exempt. Both `export const runtime = 'nodejs'`.
- **Protected-file constraint:** `frontend/src/app/api/auth/oauth/google/callback/route.ts` is a PROTECTED file per `CLAUDE.md` (state/PKCE/account-linking logic is interdependent). The user explicitly pre-approved, during this plan's brainstorming session, ONE narrowly-scoped addition to this file: a self-contained `ip`/`userAgent` extraction + try/catch-wrapped `logAccountActivity(...)` call inserted at the existing cookie-issuing success point, plus its import line. Task 7 below is the ONLY task that touches this file. Nothing else in that file may change — no reordering, no refactoring, no "while I'm here" cleanup.
- Activity logging is never fire-and-forget: every call site `await`s `logAccountActivity` and wraps it in a `try/catch` that logs a warning and continues on failure — a missing audit row must never fail the underlying auth/export success response.
- `AccountActivityType` is a closed, stable string union (`'LOGIN' | 'PASSWORD_CHANGED' | 'PASSWORD_SET' | 'OAUTH_LINKED' | 'DATA_EXPORTED'`) — the `/settings` privacy UI (a future, separate frontend task, not part of this plan) will switch on these values directly. Do not rename one once it ships in a task's commit.
- Explicitly out of scope for this entire plan: account deletion, PII anonymization, and general "hardening" — all deferred to a separate future spec ("E8 Part B").

---

### Task 1: `AccountActivity` Prisma model + migration

**Files:**
- Modify: `frontend/prisma/schema.prisma`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the `AccountActivity` Prisma model and the generated `prisma.accountActivity` client accessor (`create`, `findMany`, etc.) that every later task in this plan depends on. Also produces the `User.accountActivity` relation field (unused by later tasks' code directly, but required by Prisma's schema-validity rules once the reciprocal relation exists on `AccountActivity`).

This task has no application code — it's a schema change + migration. Verification is `pnpm db:migrate:status` reporting the new migration applied, plus a successful `pnpm --filter frontend run typecheck` (confirms the generated Prisma Client types compile against nothing yet, since no code references them until Task 2).

- [ ] **Step 1: Add the `AccountActivity` model**

Open `frontend/prisma/schema.prisma`. Find the `AdminAction` model (starts at line 79) and the multi-tenancy comment block that follows it (starts around line 95, `// ─── Multi-tenancy primitives ───`). Insert the new model immediately **after** the closing `}` of `AdminAction` and **before** that multi-tenancy comment block:

```prisma
model AccountActivity {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      String // LOGIN | PASSWORD_CHANGED | PASSWORD_SET | OAUTH_LINKED | DATA_EXPORTED
  ip        String?
  userAgent String?
  metadata  Json?
  createdAt DateTime @default(now())

  @@index([userId, createdAt])
}
```

- [ ] **Step 2: Add the reciprocal relation field on `User`**

In the same file, find `model User` (starts at line 11). Locate this line inside it — it is the actual last one-to-many relation before the `// Multi-tenancy is opt-in per project...` comment block (not `adminActions`, which is second-to-last):

```prisma
  assistantConversations AssistantConversation[]
```

Add a new line immediately after it:

```prisma
  assistantConversations AssistantConversation[]
  accountActivity        AccountActivity[]
```

- [ ] **Step 3: Generate and apply the migration**

Run from the repo root:

```bash
pnpm db:migrate:dev --name nawira_account_activity
```

Expected: Prisma prompts/creates a new migration directory under `frontend/prisma/migrations/` containing a `CREATE TABLE "AccountActivity"` statement plus its FK/index, applies it to the dev database, and regenerates the Prisma Client. No errors.

- [ ] **Step 4: Verify**

Run: `pnpm db:migrate:status` — expect the new migration listed as applied, nothing pending.
Run: `pnpm --filter frontend run typecheck` — expect success (no code references `accountActivity` yet, so this only confirms the schema itself is valid and the client regenerated cleanly).

- [ ] **Step 5: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/
git commit -m "feat(privacy): add AccountActivity model for account security/audit log"
```

---

### Task 2: `logAccountActivity()` helper

**Files:**
- Create: `frontend/src/lib/server/account/activity.ts`
- Test: `frontend/src/lib/server/account/activity.test.ts`

**Interfaces:**
- Consumes: the `prisma.accountActivity` client accessor from Task 1.
- Produces: `logAccountActivity(prisma: AccountActivityClient, input: AccountActivityInput): Promise<void>` and the exported `AccountActivityType` union + `AccountActivityInput` interface. Tasks 4, 5, 6, and 7 all import and call this function with this exact signature.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/server/account/activity.test.ts`:

```ts
// Companion unit test for `account/activity.ts::logAccountActivity` —
// mirrors `frontend/src/lib/server/admin/audit.test.ts`'s structure for
// `logAdminAction`.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { logAccountActivity } from './activity';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => mockReset(prismaMock));

describe('logAccountActivity', () => {
  it('writes an AccountActivity row with all fields', async () => {
    prismaMock.accountActivity.create.mockResolvedValue({} as never);

    await logAccountActivity(prismaMock, {
      userId: 'u1',
      type: 'LOGIN',
      ip: '203.0.113.5',
      userAgent: 'Mozilla/5.0',
      metadata: { via: 'password' },
    });

    expect(prismaMock.accountActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        type: 'LOGIN',
        ip: '203.0.113.5',
        userAgent: 'Mozilla/5.0',
        metadata: { via: 'password' },
      }),
    });
  });

  it('defaults optional fields to null when omitted', async () => {
    prismaMock.accountActivity.create.mockResolvedValue({} as never);

    await logAccountActivity(prismaMock, { userId: 'u2', type: 'PASSWORD_CHANGED' });

    const arg = prismaMock.accountActivity.create.mock.calls[0]?.[0];
    expect(arg?.data).toMatchObject({
      userId: 'u2',
      type: 'PASSWORD_CHANGED',
      ip: null,
      userAgent: null,
      metadata: null,
    });
  });

  it('accepts a tx-shaped client (TransactionClient subset)', async () => {
    const accountActivityCreate = vi.fn().mockResolvedValue({});
    const txMock = { accountActivity: { create: accountActivityCreate } } as never;

    await logAccountActivity(txMock, { userId: 'u3', type: 'DATA_EXPORTED' });

    expect(accountActivityCreate).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/account/activity.test.ts`
Expected: FAIL — `Cannot find module './activity'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/server/account/activity.ts`:

```ts
/**
 * User-facing account activity log. Call after any security-relevant
 * self-service action so the /settings privacy page can show it back to
 * the user ("was this really me?").
 *
 *   await logAccountActivity(prisma, {
 *     userId: auth.user.sub,
 *     type: 'PASSWORD_CHANGED',
 *     ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
 *     userAgent: req.headers.get('user-agent') ?? undefined,
 *   });
 *
 * Type naming: stable uppercase strings, the /settings UI switches on them
 * directly — do not rename an existing type once shipped.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

export type AccountActivityType =
  | 'LOGIN'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_SET'
  | 'OAUTH_LINKED'
  | 'DATA_EXPORTED';

export interface AccountActivityInput {
  userId: string;
  type: AccountActivityType;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export type AccountActivityClient = Pick<PrismaClient, 'accountActivity'>;

export async function logAccountActivity(
  prisma: AccountActivityClient,
  input: AccountActivityInput,
): Promise<void> {
  await prisma.accountActivity.create({
    data: {
      userId: input.userId,
      type: input.type,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata: (input.metadata ?? null) as unknown as Prisma.InputJsonValue,
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/account/activity.test.ts`
Expected: PASS, 3/3 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/account/activity.ts frontend/src/lib/server/account/activity.test.ts
git commit -m "feat(privacy): add logAccountActivity helper"
```

---

### Task 3: Export rate limiter

**Files:**
- Create: `frontend/src/lib/server/account/export-rate-limit.ts`
- Test: `frontend/src/lib/server/account/export-rate-limit.test.ts`

**Interfaces:**
- Consumes: `frontend/src/lib/server/redis`'s `redis: Redis | null` export, `RedisRateLimitStore` from `frontend/src/lib/server/rate-limit-store.ts` — both existing, unmodified.
- Produces: `enforceExportRateLimit(userId: string): Promise<NextResponse | null>`. Task 4's export route calls this immediately after `requireAuth` succeeds.

No dependency on Task 1/2's `AccountActivity` model — this task is independent and could run before or after them, but is sequenced here per the plan's task order.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/server/account/export-rate-limit.test.ts`:

```ts
// Unit tests for enforceExportRateLimit — mirrors the shape of
// frontend/src/lib/server/middleware/rate-limit-by-userid.ts's
// enforceAdminRateLimit (no existing test file for that one to copy, so
// this is the first direct test of this pattern in the codebase; uses the
// generic mockRedis() stub from test-utils/admin-fixtures.ts, which is not
// admin-specific — it's a plain Upstash-shaped in-memory fake).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockRedis, type MockRedisStub } from '@/test-utils/admin-fixtures';

const redisHolder: { current: MockRedisStub | null } = { current: null };

vi.mock('@/lib/server/redis', () => ({
  get redis() {
    return redisHolder.current;
  },
}));

import { enforceExportRateLimit } from './export-rate-limit';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  redisHolder.current = mockRedis();
});

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('enforceExportRateLimit', () => {
  it('allows the first 3 calls in a window', async () => {
    expect(await enforceExportRateLimit('user_1')).toBeNull();
    expect(await enforceExportRateLimit('user_1')).toBeNull();
    expect(await enforceExportRateLimit('user_1')).toBeNull();
  });

  it('rejects the 4th call in the same window with 429', async () => {
    await enforceExportRateLimit('user_2');
    await enforceExportRateLimit('user_2');
    await enforceExportRateLimit('user_2');

    const res = await enforceExportRateLimit('user_2');
    expect(res).not.toBeNull();
    expect(res?.status).toBe(429);
    const body = await res!.json();
    expect(body).toMatchObject({ error: 'TOO_MANY_REQUESTS' });
    expect(res?.headers.get('Retry-After')).toBeTruthy();
    expect(res?.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('keys are independent per userId', async () => {
    await enforceExportRateLimit('user_3');
    await enforceExportRateLimit('user_3');
    await enforceExportRateLimit('user_3');

    // A different user's 1st call in the same window is still allowed.
    expect(await enforceExportRateLimit('user_4')).toBeNull();
  });

  it('fails open (returns null) in dev/test when redis is absent', async () => {
    redisHolder.current = null;
    process.env.NODE_ENV = 'test';

    expect(await enforceExportRateLimit('user_5')).toBeNull();
  });

  it('fails closed (503) in production when redis is absent', async () => {
    redisHolder.current = null;
    process.env.NODE_ENV = 'production';

    const res = await enforceExportRateLimit('user_6');
    expect(res).not.toBeNull();
    expect(res?.status).toBe(503);
    const body = await res!.json();
    expect(body).toMatchObject({ error: 'RATE_LIMIT_BACKEND_UNAVAILABLE' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/account/export-rate-limit.test.ts`
Expected: FAIL — `Cannot find module './export-rate-limit'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/server/account/export-rate-limit.ts`:

```ts
// Per-userId rate limiter for GET /api/account/export — 3 exports / 24h
// per user. Mirrors frontend/src/lib/server/middleware/rate-limit-by-userid.ts
// (the admin per-userId limiter) but as its own small, purpose-built file
// rather than a parameterized shared one — matches this codebase's
// established pattern (see rate-limit-by-email.ts vs rate-limit-by-userid.ts:
// two separate files, not one generic one).
//
// A full data export is a scraping/abuse vector if callable at unbounded
// rate even from an authenticated session (e.g. a compromised token used
// to repeatedly pull a user's full history). 3/24h is generous for
// legitimate use (nobody re-exports their own data more than a couple
// times a day) while bounding the abuse case.
//
// Same fail-open-dev/fail-closed-prod semantics as enforceAdminRateLimit:
// when redis is absent, dev/test proceeds (returns null) so local
// development without Upstash still works, but production returns 503 so
// a misconfigured deploy doesn't silently disable the limit.
import 'server-only';
import { NextResponse } from 'next/server';
import { redis } from '@/lib/server/redis';
import { RedisRateLimitStore } from '@/lib/server/rate-limit-store';

const EXPORT_PREFIX = 'rl:export:userid:';
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_HITS = 3;

export async function enforceExportRateLimit(userId: string): Promise<NextResponse | null> {
  if (!redis) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        {
          error: 'RATE_LIMIT_BACKEND_UNAVAILABLE',
          message: 'Rate-limit backend unavailable.',
        },
        { status: 503 },
      );
    }
    return null;
  }
  const store = new RedisRateLimitStore({ redis, prefix: '', windowMs: WINDOW_MS });
  const { totalHits, resetTime } = await store.increment(`${EXPORT_PREFIX}${userId}`);
  if (totalHits > MAX_HITS) {
    const retryAfter = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
    return NextResponse.json(
      {
        error: 'TOO_MANY_REQUESTS',
        message: 'Export rate limit exceeded; retry tomorrow.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(MAX_HITS),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(resetTime.getTime() / 1000)),
        },
      },
    );
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/account/export-rate-limit.test.ts`
Expected: PASS, 5/5 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/account/export-rate-limit.ts frontend/src/lib/server/account/export-rate-limit.test.ts
git commit -m "feat(privacy): add per-user rate limit for data export"
```

---

### Task 4: `GET /api/account/export`

**Files:**
- Create: `frontend/src/app/api/account/export/route.ts`
- Test: `frontend/src/app/api/account/export/route.test.ts`

**Interfaces:**
- Consumes: `logAccountActivity` (Task 2), `enforceExportRateLimit` (Task 3), `requireAuth` from `@/lib/server/middleware` (existing), `prisma` from `@/lib/server/prisma` (existing).
- Produces: nothing consumed by later tasks — this is a leaf route.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/account/export/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { prismaMock } from '@/test-utils/prisma-mock';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));
vi.mock('@/lib/server/account/export-rate-limit', () => ({
  enforceExportRateLimit: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { enforceExportRateLimit } from '@/lib/server/account/export-rate-limit';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockEnforceExportRateLimit = vi.mocked(enforceExportRateLimit);

function makeReq(): NextRequest {
  return new NextRequest('https://test/api/account/export', { method: 'GET' });
}

function authOk(userId = 'u1', email = 'a@b.com') {
  mockRequireAuth.mockResolvedValue({ user: { sub: userId, email } } as never);
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockEnforceExportRateLimit.mockReset();
  mockEnforceExportRateLimit.mockResolvedValue(null);

  // Every model this route queries needs a default empty/null resolution
  // so an unconfigured test doesn't throw on an un-mocked call.
  prismaMock.user.findUnique.mockResolvedValue({
    id: 'u1',
    email: 'a@b.com',
    name: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  } as never);
  prismaMock.profile.findUnique.mockResolvedValue(null);
  prismaMock.consent.findMany.mockResolvedValue([]);
  prismaMock.consent.findFirst.mockResolvedValue(null);
  prismaMock.periodEvent.findMany.mockResolvedValue([]);
  prismaMock.cycle.findMany.mockResolvedValue([]);
  prismaMock.dailyLog.findMany.mockResolvedValue([]);
  prismaMock.symptomLog.findMany.mockResolvedValue([]);
  prismaMock.fertilitySignal.findMany.mockResolvedValue([]);
  prismaMock.prediction.findUnique.mockResolvedValue(null);
  prismaMock.insight.findMany.mockResolvedValue([]);
  prismaMock.notification.findMany.mockResolvedValue([]);
  prismaMock.notificationPreferences.findUnique.mockResolvedValue(null);
  prismaMock.order.findMany.mockResolvedValue([]);
  prismaMock.withdrawal.findMany.mockResolvedValue([]);
  prismaMock.assistantConversation.findMany.mockResolvedValue([]);
  prismaMock.accountActivity.create.mockResolvedValue({} as never);
});

describe('GET /api/account/export', () => {
  it('401s when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue(new NextResponse(null, { status: 401 }) as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('429s when rate-limited, before doing any data assembly', async () => {
    authOk();
    mockEnforceExportRateLimit.mockResolvedValue(
      new NextResponse(JSON.stringify({ error: 'TOO_MANY_REQUESTS' }), { status: 429 }) as never,
    );

    const res = await GET(makeReq());
    expect(res.status).toBe(429);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('happy path: 200, full JSON shape, Content-Disposition header, activity logged', async () => {
    authOk('u1', 'a@b.com');

    const res = await GET(makeReq());

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="nawira-export-/);

    const body = await res.json();
    expect(body).toMatchObject({
      user: { id: 'u1', email: 'a@b.com' },
      profile: null,
      consents: [],
      periodEvents: [],
      cycles: [],
      dailyLogs: [],
      symptomLogs: [],
      fertilitySignals: [],
      predictions: null,
      insights: [],
      notifications: [],
      notificationPreferences: null,
      orders: [],
      withdrawals: [],
      assistantConversations: [],
    });
    expect(typeof body.exportedAt).toBe('string');

    expect(prismaMock.accountActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', type: 'DATA_EXPORTED' }),
    });
  });

  it('scopes every query to the authenticated userId', async () => {
    authOk('u1', 'a@b.com');

    await GET(makeReq());

    expect(prismaMock.cycle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
    expect(prismaMock.dailyLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
    expect(prismaMock.withdrawal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
  });

  it('assistantConversations stays empty without an active ASSISTANT_HISTORY consent', async () => {
    authOk('u1', 'a@b.com');
    prismaMock.consent.findFirst.mockResolvedValue(null);
    prismaMock.assistantConversation.findMany.mockResolvedValue([
      { id: 'c1', title: 't', createdAt: new Date(), updatedAt: new Date(), messages: [] },
    ] as never);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body.assistantConversations).toEqual([]);
    // The query itself may or may not run — what matters is the gated output.
  });

  it('includes assistantConversations when ASSISTANT_HISTORY consent is active', async () => {
    authOk('u1', 'a@b.com');
    prismaMock.consent.findFirst.mockResolvedValue({
      id: 'c1',
      userId: 'u1',
      type: 'ASSISTANT_HISTORY',
      version: 1,
      grantedAt: new Date(),
      revokedAt: null,
    } as never);
    prismaMock.assistantConversation.findMany.mockResolvedValue([
      {
        id: 'c1',
        title: 't',
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [{ id: 'm1', role: 'USER', content: 'hi', createdAt: new Date() }],
      },
    ] as never);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body.assistantConversations).toHaveLength(1);
    expect(body.assistantConversations[0].messages).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/account/export/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the route**

Create `frontend/src/app/api/account/export/route.ts`:

```ts
// GET /api/account/export — droit à la portabilité (E8 part A). Returns
// every piece of the caller's own data as a single downloadable JSON file.
// Read-only: the only write is the DATA_EXPORTED AccountActivity row logged
// on success. No CSRF (GET is exempt from this project's CSRF policy).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { enforceExportRateLimit } from '@/lib/server/account/export-rate-limit';
import { logAccountActivity } from '@/lib/server/account/activity';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const limited = await enforceExportRateLimit(auth.user.sub);
    if (limited) {
      limited.headers.set('x-request-id', ctx.requestId);
      return limited;
    }

    const userId = auth.user.sub;

    // Assistant history is only exported if the user currently has an
    // active (non-revoked) ASSISTANT_HISTORY consent — defense-in-depth
    // documentation of the existing rule that conversations aren't
    // persisted at all without that consent (so the query would already
    // return [] in practice; this makes the rule explicit rather than
    // implicit).
    const activeAssistantConsent = await prisma.consent.findFirst({
      where: { userId, type: 'ASSISTANT_HISTORY', revokedAt: null },
      select: { id: true },
    });

    const [
      user,
      profile,
      consents,
      periodEvents,
      cycles,
      dailyLogs,
      symptomLogs,
      fertilitySignals,
      predictions,
      insights,
      notifications,
      notificationPreferences,
      orders,
      withdrawals,
      assistantConversations,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, createdAt: true },
      }),
      prisma.profile.findUnique({ where: { userId } }),
      prisma.consent.findMany({ where: { userId }, orderBy: { grantedAt: 'desc' } }),
      prisma.periodEvent.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.cycle.findMany({ where: { userId }, orderBy: { startDate: 'desc' } }),
      prisma.dailyLog.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        include: { symptoms: true },
      }),
      prisma.symptomLog.findMany({ where: { dailyLog: { userId } } }),
      prisma.fertilitySignal.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.prediction.findUnique({ where: { userId } }),
      prisma.insight.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      prisma.notificationPreferences.findUnique({ where: { userId } }),
      prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          paymentMethod: true,
          customerEmail: true,
          customerPhone: true,
          customerName: true,
          expiresAt: true,
          paidAt: true,
          createdAt: true,
        },
      }),
      prisma.withdrawal.findMany({
        where: { userId },
        orderBy: { requestedAt: 'desc' },
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          destination: true,
          failureReason: true,
          requestedAt: true,
          processedAt: true,
          completedAt: true,
        },
      }),
      activeAssistantConsent
        ? prisma.assistantConversation.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: { messages: true },
          })
        : Promise.resolve([]),
    ]);

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      user,
      profile,
      consents,
      periodEvents,
      cycles,
      dailyLogs,
      symptomLogs,
      fertilitySignals,
      predictions,
      insights,
      notifications,
      notificationPreferences,
      orders,
      withdrawals,
      assistantConversations,
    };

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const userAgent = req.headers.get('user-agent') ?? undefined;
    try {
      await logAccountActivity(prisma, { userId, type: 'DATA_EXPORTED', ip, userAgent });
    } catch (err) {
      log.warn('account activity log failed', { err: String(err), userId, type: 'DATA_EXPORTED' });
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const res = NextResponse.json(exportPayload, { headers: { 'x-request-id': ctx.requestId } });
    res.headers.set('Content-Disposition', `attachment; filename="nawira-export-${dateStr}.json"`);
    return res;
  });
}
```

**Deviation from the spec's example JSON (§2):** the spec's illustrative JSON shows `"predictions": [ "..." ]` as an array, but `Prediction.userId` is the model's `@id` (one row per user, not a list — confirmed in `frontend/prisma/schema.prisma`). This route correctly returns `predictions` as a single object or `null` via `findUnique`, not an array — the spec's example was schematic, not a literal cardinality spec. Matches this session's established precedent of the plan correcting a spec inaccuracy found while implementing (see the E4 PWA-shell plan's layout.tsx nesting-order correction).

**Note on the `symptomLogs` field:** `DailyLog.symptoms` is Prisma's relation name to `SymptomLog` — the route fetches it nested inside `dailyLogs` (via `include: { symptoms: true }`, matching the schema's actual relation name) AND separately as a flat top-level `symptomLogs` array (queried via `dailyLog: { userId }` since `SymptomLog` itself has no direct `userId` column — only `dailyLogId`). Both are real, intentional: nested for context, flat for the stable top-level key the spec's example JSON shape promises.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/account/export/route.test.ts`
Expected: PASS, 7/7 tests.

- [ ] **Step 5: Run the full test suite once (not just this file) to check for regressions**

Run: `pnpm --filter frontend exec vitest run`
Expected: all green (no other test should be affected by a new, isolated route).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/account/export/route.ts frontend/src/app/api/account/export/route.test.ts
git commit -m "feat(privacy): add GET /api/account/export"
```

---

### Task 5: `GET /api/account/privacy`

**Files:**
- Create: `frontend/src/app/api/account/privacy/route.ts`
- Test: `frontend/src/app/api/account/privacy/route.test.ts`

**Interfaces:**
- Consumes: `requireAuth` (existing), `prisma` (existing). Does NOT consume `logAccountActivity` — viewing your own privacy page is not itself a loggable security event in this spec (only login/password/OAuth/export actions are).
- Produces: nothing consumed by later tasks — a leaf route.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/account/privacy/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { prismaMock } from '@/test-utils/prisma-mock';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);

function makeReq(): NextRequest {
  return new NextRequest('https://test/api/account/privacy', { method: 'GET' });
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  prismaMock.consent.findMany.mockReset();
  prismaMock.accountActivity.findMany.mockReset();
});

describe('GET /api/account/privacy', () => {
  it('401s when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue(new NextResponse(null, { status: 401 }) as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns consents and activity, scoped to the authenticated user', async () => {
    mockRequireAuth.mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } } as never);
    prismaMock.consent.findMany.mockResolvedValue([
      { id: 'c1', userId: 'u1', type: 'HEALTH_DATA', version: 1, grantedAt: new Date(), revokedAt: null },
    ] as never);
    prismaMock.accountActivity.findMany.mockResolvedValue([
      { id: 'a1', userId: 'u1', type: 'LOGIN', ip: null, userAgent: null, metadata: null, createdAt: new Date() },
    ] as never);

    const res = await GET(makeReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.consents).toHaveLength(1);
    expect(body.consents[0]).toMatchObject({ type: 'HEALTH_DATA' });
    expect(body.activity).toHaveLength(1);
    expect(body.activity[0]).toMatchObject({ type: 'LOGIN' });

    expect(prismaMock.consent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
    expect(prismaMock.accountActivity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' }, take: 50 }),
    );
  });

  it('caps activity at 50 rows via the query itself', async () => {
    mockRequireAuth.mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } } as never);
    prismaMock.consent.findMany.mockResolvedValue([]);
    prismaMock.accountActivity.findMany.mockResolvedValue([]);

    await GET(makeReq());

    const arg = prismaMock.accountActivity.findMany.mock.calls[0]?.[0];
    expect(arg).toMatchObject({ take: 50, orderBy: { createdAt: 'desc' } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/account/privacy/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Write the route**

Create `frontend/src/app/api/account/privacy/route.ts`:

```ts
// GET /api/account/privacy — consent history + recent account-security
// activity, for the /settings "Confidentialité & sécurité" page (E8 part
// A). Read-only, no CSRF (GET is exempt from this project's CSRF policy).
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

    const userId = auth.user.sub;

    const [consents, activity] = await Promise.all([
      prisma.consent.findMany({ where: { userId }, orderBy: { grantedAt: 'desc' } }),
      prisma.accountActivity.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    return NextResponse.json(
      { consents, activity },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/account/privacy/route.test.ts`
Expected: PASS, 3/3 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/account/privacy/route.ts frontend/src/app/api/account/privacy/route.test.ts
git commit -m "feat(privacy): add GET /api/account/privacy"
```

---

### Task 6: Wire activity logging into email/password auth routes

**Files:**
- Modify: `frontend/src/app/api/auth/login/route.ts:16-34,166-181`
- Modify: `frontend/src/app/api/auth/set-password/route.ts:16-34,138-146`
- Modify: `frontend/src/app/api/auth/change-password/route.ts:27-47,184-193`
- Modify: `frontend/src/app/api/auth/login/route.test.ts:59-83`
- Modify: `frontend/src/app/api/auth/set-password/route.test.ts:120-121` (add assertion inside the existing "Test 1" body)
- Modify: `frontend/src/app/api/auth/change-password/route.test.ts:158-159` (add assertion inside the existing "Test 1" body)

**Interfaces:**
- Consumes: `logAccountActivity` (Task 2). None of these 3 files are PROTECTED — all are fair-game per `CLAUDE.md`.
- Produces: nothing consumed by later tasks. Task 7 is independent of this task (different file, same pattern) — could run before or after, sequenced here.

These 3 files get the identical shape of change (one import + a 5-line logging block inserted at the existing success point), so they're one task per this plan's batching guidance — a reviewer would evaluate all 3 together, not reject one while approving another.

- [ ] **Step 1: `login/route.ts` — add the import**

In `frontend/src/app/api/auth/login/route.ts`, the current import block (lines 20-34) ends with:

```ts
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
```

Add one new import line immediately after `import { log } ...`:

```ts
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { logAccountActivity } from '@/lib/server/account/activity';
```

- [ ] **Step 2: `login/route.ts` — log on success**

The current success tail (lines 166-181) reads:

```ts
    // 8. Reset failure count and issue cookies.
    await recordSuccess(email);

    const accessToken = await createAccessToken({
      sub: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });
    const refreshToken = await createRefreshToken(user.id, user.tokenVersion);
    await setAuthCookies(accessToken, refreshToken);
    await setCsrfCookie();

    return NextResponse.json(
      { ok: true, user: { sub: user.id, email: user.email, hasProfile: !!user.profile } },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
```

Insert a logging block between `await setCsrfCookie();` and the `return NextResponse.json(...)`:

```ts
    // 8. Reset failure count and issue cookies.
    await recordSuccess(email);

    const accessToken = await createAccessToken({
      sub: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });
    const refreshToken = await createRefreshToken(user.id, user.tokenVersion);
    await setAuthCookies(accessToken, refreshToken);
    await setCsrfCookie();

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const userAgent = req.headers.get('user-agent') ?? undefined;
    try {
      await logAccountActivity(prisma, { userId: user.id, type: 'LOGIN', ip, userAgent });
    } catch (err) {
      log.warn('account activity log failed', { err: String(err), userId: user.id, type: 'LOGIN' });
    }

    return NextResponse.json(
      { ok: true, user: { sub: user.id, email: user.email, hasProfile: !!user.profile } },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
```

- [ ] **Step 3: `set-password/route.ts` — add the import**

Current import block (lines 19-34) ends with:

```ts
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
```

Add the same new import line after it:

```ts
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { logAccountActivity } from '@/lib/server/account/activity';
```

- [ ] **Step 4: `set-password/route.ts` — log on success**

Current tail (lines 131-146):

```ts
    // 8. Mint new cookies so this browser stays logged in (mirrors change-password).
    const access = await createAccessToken({
      sub: updated.id,
      email: updated.email,
      tokenVersion: updated.tokenVersion,
    });
    const refresh = await createRefreshToken(updated.id, updated.tokenVersion);
    await setAuthCookies(access, refresh);
    await setCsrfCookie();

    log.info('set-password success', { userId: updated.id });

    const res = NextResponse.json({ ok: true });
    res.headers.set('x-request-id', ctx.requestId);
    return res;
```

Insert the logging block between `log.info('set-password success', ...)` and `const res = NextResponse.json(...)`:

```ts
    // 8. Mint new cookies so this browser stays logged in (mirrors change-password).
    const access = await createAccessToken({
      sub: updated.id,
      email: updated.email,
      tokenVersion: updated.tokenVersion,
    });
    const refresh = await createRefreshToken(updated.id, updated.tokenVersion);
    await setAuthCookies(access, refresh);
    await setCsrfCookie();

    log.info('set-password success', { userId: updated.id });

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const userAgent = req.headers.get('user-agent') ?? undefined;
    try {
      await logAccountActivity(prisma, { userId: updated.id, type: 'PASSWORD_SET', ip, userAgent });
    } catch (err) {
      log.warn('account activity log failed', {
        err: String(err),
        userId: updated.id,
        type: 'PASSWORD_SET',
      });
    }

    const res = NextResponse.json({ ok: true });
    res.headers.set('x-request-id', ctx.requestId);
    return res;
```

- [ ] **Step 5: `change-password/route.ts` — add the import**

Current import block (lines 27-44) ends with:

```ts
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
```

Add the same new import line after it:

```ts
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { logAccountActivity } from '@/lib/server/account/activity';
```

- [ ] **Step 6: `change-password/route.ts` — log on success**

Current tail (lines 175-193):

```ts
    // 10. Pitfall 9: mint NEW tokens with the BUMPED tokenVersion and call
    //     setAuthCookies + setCsrfCookie so the current browser stays logged
    //     in. Other sessions still hold the old tokenVersion and will fail on
    //     the next requireAuth call.
    const access = await createAccessToken({
      sub: updated.id,
      email: updated.email,
      tokenVersion: updated.tokenVersion,
    });
    const refresh = await createRefreshToken(updated.id, updated.tokenVersion);
    await setAuthCookies(access, refresh);
    await setCsrfCookie();

    log.info('change-password success', { userId: updated.id });

    const res = NextResponse.json({ ok: true });
    res.headers.set('x-request-id', ctx.requestId);
    return res;
```

Insert the logging block between `log.info('change-password success', ...)` and `const res = NextResponse.json(...)`:

```ts
    log.info('change-password success', { userId: updated.id });

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const userAgent = req.headers.get('user-agent') ?? undefined;
    try {
      await logAccountActivity(prisma, { userId: updated.id, type: 'PASSWORD_CHANGED', ip, userAgent });
    } catch (err) {
      log.warn('account activity log failed', {
        err: String(err),
        userId: updated.id,
        type: 'PASSWORD_CHANGED',
      });
    }

    const res = NextResponse.json({ ok: true });
    res.headers.set('x-request-id', ctx.requestId);
    return res;
```

- [ ] **Step 7: Extend `login/route.test.ts`'s happy-path test**

In `frontend/src/app/api/auth/login/route.test.ts`, find `'Test 1: happy path — issues 3 cookies and returns user'` (line 60). It currently ends:

```ts
    expect(recordSuccess).toHaveBeenCalledWith('a@b.com');
    expect(__cookieStore.has('app-token')).toBe(true);
    expect(__cookieStore.has('app-refresh')).toBe(true);
    expect(__cookieStore.has('app-csrf')).toBe(true);
  });
```

Add one assertion before the closing `});`:

```ts
    expect(recordSuccess).toHaveBeenCalledWith('a@b.com');
    expect(__cookieStore.has('app-token')).toBe(true);
    expect(__cookieStore.has('app-refresh')).toBe(true);
    expect(__cookieStore.has('app-csrf')).toBe(true);
    expect(prismaMock.accountActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', type: 'LOGIN' }),
    });
  });
```

- [ ] **Step 8: Extend `set-password/route.test.ts`'s happy-path test**

In `frontend/src/app/api/auth/set-password/route.test.ts`, find `'Test 1 — happy path: hashes newPassword, bumps tokenVersion, sets fresh cookies'` (line 121). Find where it asserts `prismaMock.user.update` was called (around line 135-153) and add, right before that test's closing `});`:

```ts
    expect(prismaMock.accountActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user_1', type: 'PASSWORD_SET' }),
    });
```

(Match the existing test's `userId: 'user_1'` — that's the id used by this file's `beforeEach` mock for `prismaMock.user.findUnique`, confirmed at line 103.)

- [ ] **Step 9: Extend `change-password/route.test.ts`'s happy-path test**

In `frontend/src/app/api/auth/change-password/route.test.ts`, find `'Test 1 — happy path: hashes new password, bumps tokenVersion, sets new cookies'` (line 159). Add, right before that test's closing `});`:

```ts
    expect(prismaMock.accountActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user_1', type: 'PASSWORD_CHANGED' }),
    });
```

(Same `userId: 'user_1'`, confirmed at this file's `beforeEach` mock, line 139.)

- [ ] **Step 10: Run all affected tests**

Run:
```bash
pnpm --filter frontend exec vitest run src/app/api/auth/login/route.test.ts src/app/api/auth/set-password/route.test.ts src/app/api/auth/change-password/route.test.ts
```
Expected: all PASS (no new failures, plus the 3 new assertions pass).

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/api/auth/login/route.ts frontend/src/app/api/auth/login/route.test.ts \
        frontend/src/app/api/auth/set-password/route.ts frontend/src/app/api/auth/set-password/route.test.ts \
        frontend/src/app/api/auth/change-password/route.ts frontend/src/app/api/auth/change-password/route.test.ts
git commit -m "feat(privacy): log account activity on login/set-password/change-password"
```

---

### Task 7: Wire activity logging into the Google OAuth callback (PROTECTED FILE — pre-approved single addition)

**Files:**
- Modify: `frontend/src/app/api/auth/oauth/google/callback/route.ts:20-38,182-195`
- Modify: `frontend/src/app/api/auth/oauth/google/callback/route.test.ts` (add one assertion each to 3 existing success tests)

**Interfaces:**
- Consumes: `logAccountActivity` (Task 2).
- Produces: nothing consumed by later tasks — this is the plan's last task.

**⚠️ This file is PROTECTED per `CLAUDE.md`** (state/PKCE/account-linking logic is interdependent — see the file's own top-of-file comment documenting its OAUTH-02/OAUTH-03 sequence). The user explicitly pre-approved, during this plan's brainstorming, exactly the two edits below — nothing else in this file may change. Do not reorder the existing 11-step sequence documented in the file's header comment, do not rename any existing variable, do not "clean up" anything else you notice while in this file.

- [ ] **Step 1: Add the import**

The current import block (lines 22-38) ends with:

```ts
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
```

Add one new import line immediately after it:

```ts
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';
import { logAccountActivity } from '@/lib/server/account/activity';
```

- [ ] **Step 2: Log at the existing cookie-issuing success point**

The current success block (lines 182-195) reads:

```ts
    const access = await createAccessToken({
      sub: u.id,
      email: u.email,
      tokenVersion: u.tokenVersion,
    });
    const refresh = await createRefreshToken(u.id, u.tokenVersion);
    await setAuthCookies(access, refresh);
    await setCsrfCookie();

    // D-03: welcome notification on first OAuth account creation.
    // NOTIF-05 invariant — go through createNotification (never prisma.notification.create directly).
    if (isNewUser) {
      await createNotification(prisma, welcomeNotification(u.id, u.email));
    }
```

Insert the logging block between `await setCsrfCookie();` and the `// D-03:` comment — i.e. immediately after cookies are issued, before the welcome-notification branch, so it fires on every successful authentication (both first-time link/create and returning OAuth login) rather than only the `isNewUser` branch:

```ts
    const access = await createAccessToken({
      sub: u.id,
      email: u.email,
      tokenVersion: u.tokenVersion,
    });
    const refresh = await createRefreshToken(u.id, u.tokenVersion);
    await setAuthCookies(access, refresh);
    await setCsrfCookie();

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const userAgent = req.headers.get('user-agent') ?? undefined;
    try {
      await logAccountActivity(prisma, { userId: u.id, type: 'OAUTH_LINKED', ip, userAgent });
    } catch (err) {
      log.warn('account activity log failed', { err: String(err), userId: u.id, type: 'OAUTH_LINKED' });
    }

    // D-03: welcome notification on first OAuth account creation.
    // NOTIF-05 invariant — go through createNotification (never prisma.notification.create directly).
    if (isNewUser) {
      await createNotification(prisma, welcomeNotification(u.id, u.email));
    }
```

This is the complete, exact scope of the change to this file — one import line, one 7-line block inserted at one point. Nothing else changes.

- [ ] **Step 3: Extend the 3 existing success-path tests**

In `frontend/src/app/api/auth/oauth/google/callback/route.test.ts`, add one assertion to each of these 3 existing tests (each already asserts `mockSetAuthCookies`/`mockSetCsrfCookie` were called — add the new assertion right after those, before the test's closing `});`):

1. **`'D-01 link path: existing email user gets OAuthAccount row; ...'`** (starts line 190) — add, right before the test's closing `});` (after the existing `expect(mockCreateNotification).not.toHaveBeenCalled();` at line 231):
   ```ts
   expect(prismaMock.accountActivity.create).toHaveBeenCalledWith({
     data: expect.objectContaining({ userId: 'u-existing', type: 'OAUTH_LINKED' }),
   });
   ```

2. **`'D-02 create path: brand-new user → $transaction creates User + OAuthAccount; ...'`** (starts line 234) — add:
   ```ts
   expect(prismaMock.accountActivity.create).toHaveBeenCalledWith({
     data: expect.objectContaining({ userId: 'u-new', type: 'OAUTH_LINKED' }),
   });
   ```

3. **`'existing OAuth user (provider lookup hits): no User update, no welcome, just 3 cookies'`** (starts line 283) — add, right before the test's closing `});` (after the existing `expect(mockSetCsrfCookie)...` assertion at line 306):
   ```ts
   expect(prismaMock.accountActivity.create).toHaveBeenCalledWith({
     data: expect.objectContaining({ userId: 'u-returning', type: 'OAUTH_LINKED' }),
   });
   ```

All 3 `userId` values above (`u-existing`, `u-new`, `u-returning`) were confirmed by reading each test's own mock setup — they are exact, not placeholders.

- [ ] **Step 4: Run the full oauth callback test file**

Run: `pnpm --filter frontend exec vitest run src/app/api/auth/oauth/google/callback/route.test.ts`
Expected: PASS, all tests (including the 3 newly-extended ones) — no regressions in the other ~9 tests in this file (state mismatch, code exchange failure, email not verified, provider disabled, etc. — none of those reach the new logging block, so none should be affected).

- [ ] **Step 5: Run the full suite once more**

Run: `pnpm --filter frontend exec vitest run`
Expected: all green — this confirms the protected-file edit didn't regress anything elsewhere (e.g. any other test that imports this route module).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/auth/oauth/google/callback/route.ts frontend/src/app/api/auth/oauth/google/callback/route.test.ts
git commit -m "feat(privacy): log account activity on Google OAuth success (pre-approved protected-file edit)"
```

---

## Final gate (run once, after all 7 tasks)

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: all green. This plan adds no UI — `/settings`'s privacy page (consuming `GET /api/account/privacy` and a download button hitting `GET /api/account/export`) is explicitly a separate, future frontend task, not part of this plan.
