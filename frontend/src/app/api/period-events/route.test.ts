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
});

describe('POST /api/period-events', () => {
  it('upserts a PeriodEvent for today with the default flow MEDIUM and triggers recompute', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

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
});
