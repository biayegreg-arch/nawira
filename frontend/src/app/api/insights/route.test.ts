import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'u1', email: 'a@b.com' } })),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/insights', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } });
  prismaMock.cycle.findMany.mockResolvedValue([]);
  prismaMock.dailyLog.findMany.mockResolvedValue([]);
  prismaMock.periodEvent.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/insights', () => {
  it('returns eligible:false with all-zero meta for a user with no data (never 404)', async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      eligible: false,
      cycleScoreToday: null,
      insights: [],
      meta: { completeCyclesAnalyzed: 0, dailyLogsAnalyzed: 0 },
    });
  });

  it('queries cycles, dailyLogs (with symptoms), and periodEvents scoped to the authenticated user, ascending by date', async () => {
    await GET(makeReq());

    expect(prismaMock.cycle.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { startDate: 'asc' },
      select: { startDate: true, endDate: true, length: true, isOutlier: true },
    });
    expect(prismaMock.dailyLog.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { date: 'asc' },
      include: { symptoms: true },
    });
    expect(prismaMock.periodEvent.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
  });

  it('maps DailyLog + SymptomLog rows into the shape compute-insights expects and returns a real cycleScoreToday', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T12:00:00Z'));

    prismaMock.dailyLog.findMany.mockResolvedValue([
      {
        id: 'dl1',
        userId: 'u1',
        date: new Date('2026-02-01'),
        painLevel: null,
        painLocation: null,
        mood: 'GOOD',
        energy: 'HIGH',
        sleepQuality: null,
        sleepHours: null,
        note: null,
        symptoms: [],
      },
    ] as never);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.cycleScoreToday).toBe(75); // mood GOOD=75, energy HIGH=75, average=75
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });
});
