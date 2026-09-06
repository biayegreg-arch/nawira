import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'u1', email: 'a@b.com' } })),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/cycles', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } });
});

describe('GET /api/cycles', () => {
  it('returns cycles sorted startDate desc with todayLogged=false when none logged today', async () => {
    prismaMock.cycle.findMany.mockResolvedValue([
      {
        startDate: new Date('2026-02-01'),
        endDate: null,
        length: null,
        isOutlier: false,
      },
      {
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
        length: 31,
        isOutlier: true,
      },
    ] as never);
    prismaMock.periodEvent.findUnique.mockResolvedValue(null);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      cycles: [
        { startDate: '2026-02-01', endDate: null, length: null, isOutlier: false },
        { startDate: '2026-01-01', endDate: '2026-01-31', length: 31, isOutlier: true },
      ],
      todayLogged: false,
    });

    expect(prismaMock.cycle.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { startDate: 'desc' },
      select: { startDate: true, endDate: true, length: true, isOutlier: true },
    });
  });

  it('returns todayLogged=true when a PeriodEvent exists for today', async () => {
    prismaMock.cycle.findMany.mockResolvedValue([]);
    prismaMock.periodEvent.findUnique.mockResolvedValue({ userId: 'u1' } as never);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.todayLogged).toBe(true);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });
});
