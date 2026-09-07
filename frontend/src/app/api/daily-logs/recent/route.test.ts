import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'u1', email: 'a@b.com' } })),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/daily-logs/recent', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } });
});

describe('GET /api/daily-logs/recent', () => {
  it('returns the last 3 logs before today, most recent first', async () => {
    prismaMock.dailyLog.findMany.mockResolvedValue([
      {
        id: 'l1',
        userId: 'u1',
        date: new Date('2026-09-17'),
        painLevel: null,
        painLocation: null,
        mood: 'GOOD',
        energy: null,
        sleepQuality: null,
        sleepHours: null,
        note: null,
        symptoms: [{ id: 's1', dailyLogId: 'l1', symptom: 'FATIGUE' }],
      },
      {
        id: 'l2',
        userId: 'u1',
        date: new Date('2026-09-16'),
        painLevel: null,
        painLocation: null,
        mood: 'TIRED',
        energy: null,
        sleepQuality: null,
        sleepHours: null,
        note: null,
        symptoms: [],
      },
    ] as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      entries: { date: string; mood: string | null; symptoms: string[] }[];
    };
    expect(body.entries).toEqual([
      { date: '2026-09-17', mood: 'GOOD', symptoms: ['FATIGUE'] },
      { date: '2026-09-16', mood: 'TIRED', symptoms: [] },
    ]);
    expect(prismaMock.dailyLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', date: { lt: expect.any(Date) } },
        orderBy: { date: 'desc' },
        take: 3,
      }),
    );
  });

  it('returns an empty array when there are no prior logs', async () => {
    prismaMock.dailyLog.findMany.mockResolvedValue([]);

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
