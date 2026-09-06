# Phase 2 — NAWIRA Onboarding (OB01-11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 11-screen onboarding flow (birth-date gate, goal, cycle
history, concerns, consent, notifications, ready) that creates a user's
`Profile` and `Consent` rows, and wire session routing so a verified user
without a `Profile` lands on `/onboarding/welcome` instead of `/app/today`.

**Architecture:** Client-side-only state (`sessionStorage`, via a small
`useOnboardingDraft()` hook) accumulates answers across 8 unauthenticated-of-
consequence screens; nothing reaches the server until the user hits
"Accepter" on the consent screen, which fires one atomic
`POST /api/onboarding/complete` creating `Profile` + `Consent[]` (+ an
optional `PeriodEvent`) in a single transaction. A second small screen
(`PATCH /api/profile`) records the notification-level preference. Three
existing auth routes (`login`, `verify-email`, `me`) gain a `hasProfile`
field so the frontend can route returning/new users correctly.

**Tech Stack:** Next.js 16 App Router (Route Handlers + client pages),
Prisma 5 + Neon Postgres, Zod, Vitest + `vitest-mock-extended` Prisma
mocking, Tailwind v4, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-09-06-phase2-onboarding-design.md`
(references Phase 1's data model spec at
`docs/superpowers/specs/2026-09-06-phase1-data-model-design.md`)

## Global Constraints

- **No native Prisma `enum` blocks exist anywhere in this schema.** Every
  enum-like field is a `String` column with `@default(...)` and an inline
  `// VALUE_A | VALUE_B` comment, validated at the Zod/route layer. Follow
  this exactly for `Profile.notificationLevel`.
- **Migration folders use plain sequence numbers**, not Prisma's default
  timestamp prefix (`0_init`, `1_oauth_accounts`, ...,
  `6_nawira_phase1_fixes`). The next one is `7_nawira_notification_level`.
  Procedure: `prisma migrate dev --create-only --name <name>`, then rename
  the generated timestamp-prefixed folder to the plain sequence number,
  then apply with `pnpm db:migrate:dev`.
- **Client-state-until-consent**: OB02-OB08's answers live in
  `sessionStorage` only (via `useOnboardingDraft()`), never sent to the
  server, until `POST /api/onboarding/complete` fires at the consent
  screen. This is a legal-sequencing requirement (PRD §12), not an
  implementation convenience — do not add any intermediate server calls
  for OB03-OB08.
- **Every Route Handler MUST `export const runtime = 'nodejs'`.**
- **Mutating routes**: call `verifyCsrf(req)` (imported from
  `@/lib/server/auth`, synchronous, returns `NextResponse | null`) before
  `requireAuth`, matching the order in
  `frontend/src/app/api/auth/set-password/route.ts`.
- **Frontend switches on `ApiError.code`, never on `.message`** — every
  new/changed error surface in a page component must map codes to French
  strings via a `Record<string,string>`, matching the pattern already in
  `frontend/src/app/login/page.tsx`.
- **All UI copy is French.** No English strings in JSX.
- **44px minimum touch target** (WCAG 2.5.5 / Apple HIG) on every
  interactive element — chips and toggles use `py-3` (not `py-2.5`),
  matching the fix already applied to `Button`/`Field` in
  `frontend/src/components/ui/`.
- **No inline `style` except where a Tailwind utility class cannot express
  a dynamically computed value** (e.g. a progress-bar's percentage width).
- Design tokens (`frontend/src/app/globals.css`): `--color-primary
  #6c43c1`, `--color-primary-soft #eee7fa`, `--color-navy #1f2937`,
  `--color-muted-foreground #6b7280`, `--color-border #e5e7eb`,
  `--color-green #4f9d78` / `--color-green-soft #e2f3ea`, `--color-rose
  #d968a6` / `--color-rose-soft #f9e4ef`. Use the matching Tailwind tokens
  (`text-primary`, `bg-primary-soft`, etc.) — never hard-coded hex values.
- Prisma mocking in tests follows the established pattern: import
  `prismaMock` from `@/test-utils/prisma-mock` first (so `vi.mock`
  auto-hoists), and for routes with a `$transaction` callback, install
  `prismaMock.$transaction.mockImplementation(...)` in `beforeEach` so the
  callback receives `prismaMock` as `tx`.
- This repo has **no component tests for pages** (`signup`, `login`,
  `verify-email` have none) — per the spec's own Testing section, new
  onboarding pages get manual browser verification at 375/768/1280px, not
  new test infra. Backend routes (`POST /api/onboarding/complete`,
  `PATCH /api/profile`, and the 3 extended auth routes) DO get Vitest unit
  tests.

---

## Task 1: Schema — `Profile.notificationLevel` + migration

**Files:**
- Modify: `frontend/prisma/schema.prisma` (`Profile` model)
- Create: `frontend/prisma/migrations/7_nawira_notification_level/migration.sql`

**Interfaces:**
- Produces: `Profile.notificationLevel: string` (`"NORMAL" | "DISCREET" |
  "NONE"`, default `"NORMAL"`) — consumed by Task 4's `PATCH /api/profile`
  and Task 11's `/onboarding/notifications` page.

- [ ] **Step 1: Add the field to the schema**

In `frontend/prisma/schema.prisma`, find the `Profile` model and add
`notificationLevel` right after `temperatureUnit`:

```prisma
model Profile {
  userId            String   @id
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  birthDate         DateTime
  goal              String // PERIOD_TRACKING | UNDERSTAND_CYCLE | TRYING_TO_CONCEIVE
  usualCycleLength  Int?
  usualPeriodLength Int?
  trackedConcerns   String[] @default([])
  plan              String   @default("FREE") // FREE | PLUS | BABY
  temperatureUnit   String   @default("CELSIUS") // CELSIUS | FAHRENHEIT
  notificationLevel String   @default("NORMAL") // NORMAL | DISCREET | NONE
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

- [ ] **Step 2: Generate the migration (create-only)**

Run from the repo root:

```bash
cd frontend && pnpm exec prisma migrate dev --create-only --name nawira_notification_level
```

This creates a new folder under `frontend/prisma/migrations/` prefixed
with a timestamp (e.g. `20260906120000_nawira_notification_level`).

- [ ] **Step 3: Rename the folder to the plain-sequence convention**

```bash
cd frontend/prisma/migrations
mv 2*_nawira_notification_level 7_nawira_notification_level
```

Verify the folder now reads `7_nawira_notification_level` and contains a
`migration.sql` with:

```sql
ALTER TABLE "Profile" ADD COLUMN "notificationLevel" TEXT NOT NULL DEFAULT 'NORMAL';
```

(If Prisma generated different but equivalent SQL, leave it as generated —
only the folder name is a hand-maintained convention, not the SQL body.)

- [ ] **Step 4: Apply the migration**

```bash
pnpm db:migrate:dev
```

- [ ] **Step 5: Verify status is clean**

```bash
pnpm db:migrate:status
```

Expected: no pending migrations.

- [ ] **Step 6: Regenerate the Prisma client and typecheck**

```bash
pnpm --filter frontend exec prisma generate
pnpm typecheck
```

Expected: no errors (the new field is additive with a default, so no
existing code breaks).

- [ ] **Step 7: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/7_nawira_notification_level
git commit -m "feat(nawira): add Profile.notificationLevel (Phase 2 OB10)"
```

---

## Task 2: Shared utilities and onboarding components

**Files:**
- Create: `frontend/src/lib/age.ts`
- Create: `frontend/src/lib/age.test.ts`
- Create: `frontend/src/lib/onboarding-draft.ts`
- Create: `frontend/src/components/onboarding/OnboardingLayout.tsx`
- Create: `frontend/src/components/onboarding/OptionCard.tsx`

**Interfaces:**
- Produces: `isAdult(birthDateIso: string, minAge?: number): boolean` —
  consumed by Task 3's route and Task 7's birth-date page.
- Produces: `OnboardingDraft` interface, `useOnboardingDraft(): { draft:
  OnboardingDraft; update: (patch: Partial<OnboardingDraft>) => void }`,
  `clearOnboardingDraft(): void` — consumed by every onboarding page
  (Tasks 7-11).
- Produces: `<OnboardingLayout step={number} backHref?={string}>` and
  `<OptionCard selected title icon? description? onClick>` — consumed by
  every onboarding page (Tasks 7-11).

- [ ] **Step 1: Write the failing test for `isAdult`**

Create `frontend/src/lib/age.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isAdult } from './age';

describe('isAdult', () => {
  it('returns true for someone who turned 18 exactly today', () => {
    const now = new Date();
    const birthDate = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());
    expect(isAdult(birthDate.toISOString())).toBe(true);
  });

  it('returns false for someone who turns 18 tomorrow', () => {
    const now = new Date();
    const birthDate = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate() + 1);
    expect(isAdult(birthDate.toISOString())).toBe(false);
  });

  it('returns false for a 17-year-old', () => {
    const now = new Date();
    const birthDate = new Date(now.getFullYear() - 17, now.getMonth(), now.getDate());
    expect(isAdult(birthDate.toISOString())).toBe(false);
  });

  it('returns true for a 30-year-old', () => {
    const now = new Date();
    const birthDate = new Date(now.getFullYear() - 30, now.getMonth(), now.getDate());
    expect(isAdult(birthDate.toISOString())).toBe(true);
  });

  it('returns false for an invalid date string', () => {
    expect(isAdult('not-a-date')).toBe(false);
  });

  it('honors a custom minAge', () => {
    const now = new Date();
    const birthDate = new Date(now.getFullYear() - 21, now.getMonth(), now.getDate());
    expect(isAdult(birthDate.toISOString(), 21)).toBe(true);
    expect(isAdult(birthDate.toISOString(), 25)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter frontend exec vitest run src/lib/age.test.ts
```

Expected: FAIL — `./age` does not exist.

- [ ] **Step 3: Implement `isAdult`**

Create `frontend/src/lib/age.ts`:

```ts
export function isAdult(birthDateIso: string, minAge = 18): boolean {
  const birthDate = new Date(birthDateIso);
  if (Number.isNaN(birthDate.getTime())) return false;

  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age--;
  }
  return age >= minAge;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter frontend exec vitest run src/lib/age.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Create the onboarding draft hook**

Create `frontend/src/lib/onboarding-draft.ts`:

```ts
'use client';

import { useCallback, useState } from 'react';

export interface OnboardingDraft {
  birthDate: string | null;
  goal: 'PERIOD_TRACKING' | 'UNDERSTAND_CYCLE' | 'TRYING_TO_CONCEIVE' | null;
  lastPeriodDate: string | null;
  usualPeriodLength: number | null;
  usualCycleLength: number | null;
  trackedConcerns: string[];
}

const STORAGE_KEY = 'onboarding-draft';

const EMPTY_DRAFT: OnboardingDraft = {
  birthDate: null,
  goal: null,
  lastPeriodDate: null,
  usualPeriodLength: null,
  usualCycleLength: null,
  trackedConcerns: [],
};

function readDraft(): OnboardingDraft {
  if (typeof window === 'undefined') return EMPTY_DRAFT;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DRAFT;
    return { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<OnboardingDraft>) };
  } catch {
    return EMPTY_DRAFT;
  }
}

function writeDraft(draft: OnboardingDraft): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function clearOnboardingDraft(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function useOnboardingDraft(): {
  draft: OnboardingDraft;
  update: (patch: Partial<OnboardingDraft>) => void;
} {
  const [draft, setDraft] = useState<OnboardingDraft>(readDraft);

  const update = useCallback((patch: Partial<OnboardingDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      writeDraft(next);
      return next;
    });
  }, []);

  return { draft, update };
}
```

No Vitest test for this file: it is a `'use client'` hook exercising
`sessionStorage`/`useState`, and this repo has no component/hook test
infra (confirmed: no `.test.tsx` anywhere under `frontend/src/app/`).
Verified manually in Task 7-11's browser checks (draft persists across a
page refresh mid-flow).

- [ ] **Step 6: Create `OnboardingLayout`**

Create `frontend/src/components/onboarding/OnboardingLayout.tsx`:

```tsx
import Link from 'next/link';
import { type ReactNode } from 'react';

const TOTAL_STEPS = 11;

interface OnboardingLayoutProps {
  step: number;
  backHref?: string;
  children: ReactNode;
}

export function OnboardingLayout({
  step,
  backHref,
  children,
}: OnboardingLayoutProps): React.JSX.Element {
  const progress = Math.round((step / TOTAL_STEPS) * 100);

  return (
    <main className="flex min-h-screen w-full flex-col bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          {backHref ? (
            <Link
              href={backHref}
              aria-label="Retour"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-navy hover:bg-primary-soft"
            >
              &larr;
            </Link>
          ) : (
            <span className="h-11 w-11 shrink-0" />
          )}
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
            {/* Inline style is required here: the width is a computed
                percentage that Tailwind's static class scanning cannot
                express (see Global Constraints — no inline style except
                for genuinely dynamic values). */}
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Create `OptionCard`**

Create `frontend/src/components/onboarding/OptionCard.tsx`:

```tsx
import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface OptionCardProps {
  selected: boolean;
  onClick: () => void;
  icon?: ReactNode;
  title: string;
  description?: string;
}

export function OptionCard({
  selected,
  onClick,
  icon,
  title,
  description,
}: OptionCardProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors',
        selected ? 'border-primary bg-primary-soft' : 'border-border bg-white hover:bg-gray-50',
      )}
    >
      {icon && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
          {icon}
        </span>
      )}
      <span className="flex flex-col">
        <span className="font-medium text-navy">{title}</span>
        {description && <span className="text-sm text-muted-foreground">{description}</span>}
      </span>
    </button>
  );
}
```

- [ ] **Step 8: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/age.ts frontend/src/lib/age.test.ts \
  frontend/src/lib/onboarding-draft.ts frontend/src/components/onboarding/
git commit -m "feat(nawira): onboarding shared utilities (age gate, draft hook, layout, option card)"
```

---

## Task 3: `POST /api/onboarding/complete`

**Files:**
- Create: `frontend/src/app/api/onboarding/complete/route.ts`
- Create: `frontend/src/app/api/onboarding/complete/route.test.ts`

**Interfaces:**
- Consumes: `isAdult` from `@/lib/age` (Task 2), `zPositiveInt` from
  `@/lib/server/zod-helpers`, `verifyCsrf` from `@/lib/server/auth`,
  `requireAuth` from `@/lib/server/middleware`.
- Produces: `POST /api/onboarding/complete` — 200 `{ ok: true }` on
  success; consumed by Task 10's consent page.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/onboarding/complete/route.test.ts`:

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
import { POST } from './route';

const VALID_BODY = {
  birthDate: '2000-01-01',
  goal: 'PERIOD_TRACKING',
  lastPeriodDate: null,
  usualPeriodLength: null,
  usualCycleLength: null,
  trackedConcerns: [],
  consents: {
    ACCOUNT: true,
    HEALTH_DATA: true,
    ASSISTANT_HISTORY: false,
    ANALYTICS: false,
    MARKETING: false,
  },
};

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/onboarding/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
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
});

describe('POST /api/onboarding/complete', () => {
  it('creates a Profile and the granted Consent rows on success', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);
    prismaMock.profile.create.mockResolvedValue({} as never);
    prismaMock.consent.create.mockResolvedValue({} as never);

    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(prismaMock.profile.create).toHaveBeenCalledTimes(1);
    const profileArg = prismaMock.profile.create.mock.calls[0]?.[0];
    expect(profileArg?.data?.userId).toBe('u1');
    expect(profileArg?.data?.goal).toBe('PERIOD_TRACKING');

    expect(prismaMock.consent.create).toHaveBeenCalledTimes(2);
    const types = prismaMock.consent.create.mock.calls.map((c) => c[0]?.data?.type).sort();
    expect(types).toEqual(['ACCOUNT', 'HEALTH_DATA']);

    expect(prismaMock.periodEvent.create).not.toHaveBeenCalled();
  });

  it('creates a PeriodEvent when lastPeriodDate is provided', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);
    prismaMock.profile.create.mockResolvedValue({} as never);
    prismaMock.consent.create.mockResolvedValue({} as never);
    prismaMock.periodEvent.create.mockResolvedValue({} as never);

    const res = await POST(makeReq({ ...VALID_BODY, lastPeriodDate: '2026-08-01' }));
    expect(res.status).toBe(200);

    expect(prismaMock.periodEvent.create).toHaveBeenCalledTimes(1);
    const arg = prismaMock.periodEvent.create.mock.calls[0]?.[0];
    expect(arg?.data?.flow).toBe('MEDIUM');
    expect(arg?.data?.userId).toBe('u1');
  });

  it('rejects a second onboarding submission with PROFILE_ALREADY_EXISTS', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({ userId: 'u1' } as never);

    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('PROFILE_ALREADY_EXISTS');
    expect(prismaMock.profile.create).not.toHaveBeenCalled();
  });

  it('rejects an under-18 birthDate with UNDER_MINIMUM_AGE', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);
    const now = new Date();
    const under18 = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate())
      .toISOString()
      .slice(0, 10);

    const res = await POST(makeReq({ ...VALID_BODY, birthDate: under18 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('UNDER_MINIMUM_AGE');
    expect(prismaMock.profile.create).not.toHaveBeenCalled();
  });

  it('rejects when a required consent is false even if the client claims otherwise', async () => {
    const res = await POST(
      makeReq({ ...VALID_BODY, consents: { ...VALID_BODY.consents, HEALTH_DATA: false } }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.profile.findUnique).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('returns 403 when the CSRF check fails', async () => {
    vi.mocked(verifyCsrf).mockReturnValue(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }) as never,
    );
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter frontend exec vitest run src/app/api/onboarding/complete/route.test.ts
```

Expected: FAIL — `./route` does not exist.

- [ ] **Step 3: Implement the route**

Create `frontend/src/app/api/onboarding/complete/route.ts`:

```ts
// POST /api/onboarding/complete — Phase 2.
//
// One-time onboarding submission: creates the caller's Profile row and one
// Consent row per granted consent type, plus an optional PeriodEvent when
// the user supplied a last-known period date (OB04). All in one Prisma
// transaction so a partial failure never leaves an inconsistent state.
//
// Consent-before-storage (PRD §12): this route is deliberately the FIRST
// point any onboarding answer reaches the server — everything before it
// (OB03-OB08's answers) lives in client-side sessionStorage only.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { zPositiveInt } from '@/lib/server/zod-helpers';
import { isAdult } from '@/lib/age';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const CONSENT_VERSION = 1;

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');

const Body = z.object({
  birthDate: isoDate,
  goal: z.enum(['PERIOD_TRACKING', 'UNDERSTAND_CYCLE', 'TRYING_TO_CONCEIVE']),
  lastPeriodDate: isoDate.nullable(),
  usualPeriodLength: zPositiveInt.nullable(),
  usualCycleLength: zPositiveInt.nullable(),
  trackedConcerns: z.array(z.string()),
  consents: z.object({
    ACCOUNT: z.literal(true),
    HEALTH_DATA: z.literal(true),
    ASSISTANT_HISTORY: z.boolean(),
    ANALYTICS: z.boolean(),
    MARKETING: z.boolean(),
  }),
});

function jsonError(code: string, status: number, requestId: string, message?: string): NextResponse {
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
      const json = await req.json();
      body = Body.parse(json);
    } catch {
      return jsonError('VALIDATION_FAILED', 400, ctx.requestId, 'Invalid request body');
    }

    const existing = await prisma.profile.findUnique({
      where: { userId: auth.user.sub },
      select: { userId: true },
    });
    if (existing) {
      return jsonError(
        'PROFILE_ALREADY_EXISTS',
        400,
        ctx.requestId,
        'Onboarding was already completed.',
      );
    }

    if (!isAdult(body.birthDate)) {
      return jsonError(
        'UNDER_MINIMUM_AGE',
        400,
        ctx.requestId,
        'NAWIRA requires users to be 18 or older.',
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.profile.create({
        data: {
          userId: auth.user.sub,
          birthDate: new Date(body.birthDate),
          goal: body.goal,
          usualCycleLength: body.usualCycleLength,
          usualPeriodLength: body.usualPeriodLength,
          trackedConcerns: body.trackedConcerns,
        },
      });

      const grantedTypes = (Object.keys(body.consents) as Array<keyof typeof body.consents>).filter(
        (key) => body.consents[key],
      );
      for (const type of grantedTypes) {
        await tx.consent.create({
          data: { userId: auth.user.sub, type, version: CONSENT_VERSION },
        });
      }

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

    log.info('onboarding complete', { userId: auth.user.sub });
    return NextResponse.json({ ok: true }, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter frontend exec vitest run src/app/api/onboarding/complete/route.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/onboarding/
git commit -m "feat(nawira): POST /api/onboarding/complete (Phase 2)"
```

---

## Task 4: `PATCH /api/profile`

**Files:**
- Create: `frontend/src/app/api/profile/route.ts`
- Create: `frontend/src/app/api/profile/route.test.ts`

**Interfaces:**
- Produces: `PATCH /api/profile` — 200 `{ ok: true }` on success; consumed
  by Task 11's notifications page.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/profile/route.test.ts`:

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
import { PATCH } from './route';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/profile', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
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
});

describe('PATCH /api/profile', () => {
  it('sets notificationLevel and grants NOTIFICATIONS consent when not NONE', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({ userId: 'u1' } as never);
    prismaMock.profile.update.mockResolvedValue({} as never);
    prismaMock.consent.findFirst.mockResolvedValue(null);
    prismaMock.consent.create.mockResolvedValue({} as never);

    const res = await PATCH(makeReq({ notificationLevel: 'NORMAL' }));
    expect(res.status).toBe(200);

    expect(prismaMock.profile.update).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.profile.update.mock.calls[0]?.[0];
    expect(updateArg?.data?.notificationLevel).toBe('NORMAL');

    expect(prismaMock.consent.create).toHaveBeenCalledTimes(1);
    const consentArg = prismaMock.consent.create.mock.calls[0]?.[0];
    expect(consentArg?.data?.type).toBe('NOTIFICATIONS');
  });

  it('does not grant NOTIFICATIONS consent when level is NONE', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({ userId: 'u1' } as never);
    prismaMock.profile.update.mockResolvedValue({} as never);

    const res = await PATCH(makeReq({ notificationLevel: 'NONE' }));
    expect(res.status).toBe(200);
    expect(prismaMock.consent.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.consent.create).not.toHaveBeenCalled();
  });

  it('skips creating a duplicate NOTIFICATIONS consent if one already exists', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({ userId: 'u1' } as never);
    prismaMock.profile.update.mockResolvedValue({} as never);
    prismaMock.consent.findFirst.mockResolvedValue({ id: 'c1' } as never);

    const res = await PATCH(makeReq({ notificationLevel: 'DISCREET' }));
    expect(res.status).toBe(200);
    expect(prismaMock.consent.create).not.toHaveBeenCalled();
  });

  it('returns 404 PROFILE_NOT_FOUND when no Profile exists yet', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);

    const res = await PATCH(makeReq({ notificationLevel: 'NORMAL' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('PROFILE_NOT_FOUND');
    expect(prismaMock.profile.update).not.toHaveBeenCalled();
  });

  it('returns VALIDATION_FAILED for an invalid notificationLevel', async () => {
    const res = await PATCH(makeReq({ notificationLevel: 'LOUD' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('returns 403 when the CSRF check fails', async () => {
    vi.mocked(verifyCsrf).mockReturnValue(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }) as never,
    );
    const res = await PATCH(makeReq({ notificationLevel: 'NORMAL' }));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter frontend exec vitest run src/app/api/profile/route.test.ts
```

Expected: FAIL — `./route` does not exist.

- [ ] **Step 3: Implement the route**

Create `frontend/src/app/api/profile/route.ts`:

```ts
// PATCH /api/profile — Phase 2 OB10 (notification level).
//
// Minimal profile-update endpoint: sets Profile.notificationLevel and, if
// the chosen level isn't NONE, grants the PRD's C04 NOTIFICATIONS consent
// (idempotently — skips if one is already granted). There is no path back
// to NONE within this one-time onboarding flow, so revocation is out of
// scope here, not silently skipped.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const CONSENT_VERSION = 1;

const Body = z.object({
  notificationLevel: z.enum(['NORMAL', 'DISCREET', 'NONE']),
});

function jsonError(code: string, status: number, requestId: string, message?: string): NextResponse {
  const res = NextResponse.json({ error: code, ...(message ? { message } : {}) }, { status });
  res.headers.set('x-request-id', requestId);
  return res;
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
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
      const json = await req.json();
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

    await prisma.$transaction(async (tx) => {
      await tx.profile.update({
        where: { userId: auth.user.sub },
        data: { notificationLevel: body.notificationLevel },
      });

      if (body.notificationLevel !== 'NONE') {
        const existingConsent = await tx.consent.findFirst({
          where: { userId: auth.user.sub, type: 'NOTIFICATIONS', revokedAt: null },
          select: { id: true },
        });
        if (!existingConsent) {
          await tx.consent.create({
            data: { userId: auth.user.sub, type: 'NOTIFICATIONS', version: CONSENT_VERSION },
          });
        }
      }
    });

    log.info('profile updated', { userId: auth.user.sub, notificationLevel: body.notificationLevel });
    return NextResponse.json({ ok: true }, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter frontend exec vitest run src/app/api/profile/route.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/profile/
git commit -m "feat(nawira): PATCH /api/profile (Phase 2 OB10 notification level)"
```

---

## Task 5: Extend `me`, `login`, `verify-email` with `hasProfile`

**Files:**
- Modify: `frontend/src/app/api/auth/me/route.ts`
- Modify: `frontend/src/app/api/auth/me/route.test.ts`
- Modify: `frontend/src/app/api/auth/login/route.ts`
- Modify: `frontend/src/app/api/auth/login/route.test.ts`
- Modify: `frontend/src/app/api/auth/verify-email/route.ts`
- Modify: `frontend/src/app/api/auth/verify-email/route.test.ts`

**Interfaces:**
- Produces: `hasProfile: boolean` on the `user` object returned by all
  three routes — consumed by Task 6's `AuthContext`/redirect wiring.

- [ ] **Step 1: Extend `me/route.ts`'s select and response**

In `frontend/src/app/api/auth/me/route.ts`, find the `dbUser` query and
add `profile` to the `select`:

```ts
    const dbUser = await prisma.user.findUnique({
      where: { id: auth.user.sub },
      select: {
        id: true,
        email: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        passwordHash: true,
        oauthAccounts: { select: { provider: true } },
        profile: { select: { userId: true } },
      },
    });
```

Then in the `user` object built below it, add `hasProfile` right after
`linkedProviders`:

```ts
      hasPassword: !!dbUser?.passwordHash,
      linkedProviders: (dbUser?.oauthAccounts ?? []).map((a) => a.provider),
      hasProfile: !!dbUser?.profile,
    };
```

- [ ] **Step 2: Update `me/route.test.ts`'s Test 1 assertion**

In `frontend/src/app/api/auth/me/route.test.ts`, Test 1's `expect(...)`
block currently reads:

```ts
    expect(await res.json()).toMatchObject({
      user: { sub: 'u1', email: 'a@b.com' },
    });
```

Change it to also assert `hasProfile` explicitly:

```ts
    expect(await res.json()).toMatchObject({
      user: { sub: 'u1', email: 'a@b.com', hasProfile: false },
    });
```

Then add a new test case at the end of the `describe` block (before the
closing `});`):

```ts

  it('Test 5: hasProfile is true when a Profile row exists', async () => {
    vi.mocked(verifyToken).mockResolvedValue({
      sub: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
      profile: { userId: 'u1' },
    } as never);

    const res = await GET(makeReq({ bearer: 'valid-access-token' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      user: { sub: 'u1', hasProfile: true },
    });
  });
```

- [ ] **Step 3: Run the `me` tests**

```bash
pnpm --filter frontend exec vitest run src/app/api/auth/me/route.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 4: Extend `login/route.ts`'s select and response**

In `frontend/src/app/api/auth/login/route.ts`, find the user lookup (step
4) and add `profile`:

```ts
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        emailVerifiedAt: true,
        tokenVersion: true,
        status: true,
        profile: { select: { userId: true } },
      },
    });
```

Then find the final success response (step 8) and add `hasProfile`:

```ts
    return NextResponse.json(
      { ok: true, user: { sub: user.id, email: user.email, hasProfile: !!user.profile } },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
```

- [ ] **Step 5: Update `login/route.test.ts`**

In `frontend/src/app/api/auth/login/route.test.ts`, Test 1's mock object
(lines defining the happy-path `prismaMock.user.findUnique.mockResolvedValue`)
currently doesn't include `profile`. Add it for clarity and add an explicit
`hasProfile` assertion:

```ts
  it('Test 1: happy path — issues 3 cookies and returns user', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      passwordHash: '$2a$12$hashhashhashhashhashhashhashhashhashhashhashhashhashhha',
      emailVerifiedAt: new Date(),
      tokenVersion: 0,
      profile: null,
    } as never);
    vi.mocked(verifyPassword).mockResolvedValue(true);

    const res = await POST(makeReq({ email: 'a@b.com', password: 'longenough' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, user: { sub: 'u1', email: 'a@b.com', hasProfile: false } });
    expect(recordSuccess).toHaveBeenCalledWith('a@b.com');
    expect(__cookieStore.has('app-token')).toBe(true);
    expect(__cookieStore.has('app-refresh')).toBe(true);
    expect(__cookieStore.has('app-csrf')).toBe(true);
  });
```

Then add a new test case right after Test 1 (before Test 2):

```ts

  it('Test 1b: hasProfile is true when a Profile row exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      passwordHash: '$2a$12$hashhashhashhashhashhashhashhashhashhashhashhashhashhha',
      emailVerifiedAt: new Date(),
      tokenVersion: 0,
      profile: { userId: 'u1' },
    } as never);
    vi.mocked(verifyPassword).mockResolvedValue(true);

    const res = await POST(makeReq({ email: 'a@b.com', password: 'longenough' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.hasProfile).toBe(true);
  });
```

- [ ] **Step 6: Run the `login` tests**

```bash
pnpm --filter frontend exec vitest run src/app/api/auth/login/route.test.ts
```

Expected: PASS (11 tests).

- [ ] **Step 7: Extend `verify-email/route.ts`'s select and response**

In `frontend/src/app/api/auth/verify-email/route.ts`, find the user
lookup and add `profile`:

```ts
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, tokenVersion: true, profile: { select: { userId: true } } },
    });
```

Then find the success response near the end and add `hasProfile`:

```ts
    const res = NextResponse.json({
      ok: true,
      user: { sub: user.id, email: user.email, hasProfile: !!user.profile },
    });
```

- [ ] **Step 8: Fix the breaking assertion in `verify-email/route.test.ts`**

The happy-path test uses `toEqual` (strict — no extra properties
allowed), so it WILL break once `hasProfile` is added to the response.
Find:

```ts
    expect(body.ok).toBe(true);
    expect(body.user).toEqual({ sub: 'u1', email: 'a@b.com' });
```

Replace with:

```ts
    expect(body.ok).toBe(true);
    expect(body.user).toEqual({ sub: 'u1', email: 'a@b.com', hasProfile: false });
```

Also update that same test's mock (for clarity, not strictly required
since `toEqual` above already pins the expectation) to include
`profile: null`:

```ts
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
      profile: null,
    } as never);
```

Then add a new test case at the end of the `describe` block, right before
the `"source contains runtime='nodejs'..."` test:

```ts

  it('hasProfile is true when a Profile row exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      tokenVersion: 0,
      profile: { userId: 'u1' },
    } as never);
    prismaMock.verificationCode.findFirst.mockResolvedValue({
      id: 'vc1',
      code: VALID_CODE,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    prismaMock.verificationCode.updateMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST(makeReq({ email: 'a@b.com', code: VALID_CODE }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.hasProfile).toBe(true);
  });
```

- [ ] **Step 9: Run the `verify-email` tests**

```bash
pnpm --filter frontend exec vitest run src/app/api/auth/verify-email/route.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 10: Full test suite, typecheck, lint**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

Expected: all green (this confirms nothing else in the suite depended on
the old 2-field `user` shape).

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/api/auth/me/route.ts frontend/src/app/api/auth/me/route.test.ts \
  frontend/src/app/api/auth/login/route.ts frontend/src/app/api/auth/login/route.test.ts \
  frontend/src/app/api/auth/verify-email/route.ts frontend/src/app/api/auth/verify-email/route.test.ts
git commit -m "feat(nawira): add hasProfile to me/login/verify-email responses"
```

---

## Task 6: Wire `AuthContext` + login/verify-email redirects

**Files:**
- Modify: `frontend/src/contexts/AuthContext.tsx`
- Modify: `frontend/src/app/login/page.tsx`
- Modify: `frontend/src/app/verify-email/page.tsx`

**Interfaces:**
- Consumes: `hasProfile: boolean` from Task 5's routes.
- Produces: `User.hasProfile: boolean` on the `AuthContext` — available to
  any future page that needs to branch on onboarding completion.

No test changes: this repo has no component tests for these pages
(confirmed by Explore during the audit — none of `signup`/`login`/
`verify-email` has a `.test.tsx`). Verify manually in Step 4 below.

- [ ] **Step 1: Add `hasProfile` to the `User` interface**

In `frontend/src/contexts/AuthContext.tsx`, find the `User` interface and
add the field after `linkedProviders`:

```ts
export interface User {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** false when the account was created via OAuth and never set a password. */
  hasPassword: boolean;
  /** Provider names already linked, e.g. ['google']. Empty for pure email/password accounts. */
  linkedProviders: string[];
  /** false until the user has completed onboarding (Phase 2) and has a Profile row. */
  hasProfile: boolean;
}
```

- [ ] **Step 2: Wire the login redirect**

In `frontend/src/app/login/page.tsx`, find:

```ts
      const res = await api<{ csrfToken?: string }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      // /app/today n'existe pas encore (roadmap Phase 3 — moteur de cycle) ;
      // c'est la destination cible per PRD §28.2.
      router.push('/app/today');
```

Replace with:

```ts
      const res = await api<{ csrfToken?: string; user?: { hasProfile: boolean } }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: { email, password },
        },
      );
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      // /app/today n'existe pas encore (roadmap Phase 3 — moteur de cycle) ;
      // c'est la destination cible per PRD §28.2. Un compte sans Profile
      // (onboarding jamais terminé) est redirigé vers l'onboarding à la place.
      router.push(res.user?.hasProfile ? '/app/today' : '/onboarding/welcome');
```

- [ ] **Step 3: Wire the verify-email redirect**

In `frontend/src/app/verify-email/page.tsx`, find:

```ts
      const res = await api<{ csrfToken?: string }>('/api/auth/verify-email', {
        method: 'POST',
        body: { email: emailValue, code: codeValue },
      });
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      router.push('/app/today');
```

Replace with:

```ts
      const res = await api<{ csrfToken?: string; user?: { hasProfile: boolean } }>(
        '/api/auth/verify-email',
        {
          method: 'POST',
          body: { email: emailValue, code: codeValue },
        },
      );
      if (res.csrfToken) storeCsrfToken(res.csrfToken);
      await refresh();
      // Un compte tout juste vérifié n'a jamais de Profile — mais on relit
      // hasProfile depuis la réponse plutôt que de supposer false, au cas où
      // un flux futur créerait un Profile avant vérification.
      router.push(res.user?.hasProfile ? '/app/today' : '/onboarding/welcome');
```

- [ ] **Step 4: Typecheck, lint, manual verification**

```bash
pnpm typecheck && pnpm lint
```

Then with `pnpm dev` running: sign up a fresh account, verify the email,
confirm the browser lands on `/onboarding/welcome` (expected 404 for now —
Task 7 creates it). Log in with an existing verified account that has no
`Profile` row (any Phase-0/1 test account) and confirm the same redirect.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/contexts/AuthContext.tsx frontend/src/app/login/page.tsx \
  frontend/src/app/verify-email/page.tsx
git commit -m "feat(nawira): route sessions without a Profile to /onboarding/welcome"
```

---

## Task 7: Onboarding pages — welcome, birth-date, goal (OB02, extra, OB03)

**Files:**
- Create: `frontend/src/app/onboarding/welcome/page.tsx`
- Create: `frontend/src/app/onboarding/birth-date/page.tsx`
- Create: `frontend/src/app/onboarding/goal/page.tsx`

**Interfaces:**
- Consumes: `OnboardingLayout`, `OptionCard` (Task 2), `useOnboardingDraft`
  (Task 2), `isAdult` (Task 2).
- Produces: `draft.birthDate`, `draft.goal` populated for later steps.

No backend tests for these files (frontend pages, manual verification per
Global Constraints). Each step below ends with a browser check instead of
a test run.

- [ ] **Step 1: Create the welcome screen (OB02)**

Create `frontend/src/app/onboarding/welcome/page.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { Activity } from 'lucide-react';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { Button } from '@/components/ui/Button';

export default function OnboardingWelcomePage(): React.JSX.Element {
  const router = useRouter();

  return (
    <OnboardingLayout step={1}>
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft">
          <Activity className="h-8 w-8 text-primary" />
        </span>
        <div>
          <h1 className="font-headings text-2xl font-bold text-navy">Bienvenue sur NAWIRA</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Comprends ton cycle. Apprends à connaître ton corps.
          </p>
        </div>
        <Button onClick={() => router.push('/onboarding/birth-date')} className="w-full">
          Commencer
        </Button>
      </div>
    </OnboardingLayout>
  );
}
```

- [ ] **Step 2: Create the birth-date screen (age gate, not in the PRD's OB table)**

Create `frontend/src/app/onboarding/birth-date/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useOnboardingDraft } from '@/lib/onboarding-draft';
import { isAdult } from '@/lib/age';

export default function OnboardingBirthDatePage(): React.JSX.Element {
  const router = useRouter();
  const { draft, update } = useOnboardingDraft();
  const [birthDate, setBirthDate] = useState(draft.birthDate ?? '');
  const [touched, setTouched] = useState(false);

  const isValidDate = birthDate.length > 0 && !Number.isNaN(Date.parse(birthDate));
  const isOfAge = isValidDate && isAdult(birthDate);
  const showUnderageError = touched && isValidDate && !isOfAge;

  function onContinue(): void {
    update({ birthDate });
    router.push('/onboarding/goal');
  }

  return (
    <OnboardingLayout step={2} backHref="/onboarding/welcome">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-headings text-xl font-bold text-navy">Ta date de naissance</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            NAWIRA est réservé aux personnes de 18 ans et plus.
          </p>
        </div>
        <Field
          label="Date de naissance"
          type="date"
          name="birthDate"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          onBlur={() => setTouched(true)}
          max={new Date().toISOString().slice(0, 10)}
        />
        {showUnderageError && (
          <p role="alert" className="text-sm text-red-600">
            NAWIRA n&rsquo;est pas encore disponible pour les moins de 18 ans.
          </p>
        )}
        <Button onClick={onContinue} disabled={!isOfAge} className="w-full">
          Continuer
        </Button>
      </div>
    </OnboardingLayout>
  );
}
```

- [ ] **Step 3: Create the goal screen (OB03)**

Create `frontend/src/app/onboarding/goal/page.tsx`:

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Droplet, BookOpen, Heart } from 'lucide-react';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { OptionCard } from '@/components/onboarding/OptionCard';
import { Button } from '@/components/ui/Button';
import { useOnboardingDraft, type OnboardingDraft } from '@/lib/onboarding-draft';

const GOALS: Array<{
  value: NonNullable<OnboardingDraft['goal']>;
  title: string;
  icon: ReactNode;
}> = [
  {
    value: 'PERIOD_TRACKING',
    title: 'Suivre mes règles',
    icon: <Droplet className="h-5 w-5 text-primary" />,
  },
  {
    value: 'UNDERSTAND_CYCLE',
    title: 'Comprendre mon cycle',
    icon: <BookOpen className="h-5 w-5 text-primary" />,
  },
  {
    value: 'TRYING_TO_CONCEIVE',
    title: 'Projet bébé',
    icon: <Heart className="h-5 w-5 text-primary" />,
  },
];

export default function OnboardingGoalPage(): React.JSX.Element {
  const router = useRouter();
  const { draft, update } = useOnboardingDraft();
  const [goal, setGoal] = useState<OnboardingDraft['goal']>(draft.goal);

  function onContinue(): void {
    if (!goal) return;
    update({ goal });
    router.push('/onboarding/last-period');
  }

  return (
    <OnboardingLayout step={3} backHref="/onboarding/birth-date">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-headings text-xl font-bold text-navy">Quel est ton objectif ?</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Tu pourras changer d&rsquo;avis plus tard.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {GOALS.map((g) => (
            <OptionCard
              key={g.value}
              selected={goal === g.value}
              onClick={() => setGoal(g.value)}
              icon={g.icon}
              title={g.title}
            />
          ))}
        </div>
        <Button onClick={onContinue} disabled={!goal} className="w-full">
          Continuer
        </Button>
      </div>
    </OnboardingLayout>
  );
}
```

- [ ] **Step 4: Typecheck, lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 5: Manual browser verification at 375/768/1280px**

With `pnpm dev` running, navigate to `/onboarding/welcome`:
- Confirm the progress bar shows ~9% (step 1/11), no back arrow.
- Click "Commencer" → lands on `/onboarding/birth-date`, progress ~18%,
  back arrow returns to welcome.
- Enter a date under 18 years ago, blur the field → inline red error
  appears, "Continuer" stays disabled.
- Enter a date ≥18 years ago → error clears, "Continuer" enables →
  navigates to `/onboarding/goal`, progress ~27%.
- On the goal screen, confirm "Continuer" is disabled until a card is
  selected, then enables. Confirm no horizontal scroll and all touch
  targets look ≥44px tall at 375px width.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/onboarding/welcome frontend/src/app/onboarding/birth-date \
  frontend/src/app/onboarding/goal
git commit -m "feat(nawira): onboarding welcome, birth-date, goal screens"
```

---

## Task 8: Onboarding pages — last-period, period-length, cycle-length (OB04-06)

**Files:**
- Create: `frontend/src/app/onboarding/last-period/page.tsx`
- Create: `frontend/src/app/onboarding/period-length/page.tsx`
- Create: `frontend/src/app/onboarding/cycle-length/page.tsx`

**Interfaces:**
- Consumes: `OnboardingLayout`, `useOnboardingDraft`, `cn` from
  `@/lib/utils`.
- Produces: `draft.lastPeriodDate`, `draft.usualPeriodLength`,
  `draft.usualCycleLength` populated for later steps.

- [ ] **Step 1: Create the last-period screen (OB04) — never blocks**

Create `frontend/src/app/onboarding/last-period/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useOnboardingDraft } from '@/lib/onboarding-draft';

export default function OnboardingLastPeriodPage(): React.JSX.Element {
  const router = useRouter();
  const { draft, update } = useOnboardingDraft();
  const [lastPeriodDate, setLastPeriodDate] = useState(draft.lastPeriodDate ?? '');
  const [unknown, setUnknown] = useState(false);

  function onContinue(): void {
    update({ lastPeriodDate: unknown ? null : lastPeriodDate || null });
    router.push('/onboarding/period-length');
  }

  return (
    <OnboardingLayout step={4} backHref="/onboarding/goal">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-headings text-xl font-bold text-navy">
            Quand ont commencé tes dernières règles ?
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Facultatif — tu peux l&rsquo;ignorer.</p>
        </div>
        <Field
          label="Date de dernières règles"
          type="date"
          name="lastPeriodDate"
          value={lastPeriodDate}
          onChange={(e) => {
            setLastPeriodDate(e.target.value);
            setUnknown(false);
          }}
          max={new Date().toISOString().slice(0, 10)}
          disabled={unknown}
        />
        <button
          type="button"
          onClick={() => {
            setUnknown(true);
            setLastPeriodDate('');
          }}
          className="min-h-11 text-left text-sm font-medium text-primary underline"
        >
          Je ne sais pas
        </button>
        <Button onClick={onContinue} className="w-full">
          Continuer
        </Button>
      </div>
    </OnboardingLayout>
  );
}
```

- [ ] **Step 2: Create the period-length screen (OB05) — chip select**

Create `frontend/src/app/onboarding/period-length/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useOnboardingDraft } from '@/lib/onboarding-draft';

const OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: '3 jours', value: 3 },
  { label: '4 jours', value: 4 },
  { label: '5 jours', value: 5 },
  { label: '6 jours', value: 6 },
  { label: '7+ jours', value: 7 },
  { label: 'Je ne sais pas', value: null },
];

export default function OnboardingPeriodLengthPage(): React.JSX.Element {
  const router = useRouter();
  const { draft, update } = useOnboardingDraft();
  const [selected, setSelected] = useState<number | null>(draft.usualPeriodLength);

  function onContinue(): void {
    update({ usualPeriodLength: selected });
    router.push('/onboarding/cycle-length');
  }

  return (
    <OnboardingLayout step={5} backHref="/onboarding/last-period">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-headings text-xl font-bold text-navy">
            Combien de temps durent tes règles ?
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">En moyenne, sur les derniers cycles.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setSelected(opt.value)}
              className={cn(
                'rounded-full border px-4 py-3 text-sm font-medium',
                selected === opt.value
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-border bg-white text-navy hover:bg-gray-50',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Button onClick={onContinue} className="w-full">
          Continuer
        </Button>
      </div>
    </OnboardingLayout>
  );
}
```

- [ ] **Step 3: Create the cycle-length screen (OB06) — never pre-select 28**

Create `frontend/src/app/onboarding/cycle-length/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useOnboardingDraft } from '@/lib/onboarding-draft';

const CYCLE_DAYS = [26, 27, 28, 29, 30, 31, 32];

export default function OnboardingCycleLengthPage(): React.JSX.Element {
  const router = useRouter();
  const { draft, update } = useOnboardingDraft();
  const [selected, setSelected] = useState<number | null>(draft.usualCycleLength);

  function onContinue(): void {
    update({ usualCycleLength: selected });
    router.push('/onboarding/concerns');
  }

  const chipClass = (isSelected: boolean): string =>
    cn(
      'rounded-full border px-4 py-3 text-sm font-medium',
      isSelected
        ? 'border-primary bg-primary-soft text-primary'
        : 'border-border bg-white text-navy hover:bg-gray-50',
    );

  return (
    <OnboardingLayout step={6} backHref="/onboarding/period-length">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-headings text-xl font-bold text-navy">
            Quelle est la durée habituelle de ton cycle ?
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Du premier jour des règles au premier jour des règles suivantes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {CYCLE_DAYS.map((days) => (
            <button key={days} type="button" onClick={() => setSelected(days)} className={chipClass(selected === days)}>
              {days} j
            </button>
          ))}
          <button type="button" onClick={() => setSelected(null)} className={chipClass(selected === null)}>
            Irrégulier
          </button>
          <button type="button" onClick={() => setSelected(null)} className={chipClass(selected === null)}>
            Je ne sais pas
          </button>
        </div>
        <Button onClick={onContinue} className="w-full">
          Continuer
        </Button>
      </div>
    </OnboardingLayout>
  );
}
```

Note: "Irrégulier" and "Je ne sais pas" both map to `null` — the schema
has no way to distinguish them (documented simplification, see spec's
OB06 row). Both chips highlight together once either is selected; this is
an accepted minor UX quirk, not a bug.

- [ ] **Step 4: Typecheck, lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 5: Manual browser verification at 375/768/1280px**

- From `/onboarding/goal`, select a goal, continue → lands on
  `/onboarding/last-period`.
- Pick a date → continue works. Go back, click "Je ne sais pas" instead →
  the date field visually disables, continue still works (never blocked).
- On period-length, verify all 6 chips are tappable (≥44px tall at
  375px), selecting one highlights it, continue proceeds.
- On cycle-length, verify no chip is pre-selected/highlighted on first
  visit (no default 28), selecting a day highlights only that chip,
  continue proceeds to `/onboarding/concerns` (expected 404 until Task 9).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/onboarding/last-period frontend/src/app/onboarding/period-length \
  frontend/src/app/onboarding/cycle-length
git commit -m "feat(nawira): onboarding last-period, period-length, cycle-length screens"
```

---

## Task 9: Onboarding pages — concerns, baby-project (OB07-08)

**Files:**
- Create: `frontend/src/app/onboarding/concerns/page.tsx`
- Create: `frontend/src/app/onboarding/baby-project/page.tsx`

**Interfaces:**
- Consumes: `OnboardingLayout`, `useOnboardingDraft`, `cn`.
- Produces: `draft.trackedConcerns` populated; implements the OB07→OB08
  skip logic (only `TRYING_TO_CONCEIVE` sees OB08).

- [ ] **Step 1: Create the concerns screen (OB07) — multi-select with skip logic**

Create `frontend/src/app/onboarding/concerns/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { useOnboardingDraft } from '@/lib/onboarding-draft';

const CONCERNS = [
  { key: 'PAIN', label: 'Douleurs' },
  { key: 'MOOD', label: 'Humeur' },
  { key: 'FATIGUE', label: 'Fatigue' },
  { key: 'SLEEP', label: 'Sommeil' },
  { key: 'PMS', label: 'SPM' },
  { key: 'IRREGULARITY', label: 'Irrégularité' },
  { key: 'OVULATION', label: 'Ovulation' },
];

export default function OnboardingConcernsPage(): React.JSX.Element {
  const router = useRouter();
  const { draft, update } = useOnboardingDraft();
  const [selected, setSelected] = useState<string[]>(draft.trackedConcerns);

  function toggle(key: string): void {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function onContinue(): void {
    update({ trackedConcerns: selected });
    router.push(draft.goal === 'TRYING_TO_CONCEIVE' ? '/onboarding/baby-project' : '/onboarding/consent');
  }

  return (
    <OnboardingLayout step={7} backHref="/onboarding/cycle-length">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-headings text-xl font-bold text-navy">Que veux-tu suivre ?</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Choisis tout ce qui t&rsquo;intéresse.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {CONCERNS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => toggle(c.key)}
              className={cn(
                'rounded-full border px-4 py-3 text-sm font-medium',
                selected.includes(c.key)
                  ? 'border-primary bg-primary-soft text-primary'
                  : 'border-border bg-white text-navy hover:bg-gray-50',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <Button onClick={onContinue} className="w-full">
          Continuer
        </Button>
      </div>
    </OnboardingLayout>
  );
}
```

- [ ] **Step 2: Create the baby-project screen (OB08) — conditional, education-only**

Create `frontend/src/app/onboarding/baby-project/page.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { Button } from '@/components/ui/Button';
import { useOnboardingDraft } from '@/lib/onboarding-draft';

export default function OnboardingBabyProjectPage(): React.JSX.Element {
  const router = useRouter();
  const { draft } = useOnboardingDraft();
  const isTryingToConceive = draft.goal === 'TRYING_TO_CONCEIVE';

  useEffect(() => {
    if (!isTryingToConceive) {
      router.replace('/onboarding/consent');
    }
  }, [isTryingToConceive, router]);

  if (!isTryingToConceive) {
    return <></>;
  }

  return (
    <OnboardingLayout step={8} backHref="/onboarding/concerns">
      <div className="flex flex-col gap-6">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-soft">
          <Heart className="h-7 w-7 text-rose" />
        </span>
        <div>
          <h1 className="font-headings text-xl font-bold text-navy">Projet bébé</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            NAWIRA peut t&rsquo;aider à repérer ta fenêtre de fertilité grâce à la température
            basale, la glaire cervicale et les tests d&rsquo;ovulation. Tu pourras enregistrer ces
            signaux au fil de tes cycles.
          </p>
        </div>
        <Button onClick={() => router.push('/onboarding/consent')} className="w-full">
          Continuer
        </Button>
      </div>
    </OnboardingLayout>
  );
}
```

- [ ] **Step 3: Typecheck, lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 4: Manual browser verification at 375/768/1280px**

- With a draft where `goal !== 'TRYING_TO_CONCEIVE'` (from Task 7-8's
  flow): on concerns, select a few chips, continue → skips straight to
  `/onboarding/consent` (expected 404 until Task 10), never showing
  baby-project.
- Restart the flow (clear sessionStorage or use a private window),
  choose "Projet bébé" as the goal in Task 7's screen, walk through to
  concerns, continue → lands on `/onboarding/baby-project`, shows the
  education copy, continue → `/onboarding/consent`.
- Directly navigating to `/onboarding/baby-project` with a non-baby-project
  draft redirects immediately (no flash of the education content beyond
  a single render tick).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/onboarding/concerns frontend/src/app/onboarding/baby-project
git commit -m "feat(nawira): onboarding concerns + conditional baby-project screens"
```

---

## Task 10: Onboarding consent screen (OB09) — submission

**Files:**
- Create: `frontend/src/app/onboarding/consent/page.tsx`

**Interfaces:**
- Consumes: `POST /api/onboarding/complete` (Task 3), `useOnboardingDraft`
  + `clearOnboardingDraft` (Task 2), `api`/`ApiError` from `@/lib/api`.
- Produces: on success, a `Profile` + `Consent[]` row set server-side;
  clears the sessionStorage draft; navigates to `/onboarding/notifications`.

- [ ] **Step 1: Create the consent screen**

Create `frontend/src/app/onboarding/consent/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api';
import { useOnboardingDraft, clearOnboardingDraft } from '@/lib/onboarding-draft';
import { cn } from '@/lib/utils';

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  locked?: boolean;
  onChange?: (checked: boolean) => void;
}

function ToggleRow({ label, description, checked, locked, onChange }: ToggleRowProps): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-white p-4">
      <div>
        <p className="font-medium text-navy">{label}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={locked}
        onClick={() => onChange?.(!checked)}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60',
          checked ? 'bg-primary' : 'bg-border',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

export default function OnboardingConsentPage(): React.JSX.Element {
  const router = useRouter();
  const { draft } = useOnboardingDraft();
  const [assistantHistory, setAssistantHistory] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onAccept(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/onboarding/complete', {
        method: 'POST',
        body: {
          birthDate: draft.birthDate,
          goal: draft.goal,
          lastPeriodDate: draft.lastPeriodDate,
          usualPeriodLength: draft.usualPeriodLength,
          usualCycleLength: draft.usualCycleLength,
          trackedConcerns: draft.trackedConcerns,
          consents: {
            ACCOUNT: true,
            HEALTH_DATA: true,
            ASSISTANT_HISTORY: assistantHistory,
            ANALYTICS: analytics,
            MARKETING: marketing,
          },
        },
      });
      clearOnboardingDraft();
      router.push('/onboarding/notifications');
    } catch (err) {
      if (err instanceof ApiError) {
        const map: Record<string, string> = {
          VALIDATION_FAILED: 'Certaines réponses sont invalides. Reviens en arrière et vérifie.',
          UNDER_MINIMUM_AGE: 'NAWIRA n’est pas encore disponible pour les moins de 18 ans.',
          PROFILE_ALREADY_EXISTS: 'Ton profil existe déjà.',
        };
        setError(map[err.code] ?? 'Une erreur est survenue.');
      } else {
        setError('Une erreur est survenue.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const backHref = draft.goal === 'TRYING_TO_CONCEIVE' ? '/onboarding/baby-project' : '/onboarding/concerns';

  return (
    <OnboardingLayout step={9} backHref={backHref}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-headings text-xl font-bold text-navy">Ta confidentialité</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Voici comment NAWIRA utilise tes données. Tu peux changer d&rsquo;avis à tout moment.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <ToggleRow
            label="Compte"
            description="Nécessaire pour créer et sécuriser ton compte."
            checked
            locked
          />
          <ToggleRow
            label="Données de santé"
            description="Nécessaire pour suivre ton cycle et fournir le service."
            checked
            locked
          />
          <ToggleRow
            label="Historique de l'assistant"
            description="Garder l'historique de tes échanges avec l'assistant NAWIRA."
            checked={assistantHistory}
            onChange={setAssistantHistory}
          />
          <ToggleRow
            label="Analytique"
            description="Nous aider à améliorer NAWIRA de façon anonymisée."
            checked={analytics}
            onChange={setAnalytics}
          />
          <ToggleRow
            label="Marketing"
            description="Recevoir des offres et actualités NAWIRA."
            checked={marketing}
            onChange={setMarketing}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button onClick={onAccept} disabled={submitting} className="w-full">
          {submitting ? 'Enregistrement…' : 'Accepter'}
        </Button>
      </div>
    </OnboardingLayout>
  );
}
```

- [ ] **Step 2: Typecheck, lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 3: Manual browser verification at 375/768/1280px**

- Land on `/onboarding/consent` from either the concerns or baby-project
  screen (back arrow points to the right predecessor in each case).
- Confirm the "Compte" and "Données de santé" toggles are on and cannot
  be turned off (clicking them does nothing — `disabled` via `locked`).
- Toggle the 3 optional switches on/off, confirm the visual state matches.
- Click "Accepter" with a real signed-in test account (freshly
  signed-up + verified, no `Profile` yet): confirm it navigates to
  `/onboarding/notifications` (expected 404 until Task 11) and, via
  `pnpm db:studio`, confirm a `Profile` row and the expected `Consent`
  rows now exist for that user.
- Click "Accepter" a second time on a page that still has the old draft
  in `sessionStorage` (simulate via browser back) — confirm the inline
  French error "Ton profil existe déjà." appears instead of a silent
  failure or English error text.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/onboarding/consent
git commit -m "feat(nawira): onboarding consent screen — submits Profile + Consent (OB09)"
```

---

## Task 11: Onboarding pages — notifications, ready (OB10-11)

**Files:**
- Create: `frontend/src/app/onboarding/notifications/page.tsx`
- Create: `frontend/src/app/onboarding/ready/page.tsx`

**Interfaces:**
- Consumes: `PATCH /api/profile` (Task 4), `OnboardingLayout`, `OptionCard`.
- Produces: terminal screen of the onboarding flow, linking to
  `/app/today` (expected 404 until Phase 3 — same as login/verify-email
  today, per the spec's Decision 1).

- [ ] **Step 1: Create the notifications screen (OB10)**

Create `frontend/src/app/onboarding/notifications/page.tsx`:

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellDot, BellOff } from 'lucide-react';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { OptionCard } from '@/components/onboarding/OptionCard';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';

type NotificationLevel = 'NORMAL' | 'DISCREET' | 'NONE';

const OPTIONS: Array<{ value: NotificationLevel; title: string; description: string; icon: ReactNode }> = [
  {
    value: 'NORMAL',
    title: 'Normales',
    description: 'Rappels et alertes complètes.',
    icon: <Bell className="h-5 w-5 text-primary" />,
  },
  {
    value: 'DISCREET',
    title: 'Discrètes',
    description: 'Notifications sans détails visibles.',
    icon: <BellDot className="h-5 w-5 text-primary" />,
  },
  {
    value: 'NONE',
    title: 'Aucune',
    description: 'Pas de notifications.',
    icon: <BellOff className="h-5 w-5 text-primary" />,
  },
];

export default function OnboardingNotificationsPage(): React.JSX.Element {
  const router = useRouter();
  const [level, setLevel] = useState<NotificationLevel>('NORMAL');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onContinue(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      await api('/api/profile', {
        method: 'PATCH',
        body: { notificationLevel: level },
      });
      router.push('/onboarding/ready');
    } catch {
      setError('Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingLayout step={10} backHref="/onboarding/consent">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-headings text-xl font-bold text-navy">Notifications</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Choisis le niveau de notifications qui te convient.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {OPTIONS.map((opt) => (
            <OptionCard
              key={opt.value}
              selected={level === opt.value}
              onClick={() => setLevel(opt.value)}
              icon={opt.icon}
              title={opt.title}
              description={opt.description}
            />
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button onClick={onContinue} disabled={submitting} className="w-full">
          {submitting ? 'Enregistrement…' : 'Continuer'}
        </Button>
      </div>
    </OnboardingLayout>
  );
}
```

- [ ] **Step 2: Create the ready screen (OB11) — generic welcome, no computed prediction**

Create `frontend/src/app/onboarding/ready/page.tsx`:

```tsx
import { PartyPopper } from 'lucide-react';
import { OnboardingLayout } from '@/components/onboarding/OnboardingLayout';
import { LinkButton } from '@/components/ui/Button';

export default function OnboardingReadyPage(): React.JSX.Element {
  return (
    <OnboardingLayout step={11}>
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-soft">
          <PartyPopper className="h-8 w-8 text-green" />
        </span>
        <div>
          <h1 className="font-headings text-2xl font-bold text-navy">Ton profil est prêt !</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enregistre tes prochaines règles pour voir apparaître tes premières estimations de
            cycle et de fenêtre fertile.
          </p>
        </div>
        <LinkButton href="/app/today" className="w-full">
          Voir mon tableau de bord
        </LinkButton>
      </div>
    </OnboardingLayout>
  );
}
```

- [ ] **Step 3: Typecheck, lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 4: Manual browser verification at 375/768/1280px**

- From `/onboarding/consent`, accept, land on `/onboarding/notifications`.
- Confirm "Normales" is selected by default (no card is unselected-look
  initially since one is always the default), pick a different option,
  click "Continuer".
- Via `pnpm db:studio`, confirm the test user's `Profile.notificationLevel`
  matches the choice, and (if not "Aucune") a `Consent(type:
  NOTIFICATIONS)` row now exists.
- Confirm navigation lands on `/onboarding/ready`, showing the generic
  welcome copy with NO numbers/dates rendered anywhere on the screen.
- Click "Voir mon tableau de bord" — confirm it attempts to navigate to
  `/app/today` (a 404 is expected and correct at this phase).
- Full end-to-end walkthrough one more time at each of 375px, 768px,
  1280px: signup → verify-email → all 11 onboarding screens (choosing
  "Projet bébé" once, to also exercise the OB08 branch) → ready screen.
  Confirm no horizontal scroll, no overlapping elements, and all text is
  legible at each width.

- [ ] **Step 5: Full suite, typecheck, lint, format**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/onboarding/notifications frontend/src/app/onboarding/ready
git commit -m "feat(nawira): onboarding notifications + ready screens (OB10-11)"
```

---

## Self-Review

**Spec coverage:**
- OB02 welcome → Task 7 ✅
- Birth-date age gate (unlisted extra screen) → Task 7 ✅
- OB03 goal → Task 7 ✅
- OB04 last-period (never blocks) → Task 8 ✅
- OB05 period-length → Task 8 ✅
- OB06 cycle-length (never defaults to 28) → Task 8 ✅
- OB07 concerns + skip logic → Task 9 ✅
- OB08 baby-project (conditional + redirect guard) → Task 9 ✅
- OB09 consent + `POST /api/onboarding/complete` → Tasks 3 & 10 ✅
- OB10 notifications + `PATCH /api/profile` + C04 consent grant → Tasks 4
  & 11 ✅
- OB11 ready (generic, no computed prediction) → Task 11 ✅
- `Profile.notificationLevel` schema addition → Task 1 ✅
- `hasProfile` on `me`/`login`/`verify-email` + redirect wiring → Tasks 5
  & 6 ✅
- `lastPeriodDate` → `PeriodEvent` cross-phase-boundary write → Task 3 ✅
- Testing plan (Vitest for the 2 new + 3 extended routes, manual browser
  verification for pages) → covered in every task ✅

**Placeholder scan:** no "TBD"/"TODO"/"add validation" placeholders —
every step has literal, complete code. No task says "similar to Task N"
without repeating the actual code.

**Type consistency check:**
- `OnboardingDraft` (Task 2) fields — `birthDate`, `goal`,
  `lastPeriodDate`, `usualPeriodLength`, `usualCycleLength`,
  `trackedConcerns` — are read/written identically by name and type
  across Tasks 7-10 (verified: Task 7 writes `birthDate`/`goal`, Task 8
  writes `lastPeriodDate`/`usualPeriodLength`/`usualCycleLength`, Task 9
  writes `trackedConcerns` and reads `goal`, Task 10 reads all six).
- `isAdult(birthDateIso: string, minAge = 18): boolean` (Task 2) — same
  signature used in Task 3's route and Task 7's birth-date page.
- `useOnboardingDraft(): { draft, update }` and `clearOnboardingDraft()`
  (Task 2) — same names used in every consuming task (7-10).
- `POST /api/onboarding/complete` body shape (Task 3) matches exactly
  what Task 10's consent page sends (`birthDate`, `goal`,
  `lastPeriodDate`, `usualPeriodLength`, `usualCycleLength`,
  `trackedConcerns`, `consents: {ACCOUNT, HEALTH_DATA,
  ASSISTANT_HISTORY, ANALYTICS, MARKETING}`).
- `PATCH /api/profile` body shape (Task 4) — `{ notificationLevel }` —
  matches Task 11's notifications page.
- `hasProfile: boolean` field name is identical across Task 5 (3 routes),
  Task 6 (`AuthContext.User`), and both redirect call sites.
- `OptionCard` props (`selected`, `onClick`, `icon?`, `title`,
  `description?`) match usage in Tasks 7 (goal) and 11 (notifications).

No gaps found — plan is ready for execution.
