// ADMIN-PRICING — GET /api/admin/pricing-plans (read access for ADMIN + SUPERADMIN).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

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
  user: { sub: 'admin_1', email: 'admin@test.local' },
  admin: { id: 'admin_1', email: 'admin@test.local', role: 'ADMIN' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/admin/pricing-plans', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('GET /api/admin/pricing-plans', () => {
  it('returns both plans with resolved updatedBy email', async () => {
    prismaMock.pricingPlan.findMany.mockResolvedValueOnce([
      {
        id: 'p1',
        key: 'PLUS',
        priceFcfa: 1000,
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedBy: 'admin_1',
      },
      {
        id: 'p2',
        key: 'BABY',
        priceFcfa: 2500,
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedBy: null,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: 'admin_1', email: 'admin@test.local' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      plans: Array<{ key: string; priceFcfa: number; updatedBy: string | null }>;
    };
    expect(body.plans).toEqual([
      expect.objectContaining({ key: 'PLUS', priceFcfa: 1000, updatedBy: 'admin@test.local' }),
      expect.objectContaining({ key: 'BABY', priceFcfa: 2500, updatedBy: null }),
    ]);
  });

  it('403s a plain USER (requireAdmin gate)', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
  });

  it('returns 429 when rate-limited', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(429);
  });
});
