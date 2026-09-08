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
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** Sends `raw` verbatim — used to exercise a body that is not valid JSON at all. */
function makeRawReq(raw: string): NextRequest {
  return new NextRequest('http://test/api/period-events', {
    method: 'POST',
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
  prismaMock.periodEvent.upsert.mockResolvedValue({} as never);
  prismaMock.profile.findUnique.mockResolvedValue({ userId: 'u1' } as never);
});

describe('POST /api/period-events', () => {
  it('upserts a PeriodEvent for today with the default flow MEDIUM and triggers recompute', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, daysLogged: 1 });

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

  it('rejects a malformed JSON body with VALIDATION_FAILED', async () => {
    const res = await POST(makeRawReq('not json'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.periodEvent.upsert).not.toHaveBeenCalled();
    expect(recomputeCyclesAndPrediction).not.toHaveBeenCalled();
  });

  it('returns 404 PROFILE_NOT_FOUND when the user never completed onboarding', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);

    const res = await POST(makeReq({}));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('PROFILE_NOT_FOUND');
    expect(prismaMock.periodEvent.upsert).not.toHaveBeenCalled();
    expect(recomputeCyclesAndPrediction).not.toHaveBeenCalled();
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

  describe('date-range backfill (startDate + endDate)', () => {
    it('upserts one PeriodEvent per day in the inclusive range and recomputes once', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-10T12:00:00Z'));

      const res = await POST(
        makeReq({ startDate: '2026-01-01', endDate: '2026-01-03', flow: 'LIGHT' }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true, daysLogged: 3 });
      expect(prismaMock.periodEvent.upsert).toHaveBeenCalledTimes(3);
      const dates = prismaMock.periodEvent.upsert.mock.calls.map((call) =>
        (call[0].create as { date: Date }).date.toISOString().slice(0, 10),
      );
      expect(dates).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
      expect(
        prismaMock.periodEvent.upsert.mock.calls.every((call) => call[0].create?.flow === 'LIGHT'),
      ).toBe(true);
      expect(recomputeCyclesAndPrediction).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('rejects a startDate after endDate', async () => {
      const res = await POST(makeReq({ startDate: '2026-01-05', endDate: '2026-01-01' }));
      expect(res.status).toBe(400);
      expect(prismaMock.periodEvent.upsert).not.toHaveBeenCalled();
    });

    it('rejects an endDate in the future', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-10T12:00:00Z'));

      const res = await POST(makeReq({ startDate: '2026-01-05', endDate: '2026-01-20' }));
      expect(res.status).toBe(400);
      expect(prismaMock.periodEvent.upsert).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('rejects a range longer than 14 days', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-02-01T12:00:00Z'));

      const res = await POST(makeReq({ startDate: '2026-01-01', endDate: '2026-01-16' }));
      expect(res.status).toBe(400);
      expect(prismaMock.periodEvent.upsert).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('rejects startDate without endDate', async () => {
      const res = await POST(makeReq({ startDate: '2026-01-01' }));
      expect(res.status).toBe(400);
      expect(prismaMock.periodEvent.upsert).not.toHaveBeenCalled();
    });

    it('rejects an unparseable date string', async () => {
      const res = await POST(makeReq({ startDate: 'not-a-date', endDate: '2026-01-01' }));
      expect(res.status).toBe(400);
      expect(prismaMock.periodEvent.upsert).not.toHaveBeenCalled();
    });
  });
});
