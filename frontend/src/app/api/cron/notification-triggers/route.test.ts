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

// Fixed clock: 2026-09-15T12:00:00Z is a confirmed UTC Tuesday (verified via
// `node -e "new Date('2026-09-15T12:00:00Z').getUTCDay()"` -> 2). Pinning the
// clock makes todayUtcDate() deterministic for every test below, so the
// Monday-only per-user Insights fan-out (route.ts's `if (isMonday)` block)
// never executes here unless a test explicitly re-pins to a Monday. This
// replaces the old "defensive" cycle.findMany/periodEvent.findMany stubs
// that were needed only because the suite's clock used to float with the
// real calendar day — those stubs are removed below since the Monday branch
// is now only reached by the tests that opt into it explicitly.
const FIXED_TUESDAY = new Date('2026-09-15T12:00:00Z');
const FIXED_MONDAY = new Date('2026-09-14T12:00:00Z');

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_TUESDAY);
});

afterEach(() => {
  vi.useRealTimers();
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
    prismaMock.notificationPreferences.findMany.mockResolvedValue([]);
    prismaMock.notification.create.mockImplementation(
      (args: unknown) => Promise.resolve({ id: 'n1', ...(args as { data: object }).data }) as never,
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
    prismaMock.notificationPreferences.findMany.mockResolvedValue([]);
    prismaMock.notification.create.mockImplementation(
      (args: unknown) => Promise.resolve({ id: 'n1', ...(args as { data: object }).data }) as never,
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
    prismaMock.notificationPreferences.findMany.mockResolvedValue([]);

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
    prismaMock.notificationPreferences.findMany.mockResolvedValue([]);
    prismaMock.notification.create.mockResolvedValueOnce(null as never); // dedupeKey collision -> no-op

    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(await res.json()).toEqual({ ok: true, sent: 0, failed: 0 });
  });

  it('on a Monday, sends a weekly summary and a fertility reminder for eligible profiles', async () => {
    vi.setSystemTime(FIXED_MONDAY);
    const monday = todayForTest();

    prismaMock.profile.findMany.mockResolvedValue([
      { userId: 'u1', notificationLevel: 'NORMAL', goal: 'TRYING_TO_CONCEIVE' },
    ] as never);
    prismaMock.prediction.findMany.mockResolvedValue([
      { userId: 'u1', expectedPeriodStart: addDaysUtc(monday, 20), fertileWindowStart: monday },
    ] as never);
    prismaMock.notificationPreferences.findMany.mockResolvedValue([]);

    // Two DIFFERENT call shapes hit dailyLog.findMany: the batched "today"
    // check (select: { userId: true }) and the per-profile full-history
    // fetch (include: { symptoms: true }) inside the Monday fan-out. Branch
    // on the query shape so both call sites get correct, minimal data.
    prismaMock.dailyLog.findMany.mockImplementation((args) => {
      const isFullHistory = Boolean(
        (args as { include?: { symptoms?: boolean } })?.include?.symptoms,
      );
      return Promise.resolve(isFullHistory ? [] : []) as never;
    });

    // Minimal eligible fixture per compute-insights.ts: 2 COMPLETE cycles
    // (endDate + length set) alone push an AVG_CYCLE_LENGTH insight, which
    // makes deriveInsights(...).eligible === true — no daily logs needed.
    prismaMock.cycle.findMany.mockResolvedValue([
      {
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-05'),
        length: 28,
        isOutlier: false,
      },
      {
        startDate: new Date('2026-07-29'),
        endDate: new Date('2026-08-02'),
        length: 28,
        isOutlier: false,
      },
    ] as never);
    prismaMock.periodEvent.findMany.mockResolvedValue([]);

    prismaMock.notification.create.mockImplementation(
      (args: unknown) => Promise.resolve({ id: 'n1', ...(args as { data: object }).data }) as never,
    );

    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);

    const calls = prismaMock.notification.create.mock.calls.map(
      (c) => (c[0] as { data: { dedupeKey: string } }).data.dedupeKey,
    );
    expect(calls.some((k) => k.startsWith('weekly-summary:u1:'))).toBe(true);
    expect(calls.some((k) => k.startsWith('fertility-reminder:u1:'))).toBe(true);
  });

  it('isolates a per-profile failure: other profiles still get processed and the response reports both sent and failed', async () => {
    prismaMock.profile.findMany.mockResolvedValue([
      { userId: 'u1', notificationLevel: 'NORMAL', goal: 'PERIOD_TRACKING' },
      { userId: 'u2', notificationLevel: 'NORMAL', goal: 'PERIOD_TRACKING' },
    ] as never);
    prismaMock.prediction.findMany.mockResolvedValue([]);
    prismaMock.dailyLog.findMany.mockResolvedValue([]); // neither has a log today -> journal reminder fires for both
    prismaMock.notificationPreferences.findMany.mockResolvedValue([]);

    // u1's create throws (simulates a non-P2002 error createNotification
    // re-throws by design); u2's create succeeds.
    prismaMock.notification.create.mockImplementation((args: unknown) => {
      const userId = (args as { data: { userId: string } }).data.userId;
      if (userId === 'u1') return Promise.reject(new Error('transient DB error')) as never;
      return Promise.resolve({ id: 'n2', ...(args as { data: object }).data }) as never;
    });

    const { POST } = await import('./route');
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, sent: 1, failed: 1 });

    const calls = prismaMock.notification.create.mock.calls.map(
      (c) => (c[0] as { data: { dedupeKey: string } }).data.dedupeKey,
    );
    expect(calls.some((k) => k.startsWith('journal-reminder:u2:'))).toBe(true);
  });

  it('respects an explicit per-category opt-out (NotificationPreferences.inApp=false) for that event type only', async () => {
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
    // Neither user has a log today -> both are candidates for a journal
    // reminder; u1 also gets a period reminder (J-3). u1 explicitly opted
    // out of JOURNAL_REMINDER's inApp channel; u2 has no prefs row at all
    // (must behave exactly as today: everything enabled).
    prismaMock.dailyLog.findMany.mockResolvedValue([]);
    prismaMock.notificationPreferences.findMany.mockResolvedValue([
      { userId: 'u1', prefs: { JOURNAL_REMINDER: { inApp: false } } },
    ] as never);
    prismaMock.notification.create.mockImplementation(
      (args: unknown) => Promise.resolve({ id: 'n1', ...(args as { data: object }).data }) as never,
    );

    const { POST } = await import('./route');
    await POST(makeReq());

    const calls = prismaMock.notification.create.mock.calls.map(
      (c) => (c[0] as { data: { dedupeKey: string } }).data.dedupeKey,
    );
    // u1: period reminder still fires (opt-out was scoped to JOURNAL_REMINDER only)
    expect(calls.some((k) => k.startsWith('period-reminder:u1:'))).toBe(true);
    // u1: journal reminder suppressed by the explicit opt-out
    expect(calls.some((k) => k.startsWith('journal-reminder:u1:'))).toBe(false);
    // u2: no prefs row at all -> default-enabled, journal reminder still fires
    expect(calls.some((k) => k.startsWith('journal-reminder:u2:'))).toBe(true);
  });
});

function todayForTest(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
