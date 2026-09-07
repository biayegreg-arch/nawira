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
import { GET, PATCH } from './route';

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/profile', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGetReq(): NextRequest {
  return new NextRequest('http://test/api/profile', { method: 'GET' });
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

describe('GET /api/profile', () => {
  it('returns profile fields and derived stats', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      userId: 'u1',
      birthDate: new Date('1995-04-12'),
      goal: 'UNDERSTAND_CYCLE',
      usualCycleLength: 28,
      usualPeriodLength: 5,
      trackedConcerns: ['PAIN', 'MOOD'],
      notificationLevel: 'NORMAL',
      createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    } as never);
    prismaMock.periodEvent.count.mockResolvedValue(12 as never);
    prismaMock.cycle.count.mockResolvedValue(3 as never);

    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.birthDate).toBe('1995-04-12');
    expect(body.profile.goal).toBe('UNDERSTAND_CYCLE');
    expect(body.profile.trackedConcerns).toEqual(['PAIN', 'MOOD']);
    expect(body.stats.daysTracked).toBe(12);
    expect(body.stats.cyclesCompleted).toBe(3);
    expect(body.stats.monthsActive).toBeGreaterThanOrEqual(2);
  });

  it('returns 404 PROFILE_NOT_FOUND when no Profile exists yet', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);
    prismaMock.periodEvent.count.mockResolvedValue(0 as never);
    prismaMock.cycle.count.mockResolvedValue(0 as never);

    const res = await GET(makeGetReq());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('PROFILE_NOT_FOUND');
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
