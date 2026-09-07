import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'u1', email: 'a@b.com' } })),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/fertility-signals/recent', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } });
});

describe('GET /api/fertility-signals/recent', () => {
  it('returns the last 3 LH_TEST signals before today, most recent first', async () => {
    prismaMock.fertilitySignal.findMany.mockResolvedValue([
      { date: new Date('2026-09-17'), lhResult: 'POSITIVE' },
      { date: new Date('2026-09-16'), lhResult: 'NEGATIVE' },
    ] as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: { date: string; lhResult: string }[] };
    expect(body.entries).toEqual([
      { date: '2026-09-17', lhResult: 'POSITIVE' },
      { date: '2026-09-16', lhResult: 'NEGATIVE' },
    ]);
    expect(prismaMock.fertilitySignal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', type: 'LH_TEST', date: { lt: expect.any(Date) } },
        orderBy: { date: 'desc' },
        take: 3,
      }),
    );
  });

  it('returns an empty array when there are no prior LH tests', async () => {
    prismaMock.fertilitySignal.findMany.mockResolvedValue([]);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ entries: [] });
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 }),
    );

    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });
});
