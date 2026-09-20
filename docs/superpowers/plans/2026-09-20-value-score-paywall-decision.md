# Value Score + Paywall Decision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Value Score scoring engine (event log + denormalized total) and a `GET /api/paywall/decision` endpoint that turns a user's score into an actionable upsell decision, per the NAWIRA business model's "conversion contextuelle" mechanic.

**Architecture:** A new `frontend/src/lib/server/value-score/` module owns a tunable signal-weight table, an idempotent `recordValueScoreSignal()` writer (mirrors the existing `trackEvent`/`createNotification` house pattern), and a pure `decidePaywallPrompt()` function. Seven existing route handlers get a one-line best-effort hook added at the point where the qualifying user behavior already happens. A new route exposes the decision without ever serializing the raw score.

**Tech Stack:** Next.js 16 Route Handlers, Prisma 5, Vitest + `vitest-mock-extended` (`prismaMock` / local `mockDeep`), Zod (unused here — no request body to validate, this ships as a GET).

**Spec:** [docs/superpowers/specs/2026-09-20-value-score-paywall-decision-design.md](../specs/2026-09-20-value-score-paywall-decision-design.md)

## Global Constraints

- Every Route Handler MUST `export const runtime = 'nodejs'` (CLAUDE.md — CI tripwire fails otherwise).
- The raw `valueScore` number must NEVER appear in any HTTP response body — the business model requires it stay invisible to the user (spec §0, §4).
- No paywall UI, no payment/Mobile Money integration, no admin visibility into the score — out of scope for this plan (spec §0).
- `recordValueScoreSignal` must never throw — a scoring failure must never block the real user action it's attached to (spec §2), matching `trackEvent`'s discipline.
- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` — no `any` casts.
- Before the final commit: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` must all pass (CLAUDE.md).

---

## Task 1: Prisma schema — `ValueScoreEvent` model + `Profile.valueScore` field

**Files:**
- Modify: `frontend/prisma/schema.prisma:57` (User relations block), `frontend/prisma/schema.prisma:301-316` (Profile model), append after `frontend/prisma/schema.prisma:468` (new model)
- Create: `frontend/prisma/migrations/15_nawira_value_score/migration.sql` (generated, then renamed — see steps)

**Interfaces:**
- Produces: Prisma Client types `ValueScoreEvent` (fields `id, userId, signalType, points, createdAt`) and `Profile.valueScore: number`, consumed by every later task via `prismaMock.valueScoreEvent.*` and `prismaMock.profile.update`.

- [ ] **Step 1: Add the `valueScoreEvents` relation to `User`**

In `frontend/prisma/schema.prisma`, find this block (around line 57):

```prisma
  accountActivity        AccountActivity[]
  analyticsEvents        AnalyticsEvent[]
```

Change it to:

```prisma
  accountActivity        AccountActivity[]
  analyticsEvents        AnalyticsEvent[]
  valueScoreEvents       ValueScoreEvent[]
```

- [ ] **Step 2: Add `valueScore` to `Profile`**

Find the `Profile` model (around line 301):

```prisma
  temperatureUnit   String    @default("CELSIUS") // CELSIUS | FAHRENHEIT
  notificationLevel String    @default("NORMAL") // NORMAL | DISCREET | NONE
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}
```

Change it to:

```prisma
  temperatureUnit   String    @default("CELSIUS") // CELSIUS | FAHRENHEIT
  notificationLevel String    @default("NORMAL") // NORMAL | DISCREET | NONE
  valueScore        Int       @default(0) // denormalized total — see ValueScoreEvent for the
  // audit log; NEVER serialize this raw value into an API response (business model §6)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}
```

- [ ] **Step 3: Append the `ValueScoreEvent` model**

At the end of `frontend/prisma/schema.prisma` (after the closing `}` of `AnalyticsEvent`, currently the last line), add:

```prisma

// ───────────────────────────────────────────────────────────────────────
// Value Score — internal, user-invisible engagement score (business model
// §6). Append-only signal log; Profile.valueScore is the denormalized
// running total kept in sync by recordValueScoreSignal (never write this
// table directly — see lib/server/value-score/record.ts).
// ───────────────────────────────────────────────────────────────────────
model ValueScoreEvent {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  signalType String // FIRST_CYCLE_LOGGED | SECOND_CYCLE_LOGGED | THIRD_CYCLE_COMPLETED |
  // SYMPTOM_LOGGED | CALENDAR_CONSULTED | INSIGHT_VIEWED | PROJET_BEBE_ACTIVATED |
  // PREMIUM_INTEREST_SHOWN
  points     Int
  createdAt  DateTime @default(now())

  @@index([userId, signalType, createdAt])
}
```

- [ ] **Step 4: Generate the migration without applying it**

Run from the repo root:

```bash
pnpm --filter frontend exec prisma migrate dev --create-only --name nawira_value_score
```

This writes a new folder under `frontend/prisma/migrations/` named
`<timestamp>_nawira_value_score` containing `migration.sql`, but does NOT apply it yet.

- [ ] **Step 5: Rename the migration folder to match this repo's sequential convention**

Every existing folder under `frontend/prisma/migrations/` is named `<n>_nawira_<slug>` (e.g.
`14_prune_payments_withdrawals_webhooks`), not Prisma's default timestamp. Rename the folder
generated in Step 4 (it must still be unapplied — renaming an already-applied migration folder
breaks Prisma's `_prisma_migrations` tracking, which is exactly why Step 4 used
`--create-only`):

```bash
mv frontend/prisma/migrations/*_nawira_value_score frontend/prisma/migrations/15_nawira_value_score
```

- [ ] **Step 6: Apply the migration and regenerate the Prisma Client**

```bash
pnpm --filter frontend exec prisma migrate dev
```

This applies the renamed, still-pending migration and regenerates `@prisma/client` (needed so
`vitest-mock-extended`'s `mockDeep<PrismaClient>()` knows about `prismaMock.valueScoreEvent.*`
in every later task's tests).

- [ ] **Step 7: Verify**

```bash
pnpm --filter frontend exec prisma migrate status
```

Expected: "Database schema is up to date!" with no pending migrations.

- [ ] **Step 8: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/15_nawira_value_score
git commit -m "feat(value-score): add ValueScoreEvent model + Profile.valueScore field"
```

---

## Task 2: Signal weight config — `value-score/signals.ts`

**Files:**
- Create: `frontend/src/lib/server/value-score/signals.ts`
- Test: `frontend/src/lib/server/value-score/signals.test.ts`

**Interfaces:**
- Consumes: nothing (pure config module).
- Produces: `ValueScoreSignalType` (union type), `VALUE_SCORE_SIGNALS: Record<ValueScoreSignalType, SignalDefinition>` where `SignalDefinition = { points: number; kind: 'once' } | { points: number; kind: 'repeatable'; cooldownDays: number }`. Consumed by Task 3 (`record.ts`) and every route-hook task.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/server/value-score/signals.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { VALUE_SCORE_SIGNALS } from './signals';

describe('VALUE_SCORE_SIGNALS', () => {
  it('gives every signal a positive point value', () => {
    for (const [signalType, def] of Object.entries(VALUE_SCORE_SIGNALS)) {
      expect(def.points, `${signalType}.points must be positive`).toBeGreaterThan(0);
    }
  });

  it('gives every repeatable signal a positive cooldownDays, and no once signal one', () => {
    for (const [signalType, def] of Object.entries(VALUE_SCORE_SIGNALS)) {
      if (def.kind === 'repeatable') {
        expect(def.cooldownDays, `${signalType}.cooldownDays must be positive`).toBeGreaterThan(0);
      } else {
        expect('cooldownDays' in def, `${signalType} (once) must not declare cooldownDays`).toBe(
          false,
        );
      }
    }
  });

  it('defines exactly the eight signals from the business model', () => {
    expect(Object.keys(VALUE_SCORE_SIGNALS).sort()).toEqual(
      [
        'CALENDAR_CONSULTED',
        'FIRST_CYCLE_LOGGED',
        'INSIGHT_VIEWED',
        'PREMIUM_INTEREST_SHOWN',
        'PROJET_BEBE_ACTIVATED',
        'SECOND_CYCLE_LOGGED',
        'SYMPTOM_LOGGED',
        'THIRD_CYCLE_COMPLETED',
      ].sort(),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter frontend exec vitest run src/lib/server/value-score/signals.test.ts
```

Expected: FAIL — `Cannot find module './signals'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/server/value-score/signals.ts`:

```ts
import 'server-only';

/**
 * Value Score signal catalog (business model reference §6). This is the
 * ONLY place point weights live — retuning a weight is a one-line change
 * here, never at a call site. `once` signals count at most one time per
 * user; `repeatable` signals count again after `cooldownDays` have
 * elapsed since the last recorded occurrence for that user+signal.
 */
export type ValueScoreSignalType =
  | 'FIRST_CYCLE_LOGGED'
  | 'SECOND_CYCLE_LOGGED'
  | 'THIRD_CYCLE_COMPLETED'
  | 'PROJET_BEBE_ACTIVATED'
  | 'SYMPTOM_LOGGED'
  | 'CALENDAR_CONSULTED'
  | 'INSIGHT_VIEWED'
  | 'PREMIUM_INTEREST_SHOWN';

export type SignalDefinition =
  | { points: number; kind: 'once' }
  | { points: number; kind: 'repeatable'; cooldownDays: number };

export const VALUE_SCORE_SIGNALS: Record<ValueScoreSignalType, SignalDefinition> = {
  FIRST_CYCLE_LOGGED: { points: 20, kind: 'once' },
  SECOND_CYCLE_LOGGED: { points: 20, kind: 'once' },
  THIRD_CYCLE_COMPLETED: { points: 25, kind: 'once' },
  PROJET_BEBE_ACTIVATED: { points: 30, kind: 'once' },
  SYMPTOM_LOGGED: { points: 10, kind: 'repeatable', cooldownDays: 1 },
  CALENDAR_CONSULTED: { points: 5, kind: 'repeatable', cooldownDays: 1 },
  INSIGHT_VIEWED: { points: 10, kind: 'repeatable', cooldownDays: 1 },
  PREMIUM_INTEREST_SHOWN: { points: 15, kind: 'repeatable', cooldownDays: 3 },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter frontend exec vitest run src/lib/server/value-score/signals.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/value-score/signals.ts frontend/src/lib/server/value-score/signals.test.ts
git commit -m "feat(value-score): add signal weight config"
```

---

## Task 3: Idempotent recorder — `value-score/record.ts`

**Files:**
- Create: `frontend/src/lib/server/value-score/record.ts`
- Test: `frontend/src/lib/server/value-score/record.test.ts`

**Interfaces:**
- Consumes: `VALUE_SCORE_SIGNALS`, `ValueScoreSignalType` from `./signals` (Task 2).
- Produces: `recordValueScoreSignal(db: Prisma.TransactionClient, userId: string, signalType: ValueScoreSignalType): Promise<void>`. Consumed by every route-hook task (5-10) and by the new endpoint (Task 10).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/server/value-score/record.test.ts`:

```ts
// Companion unit test for value-score/record.ts::recordValueScoreSignal.
// Mirrors notifications/createNotification.test.ts's local-mock style —
// this function takes its db client as a parameter, so no module-level
// `@/lib/server/prisma` mock is needed.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { recordValueScoreSignal } from './record';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => {
  mockReset(prismaMock);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
});

describe('recordValueScoreSignal', () => {
  it('inserts the event and increments Profile.valueScore for a first-time "once" signal', async () => {
    prismaMock.valueScoreEvent.findFirst.mockResolvedValue(null);
    prismaMock.valueScoreEvent.create.mockResolvedValue({} as never);
    prismaMock.profile.update.mockResolvedValue({} as never);

    await recordValueScoreSignal(prismaMock, 'u1', 'FIRST_CYCLE_LOGGED');

    expect(prismaMock.valueScoreEvent.create).toHaveBeenCalledWith({
      data: { userId: 'u1', signalType: 'FIRST_CYCLE_LOGGED', points: 20 },
    });
    expect(prismaMock.profile.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { valueScore: { increment: 20 } },
    });
  });

  it('does not double-count a "once" signal that already has an event row', async () => {
    prismaMock.valueScoreEvent.findFirst.mockResolvedValue({ id: 'e1' } as never);

    await recordValueScoreSignal(prismaMock, 'u1', 'FIRST_CYCLE_LOGGED');

    expect(prismaMock.valueScoreEvent.create).not.toHaveBeenCalled();
    expect(prismaMock.profile.update).not.toHaveBeenCalled();
  });

  it('blocks a "repeatable" signal fired again inside its cooldown window', async () => {
    // SYMPTOM_LOGGED has a 1-day cooldown — an event exists within the window.
    prismaMock.valueScoreEvent.findFirst.mockResolvedValue({ id: 'e1' } as never);

    await recordValueScoreSignal(prismaMock, 'u1', 'SYMPTOM_LOGGED');

    expect(prismaMock.valueScoreEvent.create).not.toHaveBeenCalled();
    const arg = prismaMock.valueScoreEvent.findFirst.mock.calls[0]?.[0];
    expect(arg?.where).toMatchObject({
      userId: 'u1',
      signalType: 'SYMPTOM_LOGGED',
      createdAt: { gte: new Date('2026-06-14T12:00:00Z') },
    });
  });

  it('allows a "repeatable" signal once the cooldown window has passed', async () => {
    prismaMock.valueScoreEvent.findFirst.mockResolvedValue(null);
    prismaMock.valueScoreEvent.create.mockResolvedValue({} as never);
    prismaMock.profile.update.mockResolvedValue({} as never);

    await recordValueScoreSignal(prismaMock, 'u1', 'SYMPTOM_LOGGED');

    expect(prismaMock.valueScoreEvent.create).toHaveBeenCalledWith({
      data: { userId: 'u1', signalType: 'SYMPTOM_LOGGED', points: 10 },
    });
    expect(prismaMock.profile.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { valueScore: { increment: 10 } },
    });
  });

  it('never throws when prisma fails — logs and returns', async () => {
    prismaMock.valueScoreEvent.findFirst.mockRejectedValue(new Error('connection lost'));

    await expect(
      recordValueScoreSignal(prismaMock, 'u1', 'FIRST_CYCLE_LOGGED'),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter frontend exec vitest run src/lib/server/value-score/record.test.ts
```

Expected: FAIL — `Cannot find module './record'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/server/value-score/record.ts`:

```ts
/**
 * recordValueScoreSignal — the single entry point for every ValueScoreEvent
 * row (mirrors this codebase's `createNotification(prisma, input)` /
 * `trackEvent(db, userId, type, props)` precedent). Idempotent: a "once"
 * signal counts at most one time per user; a "repeatable" signal counts
 * again only after its configured cooldown has elapsed.
 *
 * NEVER throws — a scoring failure must never break the real action it's
 * attached to (logging a period, saving symptoms, viewing insights).
 * Accepts `Prisma.TransactionClient` so callers can record from inside an
 * existing transaction (e.g. recomputeCyclesAndPrediction); a plain
 * `PrismaClient` is structurally assignable here too (same as trackEvent).
 */
import 'server-only';
import type { Prisma } from '@prisma/client';
import { log } from '@/lib/server/observability/log';
import { VALUE_SCORE_SIGNALS, type ValueScoreSignalType } from './signals';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function recordValueScoreSignal(
  db: Prisma.TransactionClient,
  userId: string,
  signalType: ValueScoreSignalType,
): Promise<void> {
  try {
    const definition = VALUE_SCORE_SIGNALS[signalType];

    const existing =
      definition.kind === 'once'
        ? await db.valueScoreEvent.findFirst({
            where: { userId, signalType },
            select: { id: true },
          })
        : await db.valueScoreEvent.findFirst({
            where: {
              userId,
              signalType,
              createdAt: { gte: new Date(Date.now() - definition.cooldownDays * MS_PER_DAY) },
            },
            select: { id: true },
          });
    if (existing) return;

    await db.valueScoreEvent.create({
      data: { userId, signalType, points: definition.points },
    });
    await db.profile.update({
      where: { userId },
      data: { valueScore: { increment: definition.points } },
    });
  } catch (err) {
    log.warn('value score signal recording failed', {
      signalType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter frontend exec vitest run src/lib/server/value-score/record.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/value-score/record.ts frontend/src/lib/server/value-score/record.test.ts
git commit -m "feat(value-score): add idempotent recordValueScoreSignal"
```

---

## Task 4: Decision engine — `value-score/paywall-decision.ts`

**Files:**
- Create: `frontend/src/lib/server/value-score/paywall-decision.ts`
- Test: `frontend/src/lib/server/value-score/paywall-decision.test.ts`

**Interfaces:**
- Consumes: nothing (pure function, no dependency on Tasks 2-3).
- Produces: `decidePaywallPrompt(input: { valueScore: number; goal: 'PERIOD_TRACKING' | 'UNDERSTAND_CYCLE' | 'TRYING_TO_CONCEIVE' }): { shouldShow: boolean; suggestedPlan: 'PLUS' | 'BABY' | null; reason: string }`. Consumed by Task 10 (the endpoint).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/server/value-score/paywall-decision.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decidePaywallPrompt } from './paywall-decision';

describe('decidePaywallPrompt', () => {
  it('does not prompt a TRYING_TO_CONCEIVE user below the baby funnel threshold', () => {
    const result = decidePaywallPrompt({ valueScore: 9, goal: 'TRYING_TO_CONCEIVE' });
    expect(result).toEqual({ shouldShow: false, suggestedPlan: null, reason: 'below_threshold' });
  });

  it('prompts BABY at exactly the baby funnel threshold for TRYING_TO_CONCEIVE', () => {
    const result = decidePaywallPrompt({ valueScore: 10, goal: 'TRYING_TO_CONCEIVE' });
    expect(result).toEqual({
      shouldShow: true,
      suggestedPlan: 'BABY',
      reason: 'baby_funnel_threshold',
    });
  });

  it('does not prompt a PERIOD_TRACKING user below the cycle funnel threshold', () => {
    const result = decidePaywallPrompt({ valueScore: 59, goal: 'PERIOD_TRACKING' });
    expect(result).toEqual({ shouldShow: false, suggestedPlan: null, reason: 'below_threshold' });
  });

  it('prompts PLUS at exactly the cycle funnel threshold for PERIOD_TRACKING', () => {
    const result = decidePaywallPrompt({ valueScore: 60, goal: 'PERIOD_TRACKING' });
    expect(result).toEqual({
      shouldShow: true,
      suggestedPlan: 'PLUS',
      reason: 'cycle_funnel_threshold',
    });
  });

  it('prompts PLUS at exactly the cycle funnel threshold for UNDERSTAND_CYCLE', () => {
    const result = decidePaywallPrompt({ valueScore: 60, goal: 'UNDERSTAND_CYCLE' });
    expect(result).toEqual({
      shouldShow: true,
      suggestedPlan: 'PLUS',
      reason: 'cycle_funnel_threshold',
    });
  });

  it('uses the low baby threshold (not the high cycle one) even for a TRYING_TO_CONCEIVE user with a mid-range score', () => {
    const result = decidePaywallPrompt({ valueScore: 30, goal: 'TRYING_TO_CONCEIVE' });
    expect(result.shouldShow).toBe(true);
    expect(result.suggestedPlan).toBe('BABY');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter frontend exec vitest run src/lib/server/value-score/paywall-decision.test.ts
```

Expected: FAIL — `Cannot find module './paywall-decision'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/server/value-score/paywall-decision.ts`:

```ts
import 'server-only';

export type OnboardingGoal = 'PERIOD_TRACKING' | 'UNDERSTAND_CYCLE' | 'TRYING_TO_CONCEIVE';

export interface PaywallDecisionInput {
  valueScore: number;
  goal: OnboardingGoal;
}

export interface PaywallDecision {
  shouldShow: boolean;
  suggestedPlan: 'PLUS' | 'BABY' | null;
  reason: 'baby_funnel_threshold' | 'cycle_funnel_threshold' | 'below_threshold';
}

/**
 * Business model §10: two funnels. Projet Bébé converts fast and
 * independent of the "3-cycle" guideline (low threshold, since
 * PROJET_BEBE_ACTIVATED alone is worth 30 points); the Cycle funnel needs
 * more accumulated engagement (roughly 2 cycles + one engagement signal).
 * Named constants, not runtime config — tuning is a reviewed code change
 * (spec §0's "out of scope" on remote config).
 */
const BABY_FUNNEL_THRESHOLD = 10;
const CYCLE_FUNNEL_THRESHOLD = 60;

export function decidePaywallPrompt(input: PaywallDecisionInput): PaywallDecision {
  if (input.goal === 'TRYING_TO_CONCEIVE' && input.valueScore >= BABY_FUNNEL_THRESHOLD) {
    return { shouldShow: true, suggestedPlan: 'BABY', reason: 'baby_funnel_threshold' };
  }
  if (input.valueScore >= CYCLE_FUNNEL_THRESHOLD) {
    return { shouldShow: true, suggestedPlan: 'PLUS', reason: 'cycle_funnel_threshold' };
  }
  return { shouldShow: false, suggestedPlan: null, reason: 'below_threshold' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter frontend exec vitest run src/lib/server/value-score/paywall-decision.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/value-score/paywall-decision.ts frontend/src/lib/server/value-score/paywall-decision.test.ts
git commit -m "feat(value-score): add decidePaywallPrompt two-funnel decision engine"
```

---

## Task 5: Hook — cycle milestones in `recompute.ts`

**Files:**
- Modify: `frontend/src/lib/server/cycles/recompute.ts:58-61` (crossing calculation), `:136-146` (post-processing block)
- Modify (tests): `frontend/src/lib/server/cycles/recompute.test.ts` (extend the existing `describe('third_cycle_completed analytics event', ...)` block)

**Interfaces:**
- Consumes: `recordValueScoreSignal` from `@/lib/server/value-score/record` (Task 3).
- Produces: nothing new — this task only adds calls inside an existing function.

- [ ] **Step 1: Write the failing tests**

In `frontend/src/lib/server/cycles/recompute.test.ts`, add these two `it` blocks inside the
existing `describe('third_cycle_completed analytics event', ...)` (it already has a
`beforeEach` that mocks `prismaMock.user.findUnique`, `prismaMock.consent.findFirst`,
`prismaMock.analyticsEvent.create`, `prismaMock.profile.findUnique` — add
`prismaMock.valueScoreEvent.findFirst.mockResolvedValue(null)` and
`prismaMock.valueScoreEvent.create.mockResolvedValue({} as never)` and
`prismaMock.profile.update.mockResolvedValue({} as never)` to that same `beforeEach`):

```ts
    it('records FIRST_CYCLE_LOGGED when this call crosses from 0 to 1 complete cycle', async () => {
      prismaMock.periodEvent.findMany.mockResolvedValue([
        { date: d('2026-01-01') },
        { date: d('2026-01-29') },
      ] as never);
      prismaMock.cycle.findMany.mockResolvedValue([] as never);

      await recomputeCyclesAndPrediction(prismaMock, 'u1');

      expect(prismaMock.valueScoreEvent.create).toHaveBeenCalledWith({
        data: { userId: 'u1', signalType: 'FIRST_CYCLE_LOGGED', points: 20 },
      });
    });

    it('records SECOND_CYCLE_LOGGED when this call crosses from 1 to 2 complete cycles, without re-recording FIRST_CYCLE_LOGGED', async () => {
      prismaMock.periodEvent.findMany.mockResolvedValue([
        { date: d('2026-01-01') },
        { date: d('2026-01-29') },
        { date: d('2026-02-26') },
      ] as never);
      prismaMock.cycle.findMany.mockResolvedValue([
        { startDate: d('2026-01-01'), endDate: d('2026-01-28'), length: 28, isOutlier: false },
        { startDate: d('2026-01-29'), endDate: null, length: null, isOutlier: false },
      ] as never);

      await recomputeCyclesAndPrediction(prismaMock, 'u1');

      const calledSignals = prismaMock.valueScoreEvent.create.mock.calls.map(
        (call) => call[0]?.data.signalType,
      );
      expect(calledSignals).toEqual(['SECOND_CYCLE_LOGGED']);
    });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter frontend exec vitest run src/lib/server/cycles/recompute.test.ts
```

Expected: FAIL — both new assertions see zero calls to `valueScoreEvent.create` (the hook
doesn't exist yet).

- [ ] **Step 3: Add the import and generalize the crossing check**

In `frontend/src/lib/server/cycles/recompute.ts`, add the import alongside the existing ones:

```ts
import { trackEvent } from '@/lib/server/analytics/track';
import { recordValueScoreSignal } from '@/lib/server/value-score/record';
```

Then replace the single-milestone crossing check:

```ts
  const previousComplete = existingCycles.filter((c) => c.endDate !== null).length;
  const currentComplete = cycles.filter((c) => c.endDate !== null).length;
  const crossedThirdCycle =
    previousComplete < COMPLETE_CYCLES_MILESTONE && currentComplete >= COMPLETE_CYCLES_MILESTONE;
```

with a version that also detects crossing 1 and 2:

```ts
  const previousComplete = existingCycles.filter((c) => c.endDate !== null).length;
  const currentComplete = cycles.filter((c) => c.endDate !== null).length;
  const crossedFirstCycle = previousComplete < 1 && currentComplete >= 1;
  const crossedSecondCycle = previousComplete < 2 && currentComplete >= 2;
  const crossedThirdCycle =
    previousComplete < COMPLETE_CYCLES_MILESTONE && currentComplete >= COMPLETE_CYCLES_MILESTONE;
```

- [ ] **Step 4: Record the two new signals**

Immediately after that block (still before the `existingByStart` line), add:

```ts
  if (crossedFirstCycle) {
    await recordValueScoreSignal(tx, userId, 'FIRST_CYCLE_LOGGED');
  }
  if (crossedSecondCycle) {
    await recordValueScoreSignal(tx, userId, 'SECOND_CYCLE_LOGGED');
  }
```

- [ ] **Step 5: Record the third-cycle signal alongside its existing analytics event**

Find the existing block near the end of the function:

```ts
  if (crossedThirdCycle) {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
    if (user) {
      const monthsSinceSignup =
        Math.round(((Date.now() - user.createdAt.getTime()) / MS_PER_DAY / DAYS_PER_MONTH) * 10) /
        10;
      await trackEvent(tx, userId, 'third_cycle_completed', {
        months_since_signup: monthsSinceSignup,
      });
    }
  }
```

Add the value-score call inside the same `if (user)` block:

```ts
  if (crossedThirdCycle) {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
    if (user) {
      const monthsSinceSignup =
        Math.round(((Date.now() - user.createdAt.getTime()) / MS_PER_DAY / DAYS_PER_MONTH) * 10) /
        10;
      await trackEvent(tx, userId, 'third_cycle_completed', {
        months_since_signup: monthsSinceSignup,
      });
      await recordValueScoreSignal(tx, userId, 'THIRD_CYCLE_COMPLETED');
    }
  }
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm --filter frontend exec vitest run src/lib/server/cycles/recompute.test.ts
```

Expected: PASS (all existing tests plus the 2 new ones). If an existing test in this file now
fails because `prismaMock.valueScoreEvent.findFirst` is unmocked in another `describe` block
that also crosses a cycle-count milestone, add
`prismaMock.valueScoreEvent.findFirst.mockResolvedValue(null)` and
`prismaMock.valueScoreEvent.create.mockResolvedValue({} as never)` and
`prismaMock.profile.update.mockResolvedValue({} as never)` to the file's top-level
`beforeEach` instead of only the nested one.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/server/cycles/recompute.ts frontend/src/lib/server/cycles/recompute.test.ts
git commit -m "feat(value-score): record cycle-milestone signals from recomputeCyclesAndPrediction"
```

---

## Task 6: Hook — `SYMPTOM_LOGGED` in daily-logs PUT

**Files:**
- Modify: `frontend/src/app/api/daily-logs/today/route.ts`
- Modify (tests): `frontend/src/app/api/daily-logs/today/route.test.ts`

**Interfaces:**
- Consumes: `recordValueScoreSignal` from `@/lib/server/value-score/record` (Task 3).

- [ ] **Step 1: Write the failing test**

In `frontend/src/app/api/daily-logs/today/route.test.ts`, add this `vi.mock` alongside the
existing ones near the top of the file:

```ts
vi.mock('@/lib/server/value-score/record', () => ({
  recordValueScoreSignal: vi.fn(async () => {}),
}));
```

Add the import:

```ts
import { recordValueScoreSignal } from '@/lib/server/value-score/record';
```

Then add this test inside the `PUT` describe block:

```ts
  it('records SYMPTOM_LOGGED when the saved log has at least one symptom', async () => {
    await PUT(makePutReq(FULL_BODY));

    expect(recordValueScoreSignal).toHaveBeenCalledWith(prismaMock, 'u1', 'SYMPTOM_LOGGED');
  });

  it('does not record SYMPTOM_LOGGED when the saved log has zero symptoms', async () => {
    await PUT(makePutReq({ ...FULL_BODY, symptoms: [] }));

    expect(recordValueScoreSignal).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter frontend exec vitest run src/app/api/daily-logs/today/route.test.ts
```

Expected: FAIL — `recordValueScoreSignal` is never called.

- [ ] **Step 3: Add the hook**

In `frontend/src/app/api/daily-logs/today/route.ts`, add the import:

```ts
import { recordValueScoreSignal } from '@/lib/server/value-score/record';
```

Then, inside the `PUT` handler's transaction, right after the existing:

```ts
      await tx.symptomLog.deleteMany({ where: { dailyLogId: dailyLog.id } });
      await tx.symptomLog.createMany({
        data: uniqueSymptoms.map((symptom) => ({ dailyLogId: dailyLog.id, symptom })),
      });
    });
```

change it to:

```ts
      await tx.symptomLog.deleteMany({ where: { dailyLogId: dailyLog.id } });
      await tx.symptomLog.createMany({
        data: uniqueSymptoms.map((symptom) => ({ dailyLogId: dailyLog.id, symptom })),
      });

      if (uniqueSymptoms.length > 0) {
        await recordValueScoreSignal(tx, auth.user.sub, 'SYMPTOM_LOGGED');
      }
    });
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter frontend exec vitest run src/app/api/daily-logs/today/route.test.ts
```

Expected: PASS (all existing tests plus the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/daily-logs/today/route.ts frontend/src/app/api/daily-logs/today/route.test.ts
git commit -m "feat(value-score): record SYMPTOM_LOGGED on daily log save"
```

---

## Task 7: Hook — `CALENDAR_CONSULTED` in `GET /api/cycles`

**Files:**
- Modify: `frontend/src/app/api/cycles/route.ts`
- Modify (tests): `frontend/src/app/api/cycles/route.test.ts`

**Interfaces:**
- Consumes: `recordValueScoreSignal` from `@/lib/server/value-score/record` (Task 3).

- [ ] **Step 1: Write the failing test**

In `frontend/src/app/api/cycles/route.test.ts`, add the mock near the top:

```ts
vi.mock('@/lib/server/value-score/record', () => ({
  recordValueScoreSignal: vi.fn(async () => {}),
}));
```

Add the import:

```ts
import { recordValueScoreSignal } from '@/lib/server/value-score/record';
```

Add this test inside the `describe('GET /api/cycles', ...)` block:

```ts
  it('records a CALENDAR_CONSULTED signal for the caller', async () => {
    prismaMock.cycle.findMany.mockResolvedValue([]);
    prismaMock.periodEvent.findUnique.mockResolvedValue(null);

    await GET(makeReq());

    expect(recordValueScoreSignal).toHaveBeenCalledWith(prismaMock, 'u1', 'CALENDAR_CONSULTED');
  });
```

Also add the `prismaMock` import at the top of the file if not already present (it is —
`import { prismaMock } from '@/test-utils/prisma-mock';` is already the first line).

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter frontend exec vitest run src/app/api/cycles/route.test.ts
```

Expected: FAIL — `recordValueScoreSignal` is never called.

- [ ] **Step 3: Add the hook**

In `frontend/src/app/api/cycles/route.ts`, add the import:

```ts
import { recordValueScoreSignal } from '@/lib/server/value-score/record';
```

Then, right after the existing `Promise.all` that fetches `cycles` and `todayEvent`, add a
best-effort call before building the response:

```ts
    const [cycles, todayEvent] = await Promise.all([
      prisma.cycle.findMany({
        where: { userId: auth.user.sub },
        orderBy: { startDate: 'desc' },
        select: { startDate: true, endDate: true, length: true, isOutlier: true },
      }),
      prisma.periodEvent.findUnique({
        where: { userId_date: { userId: auth.user.sub, date: todayUtcDate() } },
        select: { flow: true },
      }),
    ]);

    await recordValueScoreSignal(prisma, auth.user.sub, 'CALENDAR_CONSULTED');

    return NextResponse.json(
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter frontend exec vitest run src/app/api/cycles/route.test.ts
```

Expected: PASS (all existing tests plus the new one).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/cycles/route.ts frontend/src/app/api/cycles/route.test.ts
git commit -m "feat(value-score): record CALENDAR_CONSULTED on GET /api/cycles"
```

---

## Task 8: Hook — `INSIGHT_VIEWED` in `GET /api/insights`

**Files:**
- Modify: `frontend/src/app/api/insights/route.ts`
- Modify (tests): `frontend/src/app/api/insights/route.test.ts`

**Interfaces:**
- Consumes: `recordValueScoreSignal` from `@/lib/server/value-score/record` (Task 3).

- [ ] **Step 1: Write the failing test**

In `frontend/src/app/api/insights/route.test.ts`, add the mock near the top:

```ts
vi.mock('@/lib/server/value-score/record', () => ({
  recordValueScoreSignal: vi.fn(async () => {}),
}));
```

Add the import:

```ts
import { recordValueScoreSignal } from '@/lib/server/value-score/record';
```

Add this test inside the file's main describe block (use the same `prismaMock` setup pattern
already used by that file's other tests — mock `cycle.findMany`, `dailyLog.findMany`, and
`periodEvent.findMany` to empty arrays):

```ts
  it('records an INSIGHT_VIEWED signal for the caller', async () => {
    prismaMock.cycle.findMany.mockResolvedValue([]);
    prismaMock.dailyLog.findMany.mockResolvedValue([]);
    prismaMock.periodEvent.findMany.mockResolvedValue([]);

    await GET(makeReq());

    expect(recordValueScoreSignal).toHaveBeenCalledWith(prismaMock, 'u1', 'INSIGHT_VIEWED');
  });
```

If this test file doesn't already export a `makeReq()` helper, check the file's existing tests
for how they construct the `NextRequest` and reuse that exact helper name/shape instead.

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter frontend exec vitest run src/app/api/insights/route.test.ts
```

Expected: FAIL — `recordValueScoreSignal` is never called.

- [ ] **Step 3: Add the hook**

In `frontend/src/app/api/insights/route.ts`, add the import:

```ts
import { recordValueScoreSignal } from '@/lib/server/value-score/record';
```

Then, right after `const result = deriveInsights(input);` and before the `return`, add:

```ts
    const result = deriveInsights(input);

    await recordValueScoreSignal(prisma, userId, 'INSIGHT_VIEWED');

    return NextResponse.json(result, { headers: { 'x-request-id': ctx.requestId } });
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter frontend exec vitest run src/app/api/insights/route.test.ts
```

Expected: PASS (all existing tests plus the new one).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/insights/route.ts frontend/src/app/api/insights/route.test.ts
git commit -m "feat(value-score): record INSIGHT_VIEWED on GET /api/insights"
```

---

## Task 9: Hook — `PROJET_BEBE_ACTIVATED` in `POST /api/onboarding/complete`

**Files:**
- Modify: `frontend/src/app/api/onboarding/complete/route.ts`
- Modify (tests): `frontend/src/app/api/onboarding/complete/route.test.ts`

**Interfaces:**
- Consumes: `recordValueScoreSignal` from `@/lib/server/value-score/record` (Task 3).

- [ ] **Step 1: Write the failing tests**

In `frontend/src/app/api/onboarding/complete/route.test.ts`, add this mock alongside the
existing `vi.mock('@/lib/server/cycles/recompute', ...)`:

```ts
vi.mock('@/lib/server/value-score/record', () => ({
  recordValueScoreSignal: vi.fn(async () => {}),
}));
```

Add the import:

```ts
import { recordValueScoreSignal } from '@/lib/server/value-score/record';
```

Add these two tests:

```ts
  it('records PROJET_BEBE_ACTIVATED when the goal is TRYING_TO_CONCEIVE', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);
    prismaMock.profile.create.mockResolvedValue({} as never);

    await POST(makeReq({ ...VALID_BODY, goal: 'TRYING_TO_CONCEIVE' }));

    expect(recordValueScoreSignal).toHaveBeenCalledWith(
      prismaMock,
      'u1',
      'PROJET_BEBE_ACTIVATED',
    );
  });

  it('does not record PROJET_BEBE_ACTIVATED for a different goal', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);
    prismaMock.profile.create.mockResolvedValue({} as never);

    await POST(makeReq({ ...VALID_BODY, goal: 'PERIOD_TRACKING' }));

    expect(recordValueScoreSignal).not.toHaveBeenCalled();
  });
```

Check the file's existing `beforeEach`/tests for how `prismaMock.profile.create` and
`prismaMock.consent.create` are already mocked (they must be, since the happy-path test
already exercises this transaction) and reuse that exact setup rather than duplicating it if
it's already global to the file.

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter frontend exec vitest run src/app/api/onboarding/complete/route.test.ts
```

Expected: FAIL — `recordValueScoreSignal` is never called.

- [ ] **Step 3: Add the hook**

In `frontend/src/app/api/onboarding/complete/route.ts`, add the import:

```ts
import { recordValueScoreSignal } from '@/lib/server/value-score/record';
```

Then, inside the transaction, right after the existing `await recomputeCyclesAndPrediction(tx, auth.user.sub);` line, add:

```ts
      await recomputeCyclesAndPrediction(tx, auth.user.sub);

      if (body.goal === 'TRYING_TO_CONCEIVE') {
        await recordValueScoreSignal(tx, auth.user.sub, 'PROJET_BEBE_ACTIVATED');
      }
    });
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter frontend exec vitest run src/app/api/onboarding/complete/route.test.ts
```

Expected: PASS (all existing tests plus the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/onboarding/complete/route.ts frontend/src/app/api/onboarding/complete/route.test.ts
git commit -m "feat(value-score): record PROJET_BEBE_ACTIVATED on onboarding completion"
```

---

## Task 10: New endpoint — `GET /api/paywall/decision`

**Files:**
- Create: `frontend/src/app/api/paywall/decision/route.ts`
- Test: `frontend/src/app/api/paywall/decision/route.test.ts`

**Interfaces:**
- Consumes: `recordValueScoreSignal` (Task 3), `decidePaywallPrompt` (Task 4), `trackEvent` (existing, `@/lib/server/analytics/track`), `requireAuth` (existing, `@/lib/server/middleware`).
- Produces: `GET` handler returning `{ shouldShow: boolean; suggestedPlan: 'PLUS' | 'BABY' | null; reason: string }`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/paywall/decision/route.test.ts`:

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'u1', email: 'a@b.com' } })),
}));
vi.mock('@/lib/server/value-score/record', () => ({
  recordValueScoreSignal: vi.fn(async () => {}),
}));
vi.mock('@/lib/server/analytics/track', () => ({
  trackEvent: vi.fn(async () => {}),
}));

import { requireAuth } from '@/lib/server/middleware';
import { recordValueScoreSignal } from '@/lib/server/value-score/record';
import { trackEvent } from '@/lib/server/analytics/track';
import { GET } from './route';

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/paywall/decision', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } });
});

describe('GET /api/paywall/decision', () => {
  it('returns already_subscribed and skips signal recording when plan is not FREE', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      valueScore: 999,
      goal: 'PERIOD_TRACKING',
      plan: 'PLUS',
    } as never);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ shouldShow: false, suggestedPlan: null, reason: 'already_subscribed' });
    expect(recordValueScoreSignal).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('records PREMIUM_INTEREST_SHOWN and returns shouldShow:false below threshold for a FREE user', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      valueScore: 5,
      goal: 'PERIOD_TRACKING',
      plan: 'FREE',
    } as never);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body).toEqual({ shouldShow: false, suggestedPlan: null, reason: 'below_threshold' });
    expect(recordValueScoreSignal).toHaveBeenCalledWith(prismaMock, 'u1', 'PREMIUM_INTEREST_SHOWN');
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('fires paywall_viewed and returns the suggested plan when the threshold is met', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      valueScore: 60,
      goal: 'PERIOD_TRACKING',
      plan: 'FREE',
    } as never);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body).toEqual({
      shouldShow: true,
      suggestedPlan: 'PLUS',
      reason: 'cycle_funnel_threshold',
    });
    expect(trackEvent).toHaveBeenCalledWith(prismaMock, 'u1', 'paywall_viewed', {
      paywall_id: 'value_score_decision',
      plan: 'PLUS',
    });
  });

  it('never serializes a numeric valueScore field in the response', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      valueScore: 60,
      goal: 'PERIOD_TRACKING',
      plan: 'FREE',
    } as never);

    const res = await GET(makeReq());
    const body: Record<string, unknown> = await res.json();

    expect(Object.keys(body)).toEqual(['shouldShow', 'suggestedPlan', 'reason']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter frontend exec vitest run src/app/api/paywall/decision/route.test.ts
```

Expected: FAIL — the route module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/app/api/paywall/decision/route.ts`:

```ts
// GET /api/paywall/decision — turns the caller's Value Score into an
// actionable upsell decision (business model §6, §10). Read-only, no
// CSRF. The raw score is NEVER included in the response — only the
// decision the frontend needs to act on.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { recordValueScoreSignal } from '@/lib/server/value-score/record';
import { decidePaywallPrompt } from '@/lib/server/value-score/paywall-decision';
import { trackEvent } from '@/lib/server/analytics/track';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const profile = await prisma.profile.findUnique({
      where: { userId: auth.user.sub },
      select: { valueScore: true, goal: true, plan: true },
    });

    if (!profile || profile.plan !== 'FREE') {
      return NextResponse.json(
        { shouldShow: false, suggestedPlan: null, reason: 'already_subscribed' },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await recordValueScoreSignal(prisma, auth.user.sub, 'PREMIUM_INTEREST_SHOWN');

    const decision = decidePaywallPrompt({
      valueScore: profile.valueScore,
      goal: profile.goal as 'PERIOD_TRACKING' | 'UNDERSTAND_CYCLE' | 'TRYING_TO_CONCEIVE',
    });

    if (decision.shouldShow) {
      await trackEvent(prisma, auth.user.sub, 'paywall_viewed', {
        paywall_id: 'value_score_decision',
        plan: decision.suggestedPlan,
      });
    }

    return NextResponse.json(decision, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter frontend exec vitest run src/app/api/paywall/decision/route.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/paywall/decision/route.ts frontend/src/app/api/paywall/decision/route.test.ts
git commit -m "feat(value-score): add GET /api/paywall/decision endpoint"
```

---

## Task 11: GDPR cleanup — delete `ValueScoreEvent` rows on account deletion

**Files:**
- Modify: `frontend/src/lib/server/account/delete-account.ts`
- Modify (tests): `frontend/src/lib/server/account/delete-account.test.ts`

**Interfaces:**
- Consumes: nothing new (uses the `ValueScoreEvent` Prisma model from Task 1).

- [ ] **Step 1: Write the failing test**

In `frontend/src/lib/server/account/delete-account.test.ts`, find the array of model names in
the first test (`'hard-deletes every health/behavioral table for the user, scoped by userId'`)
and add `'valueScoreEvent'` to it:

```ts
    for (const model of [
      'verificationCode',
      'fileUpload',
      'notification',
      'notificationPreferences',
      'profile',
      'consent',
      'assistantConversation',
      'dailyLog',
      'periodEvent',
      'cycle',
      'fertilitySignal',
      'prediction',
      'insight',
      'analyticsEvent',
      'accountActivity',
      'oAuthAccount',
      'valueScoreEvent',
    ] as const) {
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter frontend exec vitest run src/lib/server/account/delete-account.test.ts
```

Expected: FAIL — `prismaMock.valueScoreEvent.deleteMany` was never called.

- [ ] **Step 3: Add the cleanup call**

In `frontend/src/lib/server/account/delete-account.ts`, add the deletion alongside the other
per-model deletes:

```ts
      await tx.analyticsEvent.deleteMany({ where: { userId } });
      await tx.accountActivity.deleteMany({ where: { userId } });
      await tx.oAuthAccount.deleteMany({ where: { userId } });
      await tx.valueScoreEvent.deleteMany({ where: { userId } });
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter frontend exec vitest run src/lib/server/account/delete-account.test.ts
```

Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/account/delete-account.ts frontend/src/lib/server/account/delete-account.test.ts
git commit -m "feat(value-score): delete ValueScoreEvent rows on account deletion"
```

---

## Task 12: Full verification gate

**Files:** none (verification only).

- [ ] **Step 1: Run the full formatting, lint, typecheck, and test suite**

From the repo root:

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
```

Expected: all four commands exit 0. Pay particular attention to:
- The runtime-enforcement tripwire (`src/lib/server/observability/runtime-enforcement.test.ts`) — confirms the new `frontend/src/app/api/paywall/decision/route.ts` declares `export const runtime = 'nodejs'`.
- No TypeScript error from `exactOptionalPropertyTypes` on the new `PaywallDecision` type or the Prisma `profile.goal` cast in the route handler.

- [ ] **Step 2: Manually verify the endpoint against a running dev server**

```bash
pnpm dev
```

In a separate terminal, log in as a test user (via the browser, `/login`), then check the
Network tab for a request to `GET /api/paywall/decision` from `/app/billing` — or call it
directly with the session cookie:

```bash
curl -i http://localhost:3000/api/paywall/decision -b "<paste your app-access cookie here>"
```

Expected: `200` with a JSON body containing exactly `shouldShow`, `suggestedPlan`, `reason` —
no `valueScore` field anywhere in the response.

- [ ] **Step 3: Final commit (if Step 1 required any fixes)**

```bash
git add -A
git commit -m "chore(value-score): fix lint/typecheck issues from full verification pass"
```

(Skip this step entirely if Step 1 passed clean with no changes needed.)
