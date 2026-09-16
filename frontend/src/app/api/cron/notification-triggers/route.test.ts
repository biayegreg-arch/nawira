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
