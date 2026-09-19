# Admin Premium Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a SUPERADMIN grant/revoke a user's plan (`FREE|PLUS|BABY`), optionally time-bounded, and let a SUPERADMIN edit the FCFA price of `PLUS`/`BABY`, with the real price surfaced on the read-only `/app/billing` page.

**Architecture:** A new `PricingPlan` Prisma model (2 rows: PLUS, BABY) plus a new `Profile.planExpiresAt` field back three new/modified admin routes (`PATCH .../users/[id]/plan`, `GET`/`PATCH .../pricing-plans[/[key]]`) and one new public route (`GET /api/pricing`). An hourly cron downgrades expired grants back to `FREE`. Admin UI additions: a "Plan" section in the existing `UserDetailModal`, and a new `/admin/pricing` page. `/app/billing` fetches the new public endpoint instead of using hardcoded prices.

**Tech Stack:** Next.js 16 Route Handlers, Prisma 5, Vitest + `vitest-mock-extended` (`prismaMock`), Upstash Redis via the existing `withLease` cron-coordination helper.

**Spec:** `docs/superpowers/specs/2026-09-19-admin-premium-management-design.md`

## Global Constraints

- Every new/modified Route Handler: `export const runtime = 'nodejs'`.
- Every mutating route (`PATCH`): `verifyCsrf(req)` at the top, before any auth check.
- `PATCH /api/admin/users/[id]/plan` and `PATCH /api/admin/pricing-plans/[key]`: `requireSuperadmin()`.
- `GET /api/admin/pricing-plans`: `requireAdmin('ADMIN')`.
- `GET /api/pricing`: no auth, no CSRF (it's a `GET`), no `enforceAdminRateLimit` (it's not an admin route — relies on the existing global IP limiter only).
- Every admin mutation MUST call `logAdminAction(prisma | tx, {...})`. Skipping it is a compliance regression per CLAUDE.md.
- FCFA amounts are always integers, never decimals. Validate with `z.number().int()`.
- Out of scope, do not build in any task below: a real payment/purchase flow, feature-gating enforcement keyed off `plan`, or a full plan-catalog editor (name/promise/features stay static in `plans-data.ts`).
- `AccountActivityType` is additive-only — never rename `LOGIN | PASSWORD_CHANGED | PASSWORD_SET | OAUTH_LINKED | DATA_EXPORTED | ACCOUNT_DELETED`.
- `frontend/src/lib/server/observability/vercel-json-shape.test.ts` is an intentional tripwire, not a protected file — it is meant to be updated when a cron is added.
- `Profile` is optional on `User` (`profile Profile?`) — a user without a completed onboarding has no `Profile` row. Every place that reads `plan`/`planExpiresAt` off a joined `Profile` must default to `plan: 'FREE'`, `planExpiresAt: null` when `profile` is `null`.

---

### Task 1: `Profile.planExpiresAt` + `PricingPlan` model, migration with seed

**Files:**
- Modify: `frontend/prisma/schema.prisma`
- Create: `frontend/prisma/migrations/<timestamp>_nawira_plan_pricing/migration.sql` (generated + hand-edited)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `prisma.profile.update({ data: { plan, planExpiresAt } })` capability; `prisma.pricingPlan.findMany/update` capability; two seeded rows `PricingPlan{key:'PLUS',priceFcfa:1000}` and `PricingPlan{key:'BABY',priceFcfa:2500}` that Task 4/5 read.

- [ ] **Step 1: Add `planExpiresAt` to `Profile`**

In `frontend/prisma/schema.prisma`, find `model Profile` (currently line 379) and its `plan` field:

```prisma
  plan              String   @default("FREE") // FREE | PLUS | BABY
```

Add the new field immediately after it:

```prisma
  plan              String   @default("FREE") // FREE | PLUS | BABY
  planExpiresAt     DateTime? // null = permanent; set only via admin grant with an end date;
                              // cleared automatically by the plan-expiration cron on downgrade
```

- [ ] **Step 2: Add the `PricingPlan` model**

In the same file, find `model AccountActivity` (currently starts at line 109) and the `// ─── Multi-tenancy primitives ───` comment block that follows its closing `}`. Insert the new model immediately **after** `AccountActivity`'s closing `}` and **before** that comment block:

```prisma
model PricingPlan {
  id        String   @id @default(cuid())
  key       String   @unique // "PLUS" | "BABY" — FREE has no row (always 0 FCFA)
  priceFcfa Int // integer FCFA, no decimals (CLAUDE.md money invariant)
  updatedAt DateTime @updatedAt
  updatedBy String? // User.id of the admin who last changed it (denormalized
                     // convenience; the authoritative trail is AdminAction)
}
```

- [ ] **Step 3: Generate the migration without applying it**

Run from `frontend/`:

```bash
pnpm exec prisma migrate dev --name nawira_plan_pricing --create-only
```

Expected: a new directory `frontend/prisma/migrations/<timestamp>_nawira_plan_pricing/migration.sql` is created, NOT yet applied to the database. It contains an `ALTER TABLE "Profile" ADD COLUMN "planExpiresAt" TIMESTAMP(3);` and a `CREATE TABLE "PricingPlan" (...)` with a unique index on `"key"`.

- [ ] **Step 4: Append the seed INSERT to the generated migration file**

Open the generated `migration.sql` file and append at the end:

```sql
-- Seed the two priced plans so /app/billing keeps showing the same numbers
-- until an admin changes them (no visible behavior change on ship day).
INSERT INTO "PricingPlan" ("id", "key", "priceFcfa", "updatedAt", "updatedBy")
VALUES
  ('pricingplan_plus_seed', 'PLUS', 1000, CURRENT_TIMESTAMP, NULL),
  ('pricingplan_baby_seed', 'BABY', 2500, CURRENT_TIMESTAMP, NULL);
```

- [ ] **Step 5: Apply the migration**

Run from the repo root:

```bash
pnpm db:migrate:dev
```

Expected: Prisma applies the pending `nawira_plan_pricing` migration (including the seed `INSERT`s) and regenerates the Prisma Client. No errors.

- [ ] **Step 6: Verify**

Run: `pnpm db:migrate:status` — expect the new migration listed as applied, nothing pending.
Run: `pnpm --filter frontend exec vitest run --run -t "nonexistent"` (or `pnpm typecheck`) — expect a clean typecheck, confirming the regenerated Prisma Client compiles.

- [ ] **Step 7: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/
git commit -m "feat(admin): add Profile.planExpiresAt and PricingPlan model, seed PLUS/BABY prices"
```

---

### Task 2: Extend `AccountActivityType` with `PLAN_CHANGED` / `PLAN_EXPIRED`

**Files:**
- Modify: `frontend/src/lib/server/account/activity.ts`

**Interfaces:**
- Consumes: nothing new (existing `logAccountActivity` function/signature is unchanged).
- Produces: `AccountActivityType` now includes `'PLAN_CHANGED' | 'PLAN_EXPIRED'`, consumed by Task 3 (route) and Task 6 (cron).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/server/account/activity.test.ts` if it doesn't already exist (check first — if it exists, add this test to it instead of overwriting):

```ts
import { describe, it, expect } from 'vitest';
import type { AccountActivityType } from './activity';

describe('AccountActivityType', () => {
  it('includes PLAN_CHANGED and PLAN_EXPIRED as valid values', () => {
    const changed: AccountActivityType = 'PLAN_CHANGED';
    const expired: AccountActivityType = 'PLAN_EXPIRED';
    expect(changed).toBe('PLAN_CHANGED');
    expect(expired).toBe('PLAN_EXPIRED');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/account/activity.test.ts`
Expected: FAIL — TypeScript compile error, `'PLAN_CHANGED'` is not assignable to `AccountActivityType`.

- [ ] **Step 3: Add the two new members**

In `frontend/src/lib/server/account/activity.ts`, change:

```ts
export type AccountActivityType =
  | 'LOGIN'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_SET'
  | 'OAUTH_LINKED'
  | 'DATA_EXPORTED'
  | 'ACCOUNT_DELETED';
```

to:

```ts
export type AccountActivityType =
  | 'LOGIN'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_SET'
  | 'OAUTH_LINKED'
  | 'DATA_EXPORTED'
  | 'ACCOUNT_DELETED'
  | 'PLAN_CHANGED'
  | 'PLAN_EXPIRED';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/account/activity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/account/activity.ts frontend/src/lib/server/account/activity.test.ts
git commit -m "feat(admin): add PLAN_CHANGED and PLAN_EXPIRED account activity types"
```

---

### Task 3: `PATCH /api/admin/users/[id]/plan`

**Files:**
- Create: `frontend/src/app/api/admin/users/[id]/plan/route.ts`
- Test: `frontend/src/app/api/admin/users/[id]/plan/route.test.ts`

**Interfaces:**
- Consumes: `requireSuperadmin()`, `verifyCsrf(req)`, `enforceAdminRateLimit(id)`, `logAdminAction`, `logAccountActivity` (with `'PLAN_CHANGED'` from Task 2), `prisma.$transaction`, `makeRequestContext`/`withRequestContext`.
- Produces: `PATCH /api/admin/users/[id]/plan` — request `{ plan: 'FREE'|'PLUS'|'BABY', expiresAt?: string }`, response `200 { profile: { plan, planExpiresAt } }`, consumed by Task 8's `UserDetailModal.tsx` Plan section.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/admin/users/[id]/plan/route.test.ts`:

```ts
// ADMIN-PLAN — PATCH /api/admin/users/[id]/plan behaviour. Mirrors the
// role/route.test.ts and [id]/route.test.ts (DELETE) test patterns.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireSuperadmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn(),
}));
vi.mock('@/lib/server/account/activity', () => ({
  logAccountActivity: vi.fn(),
}));

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { logAccountActivity } from '@/lib/server/account/activity';
import { PATCH } from './route';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);
const mockLogAccountActivity = vi.mocked(logAccountActivity);

const superadminCtx = {
  user: { sub: 'super_1', email: 'super@test.local' },
  admin: { id: 'super_1', email: 'super@test.local', role: 'SUPERADMIN' as const },
};

function makePatch(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSuperadmin.mockResolvedValue(superadminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('PATCH /api/admin/users/[id]/plan', () => {
  it('returns the CSRF failure response when verifyCsrf rejects', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await PATCH(makePatch('http://test/x', { plan: 'PLUS' }), ctxWith('u1'));
    expect(res.status).toBe(403);
    expect(mockRequireSuperadmin).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not SUPERADMIN', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'SUPERADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await PATCH(makePatch('http://test/x', { plan: 'PLUS' }), ctxWith('u1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 VALIDATION_FAILED for an invalid plan enum value', async () => {
    const res = await PATCH(makePatch('http://test/x', { plan: 'GOLD' }), ctxWith('u1'));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('returns 400 VALIDATION_FAILED when expiresAt is in the past', async () => {
    const res = await PATCH(
      makePatch('http://test/x', { plan: 'PLUS', expiresAt: '2020-01-01T00:00:00.000Z' }),
      ctxWith('u1'),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('returns 400 VALIDATION_FAILED when expiresAt is given together with plan FREE', async () => {
    const res = await PATCH(
      makePatch('http://test/x', {
        plan: 'FREE',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
      ctxWith('u1'),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('returns 404 USER_NOT_FOUND when the target user has no Profile row', async () => {
    prismaMock.$transaction.mockImplementationOnce(async (cb: unknown) => {
      const tx = { profile: { findUnique: vi.fn().mockResolvedValue(null) } };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as (tx: any) => unknown)(tx);
    });
    const res = await PATCH(makePatch('http://test/x', { plan: 'PLUS' }), ctxWith('missing'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('USER_NOT_FOUND');
  });

  it('is idempotent (200, no writes) when plan and expiresAt are unchanged', async () => {
    prismaMock.$transaction.mockImplementationOnce(async (cb: unknown) => {
      const tx = {
        profile: {
          findUnique: vi.fn().mockResolvedValue({ userId: 'u1', plan: 'PLUS', planExpiresAt: null }),
          update: vi.fn(),
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as (tx: any) => unknown)(tx);
    });
    const res = await PATCH(makePatch('http://test/x', { plan: 'PLUS' }), ctxWith('u1'));
    expect(res.status).toBe(200);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
    expect(mockLogAccountActivity).not.toHaveBeenCalled();
  });

  it('grants a plan: updates Profile, writes AdminAction and AccountActivity', async () => {
    const update = vi.fn().mockResolvedValue({
      userId: 'u1',
      plan: 'PLUS',
      planExpiresAt: new Date('2026-10-19T00:00:00.000Z'),
    });
    prismaMock.$transaction.mockImplementationOnce(async (cb: unknown) => {
      const tx = {
        profile: {
          findUnique: vi.fn().mockResolvedValue({ userId: 'u1', plan: 'FREE', planExpiresAt: null }),
          update,
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as (tx: any) => unknown)(tx);
    });
    const res = await PATCH(
      makePatch('http://test/x', { plan: 'PLUS', expiresAt: '2026-10-19T00:00:00.000Z' }),
      ctxWith('u1'),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profile: { plan: string; planExpiresAt: string } };
    expect(body.profile.plan).toBe('PLUS');
    expect(update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { plan: 'PLUS', planExpiresAt: new Date('2026-10-19T00:00:00.000Z') },
    });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: 'super_1',
        action: 'user.plan_change',
        targetType: 'User',
        targetId: 'u1',
        metadata: { from: 'FREE', to: 'PLUS', expiresAt: '2026-10-19T00:00:00.000Z' },
      }),
    );
    expect(mockLogAccountActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'u1',
        type: 'PLAN_CHANGED',
        metadata: { from: 'FREE', to: 'PLUS', expiresAt: '2026-10-19T00:00:00.000Z' },
      }),
    );
  });

  it('revoking to FREE always force-writes planExpiresAt: null', async () => {
    const update = vi.fn().mockResolvedValue({ userId: 'u1', plan: 'FREE', planExpiresAt: null });
    prismaMock.$transaction.mockImplementationOnce(async (cb: unknown) => {
      const tx = {
        profile: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ userId: 'u1', plan: 'PLUS', planExpiresAt: new Date('2026-10-19T00:00:00.000Z') }),
          update,
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as (tx: any) => unknown)(tx);
    });
    const res = await PATCH(makePatch('http://test/x', { plan: 'FREE' }), ctxWith('u1'));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { plan: 'FREE', planExpiresAt: null },
    });
  });

  it('applies rate-limit using the admin userId', async () => {
    prismaMock.$transaction.mockImplementationOnce(async (cb: unknown) => {
      const tx = {
        profile: {
          findUnique: vi.fn().mockResolvedValue({ userId: 'u1', plan: 'PLUS', planExpiresAt: null }),
          update: vi.fn(),
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as (tx: any) => unknown)(tx);
    });
    await PATCH(makePatch('http://test/x', { plan: 'PLUS' }), ctxWith('u1'));
    expect(mockRateLimit).toHaveBeenCalledWith('super_1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/users/[id]/plan/route.test.ts`
Expected: FAIL — `Cannot find module './route'` (the route file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `frontend/src/app/api/admin/users/[id]/plan/route.ts`:

```ts
// ADMIN-PLAN — PATCH /api/admin/users/[id]/plan
//
// SUPERADMIN-only plan grant/revoke, optionally time-bounded. Mirrors
// PATCH /api/admin/users/[id]/role's shape (SUPERADMIN + transaction +
// logAdminAction) but also writes to the user-facing AccountActivity
// trail (E8) since a plan change is something the user themselves should
// see in their own privacy/activity log.
//
// Setting plan: 'FREE' always force-writes planExpiresAt: null, even if
// the caller didn't pass expiresAt — revoking access must never leave a
// stale expiry date behind that a later re-grant could accidentally
// inherit. Providing expiresAt together with plan: 'FREE' is rejected
// outright (VALIDATION_FAILED) rather than silently ignored.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { logAccountActivity } from '@/lib/server/account/activity';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z
  .object({
    plan: z.enum(['FREE', 'PLUS', 'BABY']),
    expiresAt: z.string().datetime().optional(),
  })
  .refine((v) => !(v.plan === 'FREE' && v.expiresAt !== undefined), {
    message: 'expiresAt is not allowed together with plan FREE',
  })
  .refine((v) => v.expiresAt === undefined || new Date(v.expiresAt).getTime() > Date.now(), {
    message: 'expiresAt must be a future date',
  });

type Discriminator =
  | { kind: 'NOT_FOUND' }
  | { kind: 'NOOP'; profile: { plan: string; planExpiresAt: Date | null } }
  | { kind: 'OK'; from: string; profile: { plan: string; planExpiresAt: Date | null } };

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const nextExpiresAt = parsed.data.plan === 'FREE' ? null : (parsed.data.expiresAt ?? null);
    const nextExpiresAtDate = nextExpiresAt ? new Date(nextExpiresAt) : null;

    const result: Discriminator = await prisma.$transaction(async (tx) => {
      const target = await tx.profile.findUnique({
        where: { userId: id },
        select: { plan: true, planExpiresAt: true },
      });
      if (!target) return { kind: 'NOT_FOUND' as const };

      const unchanged =
        target.plan === parsed.data.plan &&
        (target.planExpiresAt?.getTime() ?? null) === (nextExpiresAtDate?.getTime() ?? null);
      if (unchanged) {
        return { kind: 'NOOP' as const, profile: target };
      }

      const updated = await tx.profile.update({
        where: { userId: id },
        data: { plan: parsed.data.plan, planExpiresAt: nextExpiresAtDate },
      });

      return {
        kind: 'OK' as const,
        from: target.plan,
        profile: { plan: updated.plan, planExpiresAt: updated.planExpiresAt },
      };
    });

    if (result.kind === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (result.kind === 'OK') {
      const metadata = {
        from: result.from,
        to: result.profile.plan,
        expiresAt: result.profile.planExpiresAt ? result.profile.planExpiresAt.toISOString() : null,
      };
      await logAdminAction(prisma, {
        actorId: auth.admin.id,
        action: 'user.plan_change',
        targetType: 'User',
        targetId: id,
        metadata,
      });
      await logAccountActivity(prisma, { userId: id, type: 'PLAN_CHANGED', metadata });
    }

    return NextResponse.json(
      {
        profile: {
          plan: result.profile.plan,
          planExpiresAt: result.profile.planExpiresAt ? result.profile.planExpiresAt.toISOString() : null,
        },
      },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/users/[id]/plan/route.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/admin/users/[id]/plan/
git commit -m "feat(admin): add PATCH /api/admin/users/[id]/plan (grant/revoke premium)"
```

---

### Task 4: `GET`/`PATCH /api/admin/pricing-plans[/[key]]`

**Files:**
- Create: `frontend/src/app/api/admin/pricing-plans/route.ts`
- Create: `frontend/src/app/api/admin/pricing-plans/route.test.ts`
- Create: `frontend/src/app/api/admin/pricing-plans/[key]/route.ts`
- Create: `frontend/src/app/api/admin/pricing-plans/[key]/route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin('ADMIN')`, `requireSuperadmin()`, `verifyCsrf`, `enforceAdminRateLimit`, `logAdminAction`, `prisma.pricingPlan`, seeded rows from Task 1.
- Produces: `GET /api/admin/pricing-plans` → `200 { plans: [{key,priceFcfa,updatedAt,updatedBy}] }`; `PATCH /api/admin/pricing-plans/[key]` → `200 { plan: {key,priceFcfa,updatedAt,updatedBy} }`. Consumed by Task 9's `/admin/pricing` page.

- [ ] **Step 1: Write the failing tests for the list route**

Create `frontend/src/app/api/admin/pricing-plans/route.test.ts`:

```ts
// ADMIN-PRICING — GET /api/admin/pricing-plans (read access for ADMIN + SUPERADMIN).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const adminCtx = {
  user: { sub: 'admin_1', email: 'admin@test.local' },
  admin: { id: 'admin_1', email: 'admin@test.local', role: 'ADMIN' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/admin/pricing-plans', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('GET /api/admin/pricing-plans', () => {
  it('returns both plans with resolved updatedBy email', async () => {
    prismaMock.pricingPlan.findMany.mockResolvedValueOnce([
      {
        id: 'p1',
        key: 'PLUS',
        priceFcfa: 1000,
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedBy: 'admin_1',
      },
      {
        id: 'p2',
        key: 'BABY',
        priceFcfa: 2500,
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedBy: null,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: 'admin_1', email: 'admin@test.local' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      plans: Array<{ key: string; priceFcfa: number; updatedBy: string | null }>;
    };
    expect(body.plans).toEqual([
      expect.objectContaining({ key: 'PLUS', priceFcfa: 1000, updatedBy: 'admin@test.local' }),
      expect.objectContaining({ key: 'BABY', priceFcfa: 2500, updatedBy: null }),
    ]);
  });

  it('403s a plain USER (requireAdmin gate)', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
  });

  it('returns 429 when rate-limited', async () => {
    mockRateLimit.mockResolvedValueOnce(NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }));
    const res = await GET(makeGet());
    expect(res.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/pricing-plans/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement the list route**

Create `frontend/src/app/api/admin/pricing-plans/route.ts`:

```ts
// ADMIN-PRICING — GET /api/admin/pricing-plans. Read access for both ADMIN
// and SUPERADMIN (matches every other admin list route's read-tier gate).
// Only 2 rows ever exist (PLUS, BABY) — no pagination needed.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const rows = await prisma.pricingPlan.findMany({ orderBy: { key: 'asc' } });
    const updaterIds = [...new Set(rows.map((r) => r.updatedBy).filter((v): v is string => v !== null))];
    const updaters = updaterIds.length
      ? await prisma.user.findMany({
          where: { id: { in: updaterIds } },
          select: { id: true, email: true },
        })
      : [];
    const emailById = new Map(updaters.map((u) => [u.id, u.email]));

    const plans = rows.map((r) => ({
      key: r.key,
      priceFcfa: r.priceFcfa,
      updatedAt: r.updatedAt.toISOString(),
      updatedBy: r.updatedBy ? (emailById.get(r.updatedBy) ?? null) : null,
    }));

    return NextResponse.json({ plans }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 4: Run to verify the list route passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/pricing-plans/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for the write route**

Create `frontend/src/app/api/admin/pricing-plans/[key]/route.test.ts`:

```ts
// ADMIN-PRICING — PATCH /api/admin/pricing-plans/[key] (SUPERADMIN-only).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireSuperadmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn(),
}));

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { PATCH } from './route';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);

const superadminCtx = {
  user: { sub: 'super_1', email: 'super@test.local' },
  admin: { id: 'super_1', email: 'super@test.local', role: 'SUPERADMIN' as const },
};

function makePatch(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/pricing-plans/PLUS', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function ctxWith(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSuperadmin.mockResolvedValue(superadminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('PATCH /api/admin/pricing-plans/[key]', () => {
  it('returns 404 PLAN_NOT_FOUND for key=FREE', async () => {
    const res = await PATCH(makePatch({ priceFcfa: 500 }), ctxWith('FREE'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('PLAN_NOT_FOUND');
  });

  it('returns 400 VALIDATION_FAILED for a negative price', async () => {
    const res = await PATCH(makePatch({ priceFcfa: -1 }), ctxWith('PLUS'));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('returns 400 VALIDATION_FAILED for a price above the 1,000,000 ceiling', async () => {
    const res = await PATCH(makePatch({ priceFcfa: 1_000_001 }), ctxWith('PLUS'));
    expect(res.status).toBe(400);
  });

  it('returns 400 VALIDATION_FAILED for a non-integer price', async () => {
    const res = await PATCH(makePatch({ priceFcfa: 12.5 }), ctxWith('PLUS'));
    expect(res.status).toBe(400);
  });

  it('is idempotent (200, no write) when the price is unchanged', async () => {
    prismaMock.pricingPlan.findUnique.mockResolvedValueOnce({
      id: 'p1',
      key: 'PLUS',
      priceFcfa: 1000,
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedBy: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const res = await PATCH(makePatch({ priceFcfa: 1000 }), ctxWith('PLUS'));
    expect(res.status).toBe(200);
    expect(prismaMock.pricingPlan.update).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('updates the price, writes AdminAction, returns the new row', async () => {
    prismaMock.pricingPlan.findUnique.mockResolvedValueOnce({
      id: 'p1',
      key: 'PLUS',
      priceFcfa: 1000,
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedBy: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    prismaMock.pricingPlan.update.mockResolvedValueOnce({
      id: 'p1',
      key: 'PLUS',
      priceFcfa: 1200,
      updatedAt: new Date('2026-09-19T00:00:00.000Z'),
      updatedBy: 'super_1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const res = await PATCH(makePatch({ priceFcfa: 1200 }), ctxWith('PLUS'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plan: { priceFcfa: number } };
    expect(body.plan.priceFcfa).toBe(1200);
    expect(prismaMock.pricingPlan.update).toHaveBeenCalledWith({
      where: { key: 'PLUS' },
      data: { priceFcfa: 1200, updatedBy: 'super_1' },
    });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: 'super_1',
        action: 'pricing.update',
        targetType: 'PricingPlan',
        targetId: 'PLUS',
        metadata: { from: 1000, to: 1200 },
      }),
    );
  });

  it('403s a non-SUPERADMIN caller', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'SUPERADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await PATCH(makePatch({ priceFcfa: 1200 }), ctxWith('PLUS'));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run "src/app/api/admin/pricing-plans/[key]/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 7: Implement the write route**

Create `frontend/src/app/api/admin/pricing-plans/[key]/route.ts`:

```ts
// ADMIN-PRICING — PATCH /api/admin/pricing-plans/[key]. SUPERADMIN-only.
// `key` is restricted to PLUS|BABY — FREE is always 0 FCFA and has no row.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  priceFcfa: z.number().int().min(0).max(1_000_000),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { key } = await ctx.params;
    if (key !== 'PLUS' && key !== 'BABY') {
      return NextResponse.json(
        { error: 'PLAN_NOT_FOUND', message: 'Unknown pricing plan key' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const existing = await prisma.pricingPlan.findUnique({ where: { key } });
    if (!existing) {
      return NextResponse.json(
        { error: 'PLAN_NOT_FOUND', message: 'Unknown pricing plan key' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (existing.priceFcfa === parsed.data.priceFcfa) {
      return NextResponse.json(
        {
          plan: {
            key: existing.key,
            priceFcfa: existing.priceFcfa,
            updatedAt: existing.updatedAt.toISOString(),
            updatedBy: existing.updatedBy,
          },
        },
        { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const updated = await prisma.pricingPlan.update({
      where: { key },
      data: { priceFcfa: parsed.data.priceFcfa, updatedBy: auth.admin.id },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'pricing.update',
      targetType: 'PricingPlan',
      targetId: key,
      metadata: { from: existing.priceFcfa, to: parsed.data.priceFcfa },
    });

    return NextResponse.json(
      {
        plan: {
          key: updated.key,
          priceFcfa: updated.priceFcfa,
          updatedAt: updated.updatedAt.toISOString(),
          updatedBy: updated.updatedBy,
        },
      },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
```

- [ ] **Step 8: Run to verify all pricing-plans tests pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/pricing-plans`
Expected: PASS, both files.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/api/admin/pricing-plans/
git commit -m "feat(admin): add GET/PATCH /api/admin/pricing-plans (admin-editable PLUS/BABY price)"
```

---

### Task 5: `GET /api/pricing` (public)

**Files:**
- Create: `frontend/src/app/api/pricing/route.ts`
- Test: `frontend/src/app/api/pricing/route.test.ts`

**Interfaces:**
- Consumes: `prisma.pricingPlan.findMany` (from Task 1's seeded rows).
- Produces: `GET /api/pricing` → `200 { plans: [{key,priceFcfa}] }`, no auth. Consumed by Task 11 (`/app/billing`).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/pricing/route.test.ts`:

```ts
// PUBLIC-PRICING — GET /api/pricing. No auth, excludes admin-only fields.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/pricing', { method: 'GET' });
}

beforeEach(() => {
  // prismaMock auto-resets via test-utils/prisma-mock's beforeEach
});

describe('GET /api/pricing', () => {
  it('returns 200 with plans, no auth required', async () => {
    prismaMock.pricingPlan.findMany.mockResolvedValueOnce([
      {
        id: 'p1',
        key: 'PLUS',
        priceFcfa: 1000,
        updatedAt: new Date(),
        updatedBy: null,
      },
      {
        id: 'p2',
        key: 'BABY',
        priceFcfa: 2500,
        updatedAt: new Date(),
        updatedBy: 'admin_1',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plans: Array<Record<string, unknown>> };
    expect(body.plans).toEqual([
      { key: 'PLUS', priceFcfa: 1000 },
      { key: 'BABY', priceFcfa: 2500 },
    ]);
  });

  it('excludes updatedAt and updatedBy from the public response', async () => {
    prismaMock.pricingPlan.findMany.mockResolvedValueOnce([
      { id: 'p1', key: 'PLUS', priceFcfa: 1000, updatedAt: new Date(), updatedBy: 'admin_1' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    const res = await GET(makeGet());
    const body = (await res.json()) as { plans: Array<Record<string, unknown>> };
    expect(body.plans[0]).not.toHaveProperty('updatedAt');
    expect(body.plans[0]).not.toHaveProperty('updatedBy');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/pricing/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement**

Create `frontend/src/app/api/pricing/route.ts`:

```ts
// PUBLIC-PRICING — GET /api/pricing. Unauthenticated: pricing is not
// sensitive, and gating it behind login would block a future pre-signup
// pricing page. Deliberately excludes updatedAt/updatedBy (internal admin
// metadata). No admin-rate-limit — relies on the existing global IP
// limiter only.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';

export async function GET(): Promise<NextResponse> {
  const rows = await prisma.pricingPlan.findMany({ orderBy: { key: 'asc' } });
  const plans = rows.map((r) => ({ key: r.key, priceFcfa: r.priceFcfa }));
  return NextResponse.json({ plans });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/pricing/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/pricing/
git commit -m "feat: add public GET /api/pricing endpoint"
```

---

### Task 6: Extend `GET /api/admin/me` capability list

**Files:**
- Modify: `frontend/src/app/api/admin/me/route.ts`
- Modify: `frontend/src/app/api/admin/me/route.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `can` array now includes `pricing:read` (both roles), `users:plan` and `pricing:write` (SUPERADMIN only) — consumed by Task 8 (`UserDetailModal`'s Plan section gate) and Task 9 (`/admin/pricing` page's write gate).

- [ ] **Step 1: Update the failing/changing tests first**

In `frontend/src/app/api/admin/me/route.test.ts`, make these 3 exact edits:

Edit 1 — the ADMIN 8-item exact-list test (currently lines 56-77), change the array and the length to 9:

```ts
    expect(body.can).toEqual([
      'users:read',
      'users:status:suspend',
      'orders:read',
      'withdrawals:read',
      'audit-log:read',
      'outbox:read',
      'email-queue:read',
      'rate-limits:read',
      'pricing:read',
    ]);
    expect(body.can).toHaveLength(9);
```

Edit 2 — the SUPERADMIN broader-list test (currently lines 79-94), add the 3 new `toContain` assertions and bump the length to 15:

```ts
    expect(body.can).toContain('users:role');
    expect(body.can).toContain('withdrawals:cancel');
    expect(body.can).toContain('users:status:restore');
    expect(body.can).toContain('users:delete');
    expect(body.can).toContain('users:plan');
    expect(body.can).toContain('pricing:read');
    expect(body.can).toContain('pricing:write');
    expect(body.can).toHaveLength(15);
```

Edit 3 — the SUPERADMIN exact-15-item test (currently lines 96-114), change the array:

```ts
    expect(body.can).toEqual([
      'users:read',
      'users:role',
      'users:status:suspend',
      'users:status:restore',
      'users:delete',
      'users:plan',
      'orders:read',
      'withdrawals:read',
      'withdrawals:cancel',
      'audit-log:read',
      'outbox:read',
      'email-queue:read',
      'rate-limits:read',
      'pricing:read',
      'pricing:write',
    ]);
```

Also update the docstring-comment describe title on the exact-list test from `'SUPERADMIN list is the exact 12-item set required by D-ADMIN-04'` to `'SUPERADMIN list is the exact 15-item set required by D-ADMIN-04'`, and update the source-invariants test's SUPERADMIN-only capability list (currently lines 173-184) to add the 3 new capabilities:

```ts
  it("each SUPERADMIN-only capability ('users:role', 'users:status:restore', 'users:delete', 'withdrawals:cancel', 'users:plan', 'pricing:write') appears exactly once in the code (not counting comments)", () => {
    const raw = fs.readFileSync(path.join(__dirname, 'route.ts'), 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const occurrences = (s: string) => (code.match(new RegExp(`'${s}'`, 'g')) ?? []).length;
    expect(occurrences('users:role')).toBe(1);
    expect(occurrences('withdrawals:cancel')).toBe(1);
    expect(occurrences('users:status:restore')).toBe(1);
    expect(occurrences('users:delete')).toBe(1);
    expect(occurrences('users:plan')).toBe(1);
    expect(occurrences('pricing:write')).toBe(1);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/me/route.test.ts`
Expected: FAIL — the array/length assertions no longer match the current 8/12-item source.

- [ ] **Step 3: Update the route source**

In `frontend/src/app/api/admin/me/route.ts`, replace the `CAPABILITIES_BY_ROLE` constant with:

```ts
const CAPABILITIES_BY_ROLE: Record<'ADMIN' | 'SUPERADMIN', readonly string[]> = {
  ADMIN: [
    'users:read',
    'users:status:suspend',
    'orders:read',
    'withdrawals:read',
    'audit-log:read',
    'outbox:read',
    'email-queue:read',
    'rate-limits:read',
    'pricing:read',
  ],
  SUPERADMIN: [
    'users:read',
    'users:role',
    'users:status:suspend',
    'users:status:restore',
    'users:delete',
    'users:plan',
    'orders:read',
    'withdrawals:read',
    'withdrawals:cancel',
    'audit-log:read',
    'outbox:read',
    'email-queue:read',
    'rate-limits:read',
    'pricing:read',
    'pricing:write',
  ],
} as const;
```

Update the file's docstring block (lines 16-24) to:

```ts
// CAPABILITY LIST CONTRACT (D-ADMIN-04 — locked):
//   ADMIN sees 9 capabilities: users:read, users:status:suspend,
//     orders:read, withdrawals:read, audit-log:read, outbox:read,
//     email-queue:read, rate-limits:read, pricing:read.
//   SUPERADMIN sees 15: same 9 (minus pricing:read counted once) + users:role
//     + users:status:restore + users:delete + users:plan +
//     withdrawals:cancel + pricing:write.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/me/route.test.ts`
Expected: PASS, all cases including the source-invariant tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/admin/me/
git commit -m "feat(admin): extend capability list with pricing:read, users:plan, pricing:write"
```

---

### Task 7: Surface `plan`/`planExpiresAt` on admin user list + detail routes

**Files:**
- Modify: `frontend/src/app/api/admin/users/route.ts`
- Modify: `frontend/src/app/api/admin/users/route.test.ts`
- Modify: `frontend/src/app/api/admin/users/[id]/route.ts`
- Modify: `frontend/src/app/api/admin/users/[id]/route.test.ts`
- Modify: `frontend/src/components/admin/types.ts`

**Interfaces:**
- Consumes: `Profile` relation on `User` (`profile Profile?`, nullable).
- Produces: `AdminUser` now includes `plan: 'FREE'|'PLUS'|'BABY'` and `planExpiresAt: string | null`, on both the list and detail admin user routes. Consumed by Task 8's `UserDetailModal.tsx` (reads `user.plan`/`user.planExpiresAt` directly off the row the list page already holds — no separate detail fetch).

- [ ] **Step 1: Extend the `AdminUser` type**

In `frontend/src/components/admin/types.ts`, change:

```ts
export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: 'USER' | 'ADMIN' | 'SUPERADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  emailVerifiedAt: string | null;
  createdAt: string;
}
```

to:

```ts
export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: 'USER' | 'ADMIN' | 'SUPERADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  emailVerifiedAt: string | null;
  createdAt: string;
  plan: 'FREE' | 'PLUS' | 'BABY';
  planExpiresAt: string | null;
}
```

- [ ] **Step 2: Write the failing test for the list route**

In `frontend/src/app/api/admin/users/route.test.ts`, add this test (read the file first to match its existing mocking/import style — it mirrors `[id]/route.test.ts`'s `prismaMock.user.findMany` pattern):

```ts
  it('maps Profile.plan/planExpiresAt onto each row, defaulting to FREE/null when Profile is missing', async () => {
    prismaMock.user.findMany.mockResolvedValueOnce([
      {
        id: 'u1',
        email: 'u1@test.local',
        name: null,
        avatarUrl: null,
        role: 'USER',
        status: 'ACTIVE',
        emailVerifiedAt: null,
        createdAt: new Date('2026-05-01T00:00:00Z'),
        profile: { plan: 'PLUS', planExpiresAt: new Date('2026-10-19T00:00:00Z') },
      },
      {
        id: 'u2',
        email: 'u2@test.local',
        name: null,
        avatarUrl: null,
        role: 'USER',
        status: 'ACTIVE',
        emailVerifiedAt: null,
        createdAt: new Date('2026-05-02T00:00:00Z'),
        profile: null,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    const res = await GET(makeGet('http://test/api/admin/users'));
    const body = (await res.json()) as { items: Array<{ plan: string; planExpiresAt: string | null }> };
    expect(body.items[0]).toMatchObject({ plan: 'PLUS', planExpiresAt: '2026-10-19T00:00:00.000Z' });
    expect(body.items[1]).toMatchObject({ plan: 'FREE', planExpiresAt: null });
    expect(body.items[0]).not.toHaveProperty('profile');
  });
```

This reuses the file's existing `makeGet(url: string): NextRequest` helper (defined at line 64 of the current file, returning `new NextRequest(url, { method: 'GET' })`) — do not redefine it.

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/users/route.test.ts`
Expected: FAIL — response items have no `plan`/`planExpiresAt` fields yet.

- [ ] **Step 4: Update the list route**

In `frontend/src/app/api/admin/users/route.ts`, change `USER_SELECT`:

```ts
const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  profile: { select: { plan: true, planExpiresAt: true } },
} as const satisfies Prisma.UserSelect;
```

Then change the section building the response (currently):

```ts
    const rows = await prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: USER_SELECT,
    });

    const page = buildPage(rows, limit);
    return NextResponse.json(page, {
      headers: { 'x-request-id': ctx.requestId },
    });
```

to:

```ts
    const rows = await prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: USER_SELECT,
    });

    const mapped = rows.map(({ profile, ...rest }) => ({
      ...rest,
      plan: profile?.plan ?? 'FREE',
      planExpiresAt: profile?.planExpiresAt ?? null,
    }));

    const page = buildPage(mapped, limit);
    return NextResponse.json(page, {
      headers: { 'x-request-id': ctx.requestId },
    });
```

- [ ] **Step 5: Run to verify the list route test passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/users/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing test for the detail route**

In `frontend/src/app/api/admin/users/[id]/route.test.ts`, extend the existing `'GET returns 200 { user } for an existing user'` test's mock data with a `profile` field and add assertions (edit the existing test rather than duplicating it — find it at the top of the `describe('/api/admin/users/[id] — detail')` block):

```ts
  it('GET returns 200 { user } for an existing user', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      email: 'u1@test.local',
      name: null,
      avatarUrl: null,
      role: 'USER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2026-05-01T00:00:00Z'),
      profile: { plan: 'BABY', planExpiresAt: null },
    } as never);

    const res = await GET(makeGet('http://test/api/admin/users/u1'), ctxWith('u1'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string; email: string; plan: string; planExpiresAt: string | null } };
    expect(body.user.id).toBe('u1');
    expect(body.user.plan).toBe('BABY');
    expect(body.user.planExpiresAt).toBeNull();
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(body.user).not.toHaveProperty('profile');
  });

  it('GET defaults plan to FREE and planExpiresAt to null when the user has no Profile row', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u2',
      email: 'u2@test.local',
      name: null,
      avatarUrl: null,
      role: 'USER',
      status: 'ACTIVE',
      emailVerifiedAt: null,
      createdAt: new Date('2026-05-01T00:00:00Z'),
      profile: null,
    } as never);

    const res = await GET(makeGet('http://test/api/admin/users/u2'), ctxWith('u2'));
    const body = (await res.json()) as { user: { plan: string; planExpiresAt: string | null } };
    expect(body.user.plan).toBe('FREE');
    expect(body.user.planExpiresAt).toBeNull();
  });
```

- [ ] **Step 7: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/users/[id]/route.test.ts`
Expected: FAIL — `body.user.plan` is `undefined`.

- [ ] **Step 8: Update the detail route**

In `frontend/src/app/api/admin/users/[id]/route.ts`, change `USER_SELECT`:

```ts
const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  profile: { select: { plan: true, planExpiresAt: true } },
} as const satisfies Prisma.UserSelect;
```

Then change the `GET` handler's body from:

```ts
    const { id } = await ctx.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!user) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    return NextResponse.json({ user }, { headers: { 'x-request-id': reqCtx.requestId } });
```

to:

```ts
    const { id } = await ctx.params;
    const row = await prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!row) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    const { profile, ...rest } = row;
    const user = { ...rest, plan: profile?.plan ?? 'FREE', planExpiresAt: profile?.planExpiresAt ?? null };
    return NextResponse.json({ user }, { headers: { 'x-request-id': reqCtx.requestId } });
```

- [ ] **Step 9: Run to verify all users route tests pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/users`
Expected: PASS, both list and detail test files.

- [ ] **Step 10: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — `AdminUser`'s new required fields are populated everywhere it's constructed (both routes now return them).

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/api/admin/users/ frontend/src/components/admin/types.ts
git commit -m "feat(admin): surface plan/planExpiresAt on admin user list + detail routes"
```

---

### Task 8: `UserDetailModal.tsx` — "Plan" section

**Files:**
- Modify: `frontend/src/components/admin/UserDetailModal.tsx`

**Interfaces:**
- Consumes: `PATCH /api/admin/users/[id]/plan` (Task 3), `admin.can.includes('users:plan')` (Task 6), `AdminUser.plan`/`AdminUser.planExpiresAt` (Task 7).
- Produces: nothing consumed by a later task — this is the terminal UI for plan management.

This is a UI-only change with no automated test in this codebase's existing pattern (no `UserDetailModal.test.tsx` exists — Playwright/manual verification is the established check for this file, per the rest of this session's admin UI work). Verification is a dev-server + browser check, not `vitest`.

- [ ] **Step 1: Add plan-related state and the mutation function**

In `frontend/src/components/admin/UserDetailModal.tsx`, add to the `errorMessage` switch (after the existing `case 'DELETION_BLOCKED_PENDING_WITHDRAWAL':` branch):

```ts
    case 'VALIDATION_FAILED':
      return 'Date d’expiration invalide, ou fournie avec le plan Free.';
```

Add `canManagePlan` next to the other `can*` derivations (after `const canDelete = ...`):

```ts
  const canManagePlan = admin.can.includes('users:plan');
```

Add plan-editing state next to the existing `useState` calls (after `const [confirmingDelete, setConfirmingDelete] = useState(false);`):

```ts
  const [planDraft, setPlanDraft] = useState<AdminUser['plan']>(user.plan);
  const [expiresAtDraft, setExpiresAtDraft] = useState(
    user.planExpiresAt ? user.planExpiresAt.slice(0, 10) : '',
  );
```

Add a `savePlan` function next to `changeRole` (after its closing `}`):

```ts
  async function savePlan(): Promise<void> {
    setBusy(true);
    try {
      const body: { plan: AdminUser['plan']; expiresAt?: string } = { plan: planDraft };
      if (planDraft !== 'FREE' && expiresAtDraft) {
        body.expiresAt = new Date(`${expiresAtDraft}T00:00:00.000Z`).toISOString();
      }
      const res = await api<{ profile: { plan: AdminUser['plan']; planExpiresAt: string | null } }>(
        `/api/admin/users/${user.id}/plan`,
        { method: 'PATCH', body },
      );
      onUpdated({ ...user, plan: res.profile.plan, planExpiresAt: res.profile.planExpiresAt });
      toast('Plan mis à jour.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }
```

- [ ] **Step 2: Add the "Plan" section to the JSX**

Insert a new section right after the existing Role `<div>` block (after its closing `)}` for `{canChangeRole && user.status !== 'DELETED' && (...)}`) and before the Suspend/Restore block:

```tsx
          {canManagePlan && user.status !== 'DELETED' && (
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <label className="text-xs font-medium text-navy" htmlFor="plan-select">
                Plan
              </label>
              <select
                id="plan-select"
                value={planDraft}
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.value as AdminUser['plan'];
                  setPlanDraft(next);
                  if (next === 'FREE') setExpiresAtDraft('');
                }}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm text-navy outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="FREE">FREE</option>
                <option value="PLUS">PLUS</option>
                <option value="BABY">BABY</option>
              </select>
              {planDraft !== 'FREE' && (
                <>
                  <label className="text-xs font-medium text-navy" htmlFor="plan-expires">
                    Expire le (optionnel — laisser vide pour permanent)
                  </label>
                  <input
                    id="plan-expires"
                    type="date"
                    value={expiresAtDraft}
                    disabled={busy}
                    onChange={(e) => setExpiresAtDraft(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2.5 text-sm text-navy outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void savePlan()}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Enregistrer
              </button>
            </div>
          )}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Start `pnpm dev`, sign in as a SUPERADMIN test account, open `/admin/users`, click a user row, confirm: the Plan section renders, changing plan to PLUS reveals the optional date input, saving with no date persists a permanent grant (`planExpiresAt: null` in the response toast success), saving with a date persists a time-bounded grant, switching back to FREE clears the date field and the save request omits `expiresAt`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/UserDetailModal.tsx
git commit -m "feat(admin): add Plan section to UserDetailModal (grant/revoke premium)"
```

---

### Task 9: `/admin/pricing` page + nav entry

**Files:**
- Modify: `frontend/src/components/admin/admin-nav.ts`
- Create: `frontend/src/app/admin/pricing/page.tsx`

**Interfaces:**
- Consumes: `GET`/`PATCH /api/admin/pricing-plans[/[key]]` (Task 4), `useAdmin()` (`can.includes('pricing:write')`), `Skeleton` primitive (`@/components/ui/Skeleton`, already exists).
- Produces: nothing consumed by a later task — terminal admin UI for this plan.

- [ ] **Step 1: Add the nav entry**

In `frontend/src/components/admin/admin-nav.ts`, add `Tag` to the `lucide-react` import:

```ts
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  Wallet,
  ScrollText,
  Inbox,
  Mail,
  Gauge,
  Tag,
  type LucideIcon,
} from 'lucide-react';
```

Append the new entry to `ADMIN_NAV`:

```ts
export const ADMIN_NAV: AdminNavItem[] = [
  { href: '/admin', label: "Vue d'ensemble", icon: LayoutDashboard, available: true },
  { href: '/admin/users', label: 'Utilisatrices', icon: Users, available: true },
  { href: '/admin/orders', label: 'Commandes', icon: ShoppingCart, available: true },
  { href: '/admin/withdrawals', label: 'Retraits', icon: Wallet, available: true },
  { href: '/admin/audit-log', label: "Journal d'audit", icon: ScrollText, available: true },
  { href: '/admin/outbox', label: 'File de sortie', icon: Inbox, available: true },
  { href: '/admin/email-queue', label: 'File emails', icon: Mail, available: true },
  { href: '/admin/rate-limits', label: 'Limites de débit', icon: Gauge, available: true },
  { href: '/admin/pricing', label: 'Tarifs', icon: Tag, available: true },
];
```

- [ ] **Step 2: Build the page**

Create `frontend/src/app/admin/pricing/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useAdmin } from '@/contexts/AdminContext';
import { Skeleton } from '@/components/ui/Skeleton';

interface PricingPlanRow {
  key: 'PLUS' | 'BABY';
  priceFcfa: number;
  updatedAt: string;
  updatedBy: string | null;
}

const PLAN_TITLES: Record<PricingPlanRow['key'], string> = {
  PLUS: 'NAWIRA Plus',
  BABY: 'Projet Bébé',
};

function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Une erreur est survenue.';
  switch (err.code) {
    case 'PLAN_NOT_FOUND':
      return 'Plan tarifaire introuvable.';
    case 'VALIDATION_FAILED':
      return 'Prix invalide.';
    default:
      return err.message;
  }
}

export default function AdminPricingPage(): React.JSX.Element {
  const admin = useAdmin();
  const { toast } = useToast();
  const canWrite = admin.can.includes('pricing:write');

  const [plans, setPlans] = useState<PricingPlanRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<{ plans: PricingPlanRow[] }>('/api/admin/pricing-plans');
    setPlans(res.plans);
    setDrafts(Object.fromEntries(res.plans.map((p) => [p.key, String(p.priceFcfa)])));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(key: PricingPlanRow['key']): Promise<void> {
    const priceFcfa = Number.parseInt(drafts[key] ?? '', 10);
    if (!Number.isFinite(priceFcfa) || priceFcfa < 0) {
      toast('Prix invalide.', 'error');
      return;
    }
    setBusyKey(key);
    try {
      const res = await api<{ plan: PricingPlanRow }>(`/api/admin/pricing-plans/${key}`, {
        method: 'PATCH',
        body: { priceFcfa },
      });
      setPlans((prev) => (prev ? prev.map((p) => (p.key === key ? res.plan : p)) : prev));
      toast('Prix mis à jour.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy">Tarifs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Prix FCFA des plans NAWIRA Plus et Projet Bébé.
        </p>
      </div>

      {plans === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {plans.map((plan) => (
            <div key={plan.key} className="rounded-xl border border-border bg-white p-5">
              <h2 className="text-base font-bold text-navy">{PLAN_TITLES[plan.key]}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Modifié le {new Date(plan.updatedAt).toLocaleDateString('fr-FR')}
                {plan.updatedBy ? ` par ${plan.updatedBy}` : ''}
              </p>

              {canWrite ? (
                <div className="mt-4 flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={1_000_000}
                    value={drafts[plan.key] ?? ''}
                    disabled={busyKey === plan.key}
                    onChange={(e) => setDrafts((d) => ({ ...d, [plan.key]: e.target.value }))}
                    className="w-32 rounded-lg border border-border px-3 py-2 text-sm text-navy outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <span className="text-sm text-muted-foreground">FCFA</span>
                  <button
                    type="button"
                    disabled={busyKey === plan.key}
                    onClick={() => void save(plan.key)}
                    className="ml-auto rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Enregistrer
                  </button>
                </div>
              ) : (
                <p className="mt-4 text-2xl font-bold text-navy">
                  {new Intl.NumberFormat('fr-FR').format(plan.priceFcfa)} FCFA
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Start `pnpm dev`, sign in as SUPERADMIN, open `/admin/pricing` from the new nav entry: confirm shimmer skeleton on load, both cards render with current prices, editing + saving PLUS's price persists (reload confirms new value + updated `updatedAt`/email). Sign in as a plain ADMIN test account: confirm both cards render read-only (no input/button).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/admin-nav.ts frontend/src/app/admin/pricing/
git commit -m "feat(admin): add /admin/pricing page (view + edit PLUS/BABY price)"
```

---

### Task 10: `plan-expiration` cron

**Files:**
- Create: `frontend/src/app/api/cron/plan-expiration/route.ts`
- Create: `frontend/src/app/api/cron/plan-expiration/route.test.ts`
- Modify: `frontend/vercel.json`
- Modify: `frontend/src/lib/server/observability/vercel-json-shape.test.ts`

**Interfaces:**
- Consumes: `verifyCronSecret`, `withLease`, `prisma.profile`, `logAccountActivity` (`'PLAN_EXPIRED'` from Task 2).
- Produces: nothing consumed by a later task — terminal background job for this plan.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/cron/plan-expiration/route.test.ts`. This project has two coexisting test-mocking conventions for cron routes — the sibling `verification-cleanup/route.test.ts` mocks `@/lib/server/prisma` directly with a bare object, while the admin routes (Tasks 3-5, 7 above) use the shared `prismaMock` from `@/test-utils/prisma-mock`. Use the `prismaMock` convention here, since this route's assertions (`prismaMock.profile.findMany`/`.update`) match that pattern directly:

```ts
// CRON — POST /api/cron/plan-expiration. Downgrades expired non-FREE
// profiles back to FREE, clears planExpiresAt, writes a PLAN_EXPIRED
// AccountActivity row per downgraded user. Mirrors verification-cleanup's
// verifyCronSecret + withLease shape.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/cron/auth', () => ({
  verifyCronSecret: vi.fn(),
}));
vi.mock('@/lib/server/leader-lease', () => ({
  withLease: vi.fn(async (_redis: unknown, _name: string, _ttl: number, fn: () => Promise<void>) => {
    await fn();
  }),
}));
vi.mock('@/lib/server/account/activity', () => ({
  logAccountActivity: vi.fn(),
}));

import { verifyCronSecret } from '@/lib/server/cron/auth';
import { logAccountActivity } from '@/lib/server/account/activity';
import { POST } from './route';

const mockVerifyCronSecret = vi.mocked(verifyCronSecret);
const mockLogAccountActivity = vi.mocked(logAccountActivity);

function makePost(): NextRequest {
  return new NextRequest('http://test/api/cron/plan-expiration', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCronSecret.mockReturnValue(null);
});

describe('POST /api/cron/plan-expiration', () => {
  it('returns the auth failure response when verifyCronSecret rejects', async () => {
    mockVerifyCronSecret.mockReturnValueOnce(NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }));
    const res = await POST(makePost());
    expect(res.status).toBe(401);
  });

  it('downgrades expired non-FREE profiles to FREE and clears planExpiresAt', async () => {
    prismaMock.profile.findMany.mockResolvedValueOnce([
      { userId: 'u1', plan: 'PLUS' },
      { userId: 'u2', plan: 'BABY' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    const res = await POST(makePost());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; processed: number };
    expect(body.processed).toBe(2);

    expect(prismaMock.profile.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { plan: 'FREE', planExpiresAt: null },
    });
    expect(prismaMock.profile.update).toHaveBeenCalledWith({
      where: { userId: 'u2' },
      data: { plan: 'FREE', planExpiresAt: null },
    });
    expect(mockLogAccountActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'u1', type: 'PLAN_EXPIRED', metadata: { from: 'PLUS' } }),
    );
    expect(mockLogAccountActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'u2', type: 'PLAN_EXPIRED', metadata: { from: 'BABY' } }),
    );
  });

  it('queries only planExpiresAt < now and plan != FREE', async () => {
    prismaMock.profile.findMany.mockResolvedValueOnce([]);
    await POST(makePost());
    expect(prismaMock.profile.findMany).toHaveBeenCalledWith({
      where: { planExpiresAt: { lt: expect.any(Date) }, plan: { not: 'FREE' } },
      select: { userId: true, plan: true },
    });
  });

  it('processes 0 when nothing is expired', async () => {
    prismaMock.profile.findMany.mockResolvedValueOnce([]);
    const res = await POST(makePost());
    const body = (await res.json()) as { processed: number };
    expect(body.processed).toBe(0);
    expect(prismaMock.profile.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/cron/plan-expiration/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement**

Create `frontend/src/app/api/cron/plan-expiration/route.ts` (this is the spec's §5 code, unchanged):

```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { logAccountActivity } from '@/lib/server/account/activity';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();
const LEASE_TTL_MS = 60_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let processed = 0;

    await withLease(redis ?? undefined, 'plan-expiration', LEASE_TTL_MS, async () => {
      const expired = await prisma.profile.findMany({
        where: { planExpiresAt: { lt: new Date() }, plan: { not: 'FREE' } },
        select: { userId: true, plan: true },
      });

      for (const p of expired) {
        await prisma.profile.update({
          where: { userId: p.userId },
          data: { plan: 'FREE', planExpiresAt: null },
        });
        await logAccountActivity(prisma, {
          userId: p.userId,
          type: 'PLAN_EXPIRED',
          metadata: { from: p.plan },
        });
      }

      processed = expired.length;
      log.info('plan-expiration tick', { processed, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, processed },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/cron/plan-expiration/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Register the cron in `vercel.json`**

In `frontend/vercel.json`, add the 8th entry (keep the existing 7 as-is):

```json
{
  "crons": [
    { "path": "/api/cron/outbox-drain", "schedule": "*/1 * * * *" },
    { "path": "/api/cron/email-queue-drain", "schedule": "*/1 * * * *" },
    { "path": "/api/cron/verification-cleanup", "schedule": "0 * * * *" },
    { "path": "/api/cron/order-expiration", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/webhook-log-purge", "schedule": "0 0 * * *" },
    { "path": "/api/cron/email-job-purge", "schedule": "0 0 * * *" },
    { "path": "/api/cron/notification-triggers", "schedule": "0 18 * * *" },
    { "path": "/api/cron/plan-expiration", "schedule": "0 * * * *" }
  ]
}
```

- [ ] **Step 6: Update the tripwire test**

In `frontend/src/lib/server/observability/vercel-json-shape.test.ts`:

Change `'declares exactly 7 cron schedules'` (line 37) to:

```ts
  it('declares exactly 8 cron schedules', () => {
    if (!existsSync(VERCEL_JSON)) return; // skip silently when RED-by-design
    const cfg = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as VercelConfig;
    expect(cfg.crons).toBeDefined();
    expect(cfg.crons!.length).toBe(8);
  });
```

Change the exact-list test (`'declares schedules for the 7 canonical crons...'`, line 67) to:

```ts
  it('declares schedules for the 8 canonical crons (Phase 5 + post-audit + Phase 8 + admin premium)', () => {
    if (!existsSync(VERCEL_JSON)) return;
    const cfg = JSON.parse(readFileSync(VERCEL_JSON, 'utf8')) as VercelConfig;
    const paths = (cfg.crons ?? []).map((c) => c.path).sort();
    expect(paths).toEqual([
      '/api/cron/email-job-purge',
      '/api/cron/email-queue-drain',
      '/api/cron/notification-triggers',
      '/api/cron/order-expiration',
      '/api/cron/outbox-drain',
      '/api/cron/plan-expiration',
      '/api/cron/verification-cleanup',
      '/api/cron/webhook-log-purge',
    ]);
  });
```

Also update the file's header comment (lines 3-6) count from 7 to 8, and its inline gloss to mention the new cron:

```ts
// Tripwire: verifies vercel.json declares all 8 cron schedules with valid
// cron-format strings and paths that correspond to actual route.ts files.
// (5 Phase-5 canonical + 1 post-audit email-job-purge + 1 Phase-8
// notification-triggers + 1 admin premium-management plan-expiration.)
```

- [ ] **Step 7: Run to verify the tripwire passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/observability/vercel-json-shape.test.ts`
Expected: PASS.

- [ ] **Step 8: Full test suite + typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/api/cron/plan-expiration/ frontend/vercel.json frontend/src/lib/server/observability/vercel-json-shape.test.ts
git commit -m "feat(admin): add hourly plan-expiration cron, register in vercel.json"
```

---

### Task 11: Wire `/app/billing` to real pricing

**Files:**
- Modify: `frontend/src/components/billing/PremiumPlansGrid.tsx`
- Modify: `frontend/src/app/app/billing/page.tsx`

**Interfaces:**
- Consumes: `GET /api/pricing` (Task 5).
- Produces: nothing consumed by a later task — this is the last task in the plan.

`plans-data.ts`'s `BILLING_PLANS.priceFcfa` values (1000/2500) stay as the fallback/initial-render default so the page never flashes a `0 FCFA` price while the fetch is in flight — this task only makes `PremiumPlansGrid` prefer a live-fetched price when available. `plans-data.ts` itself is NOT modified (name/promise/features stay static per spec §0).

- [ ] **Step 1: Add a `prices` prop to `PremiumPlansGrid`**

In `frontend/src/components/billing/PremiumPlansGrid.tsx`, change the props interface and the render to prefer the live price:

```tsx
interface PremiumPlansGridProps {
  currentPlan: BillingPlan['key'];
  prices: Partial<Record<'PLUS' | 'BABY', number>>;
}

export function PremiumPlansGrid({ currentPlan, prices }: PremiumPlansGridProps): React.JSX.Element {
```

Inside the `.map`, change the price line:

```tsx
            <div className="mb-4 border-b border-border pb-4">
              <div className="flex items-baseline">
                <span className="text-2xl font-bold text-navy">
                  {formatFcfa(
                    plan.key === 'FREE' ? 0 : (prices[plan.key] ?? plan.priceFcfa),
                  )}
                </span>
                {plan.key !== 'FREE' && (
                  <span className="ml-1 text-xs text-muted-foreground">/mois</span>
                )}
              </div>
            </div>
```

(This replaces the prior `plan.priceFcfa > 0` check — `plan.key === 'FREE'` is equivalent and reads more directly now that the number itself may not be the static constant.)

- [ ] **Step 2: Fetch `/api/pricing` in the billing page**

In `frontend/src/app/app/billing/page.tsx`, add the prices state and fetch, then pass it down:

```tsx
interface ProfileResponse {
  profile: { plan: BillingPlan['key'] };
}

interface PricingResponse {
  plans: Array<{ key: 'PLUS' | 'BABY'; priceFcfa: number }>;
}

export default function BillingPage(): React.JSX.Element | null {
  const user = useUser();
  const [plan, setPlan] = useState<BillingPlan['key'] | null>(null);
  const [prices, setPrices] = useState<Partial<Record<'PLUS' | 'BABY', number>>>({});
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [profileRes, pricingRes] = await Promise.all([
        api<ProfileResponse>('/api/profile'),
        api<PricingResponse>('/api/pricing'),
      ]);
      setPlan(profileRes.profile.plan);
      setPrices(Object.fromEntries(pricingRes.plans.map((p) => [p.key, p.priceFcfa])));
      track('paywall_viewed', { paywall_id: 'billing_page', plan: 'PLUS' });
    } catch {
      setError(true);
    }
  }, []);
```

Then update the `PremiumPlansGrid` usage:

```tsx
      <div className="animate-fade-in-up mb-8" style={staggerDelay(1)}>
        <PremiumPlansGrid currentPlan={plan} prices={prices} />
      </div>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Start `pnpm dev`, go to `/admin/pricing` as SUPERADMIN and change PLUS's price to e.g. 1500. Open `/app/billing` as any signed-in user: confirm the Plus card shows 1500 FCFA (not the hardcoded 1000). Revert the price back to 1000 to leave the dev DB in its seeded state.

- [ ] **Step 5: Full test suite**

Run: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`
Expected: all green — this is the plan's final task, so this is also the final pre-merge gate per CLAUDE.md's "Before committing" rule.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/billing/PremiumPlansGrid.tsx frontend/src/app/app/billing/page.tsx
git commit -m "feat: wire /app/billing to real admin-editable pricing via GET /api/pricing"
```
