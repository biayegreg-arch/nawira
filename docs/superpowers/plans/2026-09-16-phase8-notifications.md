# Phase 8 — Notifications métier (E9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 4 rule-based notification triggers PRD §11 names N01-N04 (Règles J-3, Journal quotidien, Résumé hebdo, Fenêtre fertile), delivered through the existing `createNotification`/`Notification`/`NotificationBell` pipeline via one new daily cron.

**Architecture:** Two new pure modules under `frontend/src/lib/server/notifications/` — `templates.ts` gains 4 new typed template functions (no I/O, build a `CreateNotificationInput` from plain args), and a new `triggers.ts` holds 4 pure `check*` functions (no Prisma calls — take already-fetched rows + `today`, return `CreateNotificationInput | null`). One new cron route, `POST /api/cron/notification-triggers`, does all the I/O: batched Prisma queries for N01/N02/N04, a per-user (Monday-only) query set for N03's `deriveInsights()` eligibility check, then loops `createNotification` for whatever the trigger functions returned. No new Prisma model — idempotency is the existing `Notification.dedupeKey` unique constraint.

**Tech Stack:** Next.js 16 Route Handlers, Prisma 5 + Neon, Vitest + `vitest-mock-extended` (`@/test-utils/prisma-mock`'s `prismaMock`).

**Spec:** `docs/superpowers/specs/2026-09-16-phase8-notifications-design.md`

## Global Constraints

- Every Route Handler MUST `export const runtime = 'nodejs'`.
- No new Prisma model, no migration — this phase reuses `Profile.notificationLevel` (`NORMAL | DISCREET | NONE`), `Profile.goal`, `Prediction`, `DailyLog`, and `Notification.dedupeKey`'s existing unique constraint.
- Every `Notification` row MUST be created via `createNotification(prisma, input)` from `frontend/src/lib/server/notifications/index.ts` — never `prisma.notification.create` directly (CLAUDE.md invariant).
- `triggers.ts`'s 4 `check*` functions take ONLY plain data (profile rows, prediction rows, booleans, `Date`) — never a Prisma client. Only `route.ts` (Task 3) does I/O. This mirrors Phase 7's `assistant/*.ts` pure-function precedent.
- Copy is verbatim from PRD §11 — do not paraphrase. NORMAL and DISCREET variants both required for all 4 triggers; DISCREET also replaces the **title** with `'NAWIRA'` (not just the body).
- `notificationLevel === 'NONE'` skips ALL 4 triggers for that user — checked once, not per-category (Phase 8 deliberately has no per-category prefs, see spec §1).
- N04 (fertility) additionally requires `Profile.goal === 'TRYING_TO_CONCEIVE'` — never sent to other goals.
- Dates in dedupeKeys are `YYYY-MM-DD` (`date.toISOString().slice(0, 10)`), matching every other date-serialization call site in this codebase (e.g. `frontend/src/app/api/cycles/route.ts`).
- `today` throughout is always `todayUtcDate()` from `frontend/src/lib/server/cycles/date-utils.ts` — UTC midnight, matching how `DailyLog.date`/`Prediction.expectedPeriodStart`/etc. are stored (`@db.Date`).
- The cron runs daily at 18:00 UTC (`0 18 * * *`) — Sénégal (PRD pilot market) is UTC+0 year-round, so this is genuinely 18:00 Dakar time, not an approximation.
- N03 (weekly summary) only computes `deriveInsights()` (3 extra Prisma queries per profile) when `today.getUTCDay() === 1` (Monday, UTC) — never on other days, to avoid the per-user fan-out cost daily.

---

### Task 1: `templates.ts` — 4 new notification templates

**Files:**
- Modify: `frontend/src/lib/server/notifications/templates.ts`
- Create: `frontend/src/lib/server/notifications/templates.test.ts` (this file doesn't exist yet — only the new functions are tested, not the pre-existing `welcomeNotification`/`paymentReceived`, which are out of scope for this phase)

**Interfaces:**
- Consumes: `CreateNotificationInput` type from `./index` (already imported at the top of `templates.ts`).
- Produces: `periodReminder(userId: string, level: 'NORMAL' | 'DISCREET', expectedPeriodStart: Date): CreateNotificationInput`, `journalReminder(userId: string, level: 'NORMAL' | 'DISCREET', today: Date): CreateNotificationInput`, `weeklySummaryReady(userId: string, level: 'NORMAL' | 'DISCREET', weekOf: Date): CreateNotificationInput`, `fertilityWindowApproaching(userId: string, level: 'NORMAL' | 'DISCREET', fertileWindowStart: Date): CreateNotificationInput` — Task 2's `triggers.ts` imports and calls all 4.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/server/notifications/templates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  periodReminder,
  journalReminder,
  weeklySummaryReady,
  fertilityWindowApproaching,
} from './templates';

describe('periodReminder', () => {
  it('builds the NORMAL copy with a dedupeKey keyed to expectedPeriodStart', () => {
    const result = periodReminder('user_1', 'NORMAL', new Date('2026-09-21'));
    expect(result).toEqual({
      userId: 'user_1',
      type: 'PERIOD_REMINDER',
      title: 'Règles à venir',
      body: 'Tes règles sont estimées dans environ 3 jours.',
      dedupeKey: 'period-reminder:user_1:2026-09-21',
    });
  });

  it('builds the DISCREET copy with a generic title', () => {
    const result = periodReminder('user_1', 'DISCREET', new Date('2026-09-21'));
    expect(result.title).toBe('NAWIRA');
    expect(result.body).toBe('Ton rappel personnel est disponible.');
    expect(result.dedupeKey).toBe('period-reminder:user_1:2026-09-21');
  });
});

describe('journalReminder', () => {
  it('builds the NORMAL copy with a dedupeKey keyed to today', () => {
    const result = journalReminder('user_1', 'NORMAL', new Date('2026-09-14'));
    expect(result).toEqual({
      userId: 'user_1',
      type: 'JOURNAL_REMINDER',
      title: 'Ton journal du jour',
      body: 'Comment te sens-tu aujourd’hui ?',
      dedupeKey: 'journal-reminder:user_1:2026-09-14',
    });
  });

  it('builds the DISCREET copy with a generic title', () => {
    const result = journalReminder('user_1', 'DISCREET', new Date('2026-09-14'));
    expect(result.title).toBe('NAWIRA');
    expect(result.body).toBe('Un rappel NAWIRA est disponible.');
  });
});

describe('weeklySummaryReady', () => {
  it('builds the NORMAL copy with a dedupeKey keyed to the given week', () => {
    const result = weeklySummaryReady('user_1', 'NORMAL', new Date('2026-09-14'));
    expect(result).toEqual({
      userId: 'user_1',
      type: 'WEEKLY_SUMMARY',
      title: 'Ton résumé est prêt',
      body: 'Ton résumé de cycle est prêt.',
      dedupeKey: 'weekly-summary:user_1:2026-09-14',
    });
  });

  it('builds the DISCREET copy with a generic title', () => {
    const result = weeklySummaryReady('user_1', 'DISCREET', new Date('2026-09-14'));
    expect(result.title).toBe('NAWIRA');
    expect(result.body).toBe('Ton nouveau résumé est disponible.');
  });
});

describe('fertilityWindowApproaching', () => {
  it('builds the NORMAL copy with a dedupeKey keyed to fertileWindowStart', () => {
    const result = fertilityWindowApproaching('user_1', 'NORMAL', new Date('2026-09-02'));
    expect(result).toEqual({
      userId: 'user_1',
      type: 'FERTILITY_REMINDER',
      title: 'Fenêtre fertile',
      body: 'Ta fenêtre fertile estimée approche.',
      dedupeKey: 'fertility-reminder:user_1:2026-09-02',
    });
  });

  it('builds the DISCREET copy with a generic title', () => {
    const result = fertilityWindowApproaching('user_1', 'DISCREET', new Date('2026-09-02'));
    expect(result.title).toBe('NAWIRA');
    expect(result.body).toBe('Un rappel Projet Bébé est disponible.');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/lib/server/notifications/templates.test.ts`
Expected: FAIL — `periodReminder`, `journalReminder`, `weeklySummaryReady`, `fertilityWindowApproaching` are not exported from `./templates` yet.

- [ ] **Step 3: Append the 4 template functions**

Add to the end of `frontend/src/lib/server/notifications/templates.ts` (after the existing `paymentReceived` function — do not modify `welcomeNotification` or `paymentReceived`):

```ts
/**
 * Phase 8 (E9, PRD §11 N01-N04) — 4 cron-driven notification templates.
 * `level` is the caller's already-resolved 'NORMAL' | 'DISCREET' choice
 * (never 'NONE' — callers must skip sending entirely for NONE, not call
 * these functions). In DISCREET mode the title is ALSO replaced with the
 * generic 'NAWIRA' — PRD §11: "Aucune donnée intime sur écran verrouillé
 * en mode discret."
 */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function periodReminder(
  userId: string,
  level: 'NORMAL' | 'DISCREET',
  expectedPeriodStart: Date,
): CreateNotificationInput {
  return {
    userId,
    type: 'PERIOD_REMINDER',
    title: level === 'DISCREET' ? 'NAWIRA' : 'Règles à venir',
    body:
      level === 'DISCREET'
        ? 'Ton rappel personnel est disponible.'
        : 'Tes règles sont estimées dans environ 3 jours.',
    dedupeKey: `period-reminder:${userId}:${isoDate(expectedPeriodStart)}`,
  };
}

export function journalReminder(
  userId: string,
  level: 'NORMAL' | 'DISCREET',
  today: Date,
): CreateNotificationInput {
  return {
    userId,
    type: 'JOURNAL_REMINDER',
    title: level === 'DISCREET' ? 'NAWIRA' : 'Ton journal du jour',
    body:
      level === 'DISCREET'
        ? 'Un rappel NAWIRA est disponible.'
        : 'Comment te sens-tu aujourd’hui ?',
    dedupeKey: `journal-reminder:${userId}:${isoDate(today)}`,
  };
}

export function weeklySummaryReady(
  userId: string,
  level: 'NORMAL' | 'DISCREET',
  weekOf: Date,
): CreateNotificationInput {
  return {
    userId,
    type: 'WEEKLY_SUMMARY',
    title: level === 'DISCREET' ? 'NAWIRA' : 'Ton résumé est prêt',
    body:
      level === 'DISCREET'
        ? 'Ton nouveau résumé est disponible.'
        : 'Ton résumé de cycle est prêt.',
    dedupeKey: `weekly-summary:${userId}:${isoDate(weekOf)}`,
  };
}

export function fertilityWindowApproaching(
  userId: string,
  level: 'NORMAL' | 'DISCREET',
  fertileWindowStart: Date,
): CreateNotificationInput {
  return {
    userId,
    type: 'FERTILITY_REMINDER',
    title: level === 'DISCREET' ? 'NAWIRA' : 'Fenêtre fertile',
    body:
      level === 'DISCREET'
        ? 'Un rappel Projet Bébé est disponible.'
        : 'Ta fenêtre fertile estimée approche.',
    dedupeKey: `fertility-reminder:${userId}:${isoDate(fertileWindowStart)}`,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/lib/server/notifications/templates.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm --filter frontend run typecheck && pnpm --filter frontend exec eslint --max-warnings=0 src/lib/server/notifications/templates.ts src/lib/server/notifications/templates.test.ts`
Expected: both clean

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/server/notifications/templates.ts frontend/src/lib/server/notifications/templates.test.ts
git commit -m "feat(notifications): add N01-N04 templates (Phase 8, E9)"
```

---

### Task 2: `triggers.ts` — pure trigger-condition functions

**Files:**
- Create: `frontend/src/lib/server/notifications/triggers.ts`
- Create: `frontend/src/lib/server/notifications/triggers.test.ts`

**Interfaces:**
- Consumes: `periodReminder`, `journalReminder`, `weeklySummaryReady`, `fertilityWindowApproaching` from `./templates` (Task 1); `CreateNotificationInput` type from `./index`; `addDays` from `../cycles/date-utils`.
- Produces: `ProfileRow` interface (`{ userId: string; notificationLevel: string; goal: string }`), `PredictionRow` interface (`{ userId: string; expectedPeriodStart: Date; fertileWindowStart: Date | null }`), and 4 functions — `checkPeriodReminder(profile: ProfileRow, prediction: PredictionRow | undefined, today: Date): CreateNotificationInput | null`, `checkJournalReminder(profile: ProfileRow, hasTodayLog: boolean, today: Date): CreateNotificationInput | null`, `checkWeeklySummary(profile: ProfileRow, eligible: boolean, today: Date): CreateNotificationInput | null`, `checkFertilityReminder(profile: ProfileRow, prediction: PredictionRow | undefined, today: Date): CreateNotificationInput | null`. Task 3's route imports all 4 functions plus both interfaces.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/server/notifications/triggers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  checkPeriodReminder,
  checkJournalReminder,
  checkWeeklySummary,
  checkFertilityReminder,
  type ProfileRow,
  type PredictionRow,
} from './triggers';

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    userId: 'user_1',
    notificationLevel: 'NORMAL',
    goal: 'PERIOD_TRACKING',
    ...overrides,
  };
}

const MONDAY = new Date('2026-09-14'); // confirmed UTC Monday
const TUESDAY = new Date('2026-09-15');

describe('checkPeriodReminder (N01)', () => {
  it('fires exactly on expectedPeriodStart - 3 days', () => {
    const prediction: PredictionRow = {
      userId: 'user_1',
      expectedPeriodStart: new Date('2026-09-21'),
      fertileWindowStart: null,
    };
    const result = checkPeriodReminder(profile(), prediction, new Date('2026-09-18'));
    expect(result?.dedupeKey).toBe('period-reminder:user_1:2026-09-21');
  });

  it('does not fire on J-2 or J-4', () => {
    const prediction: PredictionRow = {
      userId: 'user_1',
      expectedPeriodStart: new Date('2026-09-21'),
      fertileWindowStart: null,
    };
    expect(checkPeriodReminder(profile(), prediction, new Date('2026-09-19'))).toBeNull();
    expect(checkPeriodReminder(profile(), prediction, new Date('2026-09-17'))).toBeNull();
  });

  it('returns null when there is no prediction', () => {
    expect(checkPeriodReminder(profile(), undefined, new Date('2026-09-18'))).toBeNull();
  });

  it('returns null when notificationLevel is NONE', () => {
    const prediction: PredictionRow = {
      userId: 'user_1',
      expectedPeriodStart: new Date('2026-09-21'),
      fertileWindowStart: null,
    };
    const result = checkPeriodReminder(
      profile({ notificationLevel: 'NONE' }),
      prediction,
      new Date('2026-09-18'),
    );
    expect(result).toBeNull();
  });

  it('uses DISCREET copy when notificationLevel is DISCREET', () => {
    const prediction: PredictionRow = {
      userId: 'user_1',
      expectedPeriodStart: new Date('2026-09-21'),
      fertileWindowStart: null,
    };
    const result = checkPeriodReminder(
      profile({ notificationLevel: 'DISCREET' }),
      prediction,
      new Date('2026-09-18'),
    );
    expect(result?.title).toBe('NAWIRA');
  });
});

describe('checkJournalReminder (N02)', () => {
  it('fires when there is no DailyLog for today', () => {
    const result = checkJournalReminder(profile(), false, MONDAY);
    expect(result?.dedupeKey).toBe('journal-reminder:user_1:2026-09-14');
  });

  it('returns null when today is already logged', () => {
    expect(checkJournalReminder(profile(), true, MONDAY)).toBeNull();
  });

  it('returns null when notificationLevel is NONE', () => {
    expect(checkJournalReminder(profile({ notificationLevel: 'NONE' }), false, MONDAY)).toBeNull();
  });
});

describe('checkWeeklySummary (N03)', () => {
  it('fires on Monday when eligible', () => {
    const result = checkWeeklySummary(profile(), true, MONDAY);
    expect(result?.dedupeKey).toBe('weekly-summary:user_1:2026-09-14');
  });

  it('returns null on a non-Monday even when eligible', () => {
    expect(checkWeeklySummary(profile(), true, TUESDAY)).toBeNull();
  });

  it('returns null on Monday when not eligible', () => {
    expect(checkWeeklySummary(profile(), false, MONDAY)).toBeNull();
  });

  it('returns null when notificationLevel is NONE', () => {
    expect(checkWeeklySummary(profile({ notificationLevel: 'NONE' }), true, MONDAY)).toBeNull();
  });
});

describe('checkFertilityReminder (N04)', () => {
  it('fires for TRYING_TO_CONCEIVE on fertileWindowStart', () => {
    const prediction: PredictionRow = {
      userId: 'user_1',
      expectedPeriodStart: new Date('2026-09-21'),
      fertileWindowStart: new Date('2026-09-02'),
    };
    const result = checkFertilityReminder(
      profile({ goal: 'TRYING_TO_CONCEIVE' }),
      prediction,
      new Date('2026-09-02'),
    );
    expect(result?.dedupeKey).toBe('fertility-reminder:user_1:2026-09-02');
  });

  it('returns null for other goals even on fertileWindowStart', () => {
    const prediction: PredictionRow = {
      userId: 'user_1',
      expectedPeriodStart: new Date('2026-09-21'),
      fertileWindowStart: new Date('2026-09-02'),
    };
    const result = checkFertilityReminder(
      profile({ goal: 'PERIOD_TRACKING' }),
      prediction,
      new Date('2026-09-02'),
    );
    expect(result).toBeNull();
  });

  it('returns null when fertileWindowStart is null', () => {
    const prediction: PredictionRow = {
      userId: 'user_1',
      expectedPeriodStart: new Date('2026-09-21'),
      fertileWindowStart: null,
    };
    const result = checkFertilityReminder(
      profile({ goal: 'TRYING_TO_CONCEIVE' }),
      prediction,
      new Date('2026-09-02'),
    );
    expect(result).toBeNull();
  });

  it('returns null when today is not fertileWindowStart', () => {
    const prediction: PredictionRow = {
      userId: 'user_1',
      expectedPeriodStart: new Date('2026-09-21'),
      fertileWindowStart: new Date('2026-09-02'),
    };
    const result = checkFertilityReminder(
      profile({ goal: 'TRYING_TO_CONCEIVE' }),
      prediction,
      new Date('2026-09-03'),
    );
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/lib/server/notifications/triggers.test.ts`
Expected: FAIL — `./triggers` does not exist yet.

- [ ] **Step 3: Write `triggers.ts`**

Create `frontend/src/lib/server/notifications/triggers.ts`:

```ts
/**
 * Phase 8 (E9, PRD §11 N01-N04) — pure trigger-condition functions.
 *
 * No Prisma calls anywhere in this file. Each function takes plain,
 * already-fetched data + `today` and returns a `CreateNotificationInput`
 * ready for `createNotification`, or `null` if the trigger doesn't fire.
 * All I/O (fetching rows, calling createNotification) lives in the cron
 * route that calls these — see `frontend/src/app/api/cron/
 * notification-triggers/route.ts`.
 */
import { addDays } from '../cycles/date-utils';
import type { CreateNotificationInput } from './index';
import {
  periodReminder,
  journalReminder,
  weeklySummaryReady,
  fertilityWindowApproaching,
} from './templates';

export interface ProfileRow {
  userId: string;
  notificationLevel: string; // NORMAL | DISCREET | NONE
  goal: string;
}

export interface PredictionRow {
  userId: string;
  expectedPeriodStart: Date;
  fertileWindowStart: Date | null;
}

/** Resolves the caller-facing copy level, or `null` if the user opted out entirely. */
function levelFor(profile: ProfileRow): 'NORMAL' | 'DISCREET' | null {
  if (profile.notificationLevel === 'NONE') return null;
  return profile.notificationLevel === 'DISCREET' ? 'DISCREET' : 'NORMAL';
}

/** N01 — fires exactly on `expectedPeriodStart - 3 days`, not every day up to it. */
export function checkPeriodReminder(
  profile: ProfileRow,
  prediction: PredictionRow | undefined,
  today: Date,
): CreateNotificationInput | null {
  const level = levelFor(profile);
  if (!level || !prediction) return null;
  const reminderDate = addDays(prediction.expectedPeriodStart, -3);
  if (reminderDate.getTime() !== today.getTime()) return null;
  return periodReminder(profile.userId, level, prediction.expectedPeriodStart);
}

/** N02 — fires when today has no DailyLog row yet. */
export function checkJournalReminder(
  profile: ProfileRow,
  hasTodayLog: boolean,
  today: Date,
): CreateNotificationInput | null {
  const level = levelFor(profile);
  if (!level || hasTodayLog) return null;
  return journalReminder(profile.userId, level, today);
}

/** N03 — fires only on Monday (UTC) AND only when Insights eligibility is true. */
export function checkWeeklySummary(
  profile: ProfileRow,
  eligible: boolean,
  today: Date,
): CreateNotificationInput | null {
  const level = levelFor(profile);
  if (!level || !eligible) return null;
  if (today.getUTCDay() !== 1) return null;
  return weeklySummaryReady(profile.userId, level, today);
}

/** N04 — fires only for goal=TRYING_TO_CONCEIVE, exactly on fertileWindowStart. */
export function checkFertilityReminder(
  profile: ProfileRow,
  prediction: PredictionRow | undefined,
  today: Date,
): CreateNotificationInput | null {
  const level = levelFor(profile);
  if (!level || !prediction || !prediction.fertileWindowStart) return null;
  if (profile.goal !== 'TRYING_TO_CONCEIVE') return null;
  if (prediction.fertileWindowStart.getTime() !== today.getTime()) return null;
  return fertilityWindowApproaching(profile.userId, level, prediction.fertileWindowStart);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/lib/server/notifications/triggers.test.ts`
Expected: PASS (16 tests)

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm --filter frontend run typecheck && pnpm --filter frontend exec eslint --max-warnings=0 src/lib/server/notifications/triggers.ts src/lib/server/notifications/triggers.test.ts`
Expected: both clean

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/server/notifications/triggers.ts frontend/src/lib/server/notifications/triggers.test.ts
git commit -m "feat(notifications): add N01-N04 pure trigger conditions (Phase 8, E9)"
```

---

### Task 3: `POST /api/cron/notification-triggers` — the daily cron

**Files:**
- Create: `frontend/src/app/api/cron/notification-triggers/route.ts`
- Create: `frontend/src/app/api/cron/notification-triggers/route.test.ts`
- Modify: `frontend/vercel.json`

**Interfaces:**
- Consumes: `checkPeriodReminder`, `checkJournalReminder`, `checkWeeklySummary`, `checkFertilityReminder`, `ProfileRow`, `PredictionRow` from `../../../../lib/server/notifications/triggers` (Task 2); `createNotification` from `../../../../lib/server/notifications`; `deriveInsights`, `InsightsInput` from `../../../../lib/server/insights/compute-insights` (already exists, Phase 6); `todayUtcDate` from `../../../../lib/server/cycles/date-utils`; `verifyCronSecret` from `../../../../lib/server/cron/auth`; `withLease` from `../../../../lib/server/leader-lease`.
- Produces: the route handler itself (nothing downstream consumes it — this is the last task in the plan).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/cron/notification-triggers/route.test.ts`:

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/cron/auth', () => ({ verifyCronSecret: vi.fn(() => null) }));
vi.mock('@/lib/server/leader-lease', () => ({
  withLease: vi.fn(async (_r: unknown, _n: string, _t: number, fn: () => Promise<void>) => fn()),
}));
vi.mock('@/lib/server/redis', () => ({ redis: null }));

import { verifyCronSecret } from '@/lib/server/cron/auth';

function makeReq(): NextRequest {
  return new NextRequest('http://localhost/api/cron/notification-triggers', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
  });
}

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  // Defensive defaults for the Monday-only per-user Insights branch (Task
  // 3's route calls prisma.cycle.findMany/prisma.periodEvent.findMany
  // ONLY when today.getUTCDay() === 1 — which is true on whatever real
  // day this suite happens to run on a Monday). Every test below stubs
  // its own profile/prediction/dailyLog expectations; these two stay a
  // safe empty default so the suite is deterministic regardless of the
  // real calendar day the CI runs on.
  prismaMock.cycle.findMany.mockResolvedValue([]);
  prismaMock.periodEvent.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/cron/notification-triggers', () => {
  it('returns 401 when verifyCronSecret fails', async () => {
    (verifyCronSecret as Mock).mockReturnValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it('sends a period reminder for a profile exactly 3 days before its predicted period, and skips a profile with no prediction', async () => {
    prismaMock.profile.findMany.mockResolvedValue([
      { userId: 'u1', notificationLevel: 'NORMAL', goal: 'PERIOD_TRACKING' },
      { userId: 'u2', notificationLevel: 'NORMAL', goal: 'PERIOD_TRACKING' },
    ] as never);
    prismaMock.prediction.findMany.mockResolvedValue([
      {
        userId: 'u1',
        expectedPeriodStart: addDaysUtc(todayForTest(), 3),
        fertileWindowStart: null,
      },
    ] as never);
    prismaMock.dailyLog.findMany.mockResolvedValue([]);
    prismaMock.notification.create.mockImplementation(
      (args: never) => Promise.resolve({ id: 'n1', ...(args as { data: object }).data }) as never,
    );

    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);

    const calls = prismaMock.notification.create.mock.calls.map(
      (c) => (c[0] as { data: { dedupeKey: string } }).data.dedupeKey,
    );
    expect(calls.some((k) => k.startsWith('period-reminder:u1:'))).toBe(true);
    expect(calls.some((k) => k.startsWith('period-reminder:u2:'))).toBe(false);
  });

  it('sends a journal reminder only for profiles without a DailyLog today', async () => {
    prismaMock.profile.findMany.mockResolvedValue([
      { userId: 'u1', notificationLevel: 'NORMAL', goal: 'PERIOD_TRACKING' },
      { userId: 'u2', notificationLevel: 'NORMAL', goal: 'PERIOD_TRACKING' },
    ] as never);
    prismaMock.prediction.findMany.mockResolvedValue([]);
    prismaMock.dailyLog.findMany.mockResolvedValue([{ userId: 'u2' }] as never);
    prismaMock.notification.create.mockImplementation(
      (args: never) => Promise.resolve({ id: 'n1', ...(args as { data: object }).data }) as never,
    );

    const { POST } = await import('./route');
    await POST(makeReq());

    const calls = prismaMock.notification.create.mock.calls.map(
      (c) => (c[0] as { data: { dedupeKey: string } }).data.dedupeKey,
    );
    expect(calls.some((k) => k.startsWith('journal-reminder:u1:'))).toBe(true);
    expect(calls.some((k) => k.startsWith('journal-reminder:u2:'))).toBe(false);
  });

  it('never sends anything to a profile with notificationLevel NONE', async () => {
    prismaMock.profile.findMany.mockResolvedValue([] as never); // NONE profiles excluded by the query itself
    prismaMock.prediction.findMany.mockResolvedValue([]);
    prismaMock.dailyLog.findMany.mockResolvedValue([]);

    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(await res.json()).toMatchObject({ ok: true, sent: 0 });
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
    expect(prismaMock.profile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { notificationLevel: { not: 'NONE' } } }),
    );
  });

  it('returns processed=sent count reflecting successful creates only', async () => {
    prismaMock.profile.findMany.mockResolvedValue([
      { userId: 'u1', notificationLevel: 'NORMAL', goal: 'PERIOD_TRACKING' },
    ] as never);
    prismaMock.prediction.findMany.mockResolvedValue([]);
    prismaMock.dailyLog.findMany.mockResolvedValue([]); // u1 has no log today -> journal reminder fires
    prismaMock.notification.create.mockResolvedValueOnce(null as never); // dedupeKey collision -> no-op

    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(await res.json()).toEqual({ ok: true, sent: 0 });
  });
});

function todayForTest(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
```

Note: the second test computes `expectedPeriodStart` relative to the real "today" at test-run time (`todayForTest() + 3 days`) rather than a hardcoded date, so the test stays correct regardless of which day it runs — mirrors how `checkPeriodReminder`'s own unit tests (Task 2) use fixed dates only because they pass `today` explicitly, whereas this route test lets the route call the real `todayUtcDate()` internally.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/cron/notification-triggers/route.test.ts`
Expected: FAIL — `./route` does not exist yet.

- [ ] **Step 3: Write the route**

Create `frontend/src/app/api/cron/notification-triggers/route.ts`:

```ts
// POST /api/cron/notification-triggers — Phase 8 (E9, PRD §11 N01-N04).
//
// Daily cron (18:00 UTC — Sénégal, the PRD pilot market, is UTC+0
// year-round, so this is genuinely 18:00 Dakar time). Checks all 4
// notification triggers for every profile that hasn't opted out
// entirely (notificationLevel != NONE). N01/N02/N04 use batched
// queries (no N+1). N03 (weekly summary) additionally needs each
// profile's full Insights eligibility, computed the same way
// GET /api/insights does — that per-user fan-out only runs on Mondays.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createLogger } from '@/lib/server/logger';
import {
  makeRequestContext,
  withRequestContext,
} from '@/lib/server/observability/request-context';
import { todayUtcDate } from '@/lib/server/cycles/date-utils';
import { createNotification } from '@/lib/server/notifications';
import {
  checkPeriodReminder,
  checkJournalReminder,
  checkWeeklySummary,
  checkFertilityReminder,
  type ProfileRow,
  type PredictionRow,
} from '@/lib/server/notifications/triggers';
import { deriveInsights, type InsightsInput } from '@/lib/server/insights/compute-insights';

const log = createLogger();
const LEASE_TTL_MS = 120_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let sent = 0;

    await withLease(redis ?? undefined, 'notification-triggers', LEASE_TTL_MS, async () => {
      const today = todayUtcDate();

      const profiles: ProfileRow[] = await prisma.profile.findMany({
        where: { notificationLevel: { not: 'NONE' } },
        select: { userId: true, notificationLevel: true, goal: true },
      });

      if (profiles.length === 0) {
        log.info('notification-triggers tick: no eligible profiles', {
          requestId: ctx.requestId,
        });
        return;
      }

      const userIds = profiles.map((p) => p.userId);

      const [predictionRows, todayLogRows] = await Promise.all([
        prisma.prediction.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, expectedPeriodStart: true, fertileWindowStart: true },
        }),
        prisma.dailyLog.findMany({
          where: { userId: { in: userIds }, date: today },
          select: { userId: true },
        }),
      ]);

      const predictionByUser = new Map<string, PredictionRow>(
        predictionRows.map((p) => [p.userId, p]),
      );
      const loggedTodayUsers = new Set(todayLogRows.map((l) => l.userId));
      const isMonday = today.getUTCDay() === 1;

      for (const profile of profiles) {
        const prediction = predictionByUser.get(profile.userId);
        const hasTodayLog = loggedTodayUsers.has(profile.userId);

        const toSend = [
          checkPeriodReminder(profile, prediction, today),
          checkJournalReminder(profile, hasTodayLog, today),
          checkFertilityReminder(profile, prediction, today),
        ];

        if (isMonday) {
          const [cycles, dailyLogs, periodEvents] = await Promise.all([
            prisma.cycle.findMany({
              where: { userId: profile.userId },
              orderBy: { startDate: 'asc' },
              select: { startDate: true, endDate: true, length: true, isOutlier: true },
            }),
            prisma.dailyLog.findMany({
              where: { userId: profile.userId },
              orderBy: { date: 'asc' },
              include: { symptoms: true },
            }),
            prisma.periodEvent.findMany({
              where: { userId: profile.userId },
              orderBy: { date: 'asc' },
              select: { date: true },
            }),
          ]);

          const insightsInput: InsightsInput = {
            cycles,
            dailyLogs: dailyLogs.map((l) => ({
              date: l.date,
              mood: l.mood,
              energy: l.energy,
              sleepQuality: l.sleepQuality,
              painLevel: l.painLevel,
              symptoms: l.symptoms.map((s) => s.symptom),
            })),
            periodEventDates: periodEvents.map((e) => e.date),
          };

          const { eligible } = deriveInsights(insightsInput);
          toSend.push(checkWeeklySummary(profile, eligible, today));
        }

        for (const input of toSend) {
          if (!input) continue;
          const created = await createNotification(prisma, input);
          if (created) sent += 1;
        }
      }

      log.info('notification-triggers tick', {
        sent,
        profiles: profiles.length,
        requestId: ctx.requestId,
      });
    });

    return NextResponse.json({ ok: true, sent }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 4: Add the cron schedule**

Modify `frontend/vercel.json` — add one entry to the `crons` array (after the existing 6, keeping the array alphabetically-unordered-but-consistent with how the others were appended over time):

```json
{
  "crons": [
    { "path": "/api/cron/outbox-drain", "schedule": "*/1 * * * *" },
    { "path": "/api/cron/email-queue-drain", "schedule": "*/1 * * * *" },
    { "path": "/api/cron/verification-cleanup", "schedule": "0 * * * *" },
    { "path": "/api/cron/order-expiration", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/webhook-log-purge", "schedule": "0 0 * * *" },
    { "path": "/api/cron/email-job-purge", "schedule": "0 0 * * *" },
    { "path": "/api/cron/notification-triggers", "schedule": "0 18 * * *" }
  ]
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/cron/notification-triggers/route.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Run the full test suite, typecheck, lint, format, build**

Run: `pnpm --filter frontend run format && pnpm --filter frontend run lint && pnpm --filter frontend run typecheck && pnpm --filter frontend exec vitest run && pnpm --filter frontend run build`
Expected: all green. The full suite must still pass (no existing test touched or broken by this phase).

- [ ] **Step 7: Update root STATUS-equivalent tracking (this project's `.planning/banani/STATUS.md` only tracks UI screens — no UI ships this phase, so nothing to update there). No CLAUDE.md changes needed (no new invariant, no new protected file).**

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/api/cron/notification-triggers/route.ts frontend/src/app/api/cron/notification-triggers/route.test.ts frontend/vercel.json
git commit -m "feat(notifications): daily cron for N01-N04 triggers (Phase 8, E9)"
```

---

## Post-implementation note for whoever runs this plan

This phase ships zero UI and zero migration — verification is entirely
`pnpm test`/`typecheck`/`lint`/`build` green, plus (optional, manual) a
real invocation: `curl -X POST http://localhost:3000/api/cron/notification-triggers -H "Authorization: Bearer $CRON_SECRET"`
against a seeded dev DB with at least one `Profile.notificationLevel !=
NONE` row and a `Prediction` whose `expectedPeriodStart` is exactly 3
days out, confirming a real `Notification` row appears (e.g. via Prisma
Studio or the `NotificationBell` UI, which needs no changes to render
it).
