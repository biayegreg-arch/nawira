import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Prisma's `groupBy` is a heavily-overloaded generic function; vitest-mock-extended
// can't attach `.mockResolvedValue`/`.mockImplementation` to it directly. Cast once
// to a plain mock function type for test-only use.
const groupByMock = prismaMock.analyticsEvent.groupBy as unknown as Mock;

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);

const adminCtx = {
  user: { sub: 'admin-1', email: 'admin@test.local' },
  admin: { id: 'admin-1', email: 'admin@test.local', role: 'ADMIN' as const },
};

function makeGet(query = ''): NextRequest {
  return new NextRequest(`http://test/api/admin/analytics/overview${query}`, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
  groupByMock.mockResolvedValue([] as never);
});

describe('GET /api/admin/analytics/overview', () => {
  it('returns real event counts per type, defaulting missing types to 0', async () => {
    groupByMock.mockImplementation((args: unknown) => {
      const a = args as { by: string[]; where: { createdAt: { gte: Date } } };
      if (a.by[0] === 'userId')
        return Promise.resolve([{ userId: 'u1' }, { userId: 'u2' }]) as never;
      // First groupBy call (current window) returns real counts; the
      // previous-window call gets an empty result via the beforeEach default.
      return Promise.resolve([
        { type: 'period_logged', _count: { _all: 42 } },
        { type: 'onboarding_started', _count: { _all: 10 } },
      ]) as never;
    });

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.eventCounts.period_logged).toBe(42);
    expect(body.eventCounts.onboarding_started).toBe(10);
    // A declared-but-never-fired event type reads a real 0, not undefined.
    expect(body.eventCounts.checkout_started).toBe(0);
    expect(body.activeUsers).toBe(2);
  });

  it('computes an honest onboarding funnel with null rates when the denominator is 0', async () => {
    groupByMock.mockResolvedValue([] as never);

    const res = await GET(makeGet());
    const body = await res.json();

    expect(body.onboardingFunnel).toEqual({
      started: 0,
      goalSelected: 0,
      completed: 0,
      startedToGoalRate: null,
      goalToCompletedRate: null,
      startedToCompletedRate: null,
    });
  });

  it('computes real conversion rates when the funnel has data', async () => {
    groupByMock.mockImplementation((args: unknown) => {
      const a = args as { by: string[] };
      if (a.by[0] === 'userId') return Promise.resolve([]) as never;
      return Promise.resolve([
        { type: 'onboarding_started', _count: { _all: 100 } },
        { type: 'goal_selected', _count: { _all: 60 } },
        { type: 'onboarding_completed', _count: { _all: 30 } },
      ]) as never;
    });

    const res = await GET(makeGet());
    const body = await res.json();

    expect(body.onboardingFunnel).toMatchObject({
      started: 100,
      goalSelected: 60,
      completed: 30,
      startedToGoalRate: 0.6,
      goalToCompletedRate: 0.5,
      startedToCompletedRate: 0.3,
    });
  });

  it('clamps an out-of-range ?days= to [1, 90] and defaults to 30 when absent/invalid', async () => {
    await GET(makeGet());
    let body = await (await GET(makeGet())).json();
    expect(body.windowDays).toBe(30);

    body = await (await GET(makeGet('?days=500'))).json();
    expect(body.windowDays).toBe(90);

    body = await (await GET(makeGet('?days=0'))).json();
    expect(body.windowDays).toBe(1);

    body = await (await GET(makeGet('?days=not-a-number'))).json();
    expect(body.windowDays).toBe(30);
  });

  it('propagates 403 from requireAdmin before touching Prisma', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json(
        { error: 'ADMIN_REQUIRED', message: 'Admin access required' },
        { status: 403 },
      ),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
    expect(groupByMock).not.toHaveBeenCalled();
  });

  it('propagates 429 from the rate limiter before touching Prisma', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(429);
    expect(groupByMock).not.toHaveBeenCalled();
  });
});
