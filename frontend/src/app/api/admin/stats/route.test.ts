// GET /api/admin/stats — the 2 real, honestly-derivable KPI counts shown
// on the /admin overview page (active users, paid-plan profiles).
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
  user: { sub: 'admin-1', email: 'admin@test.local' },
  admin: { id: 'admin-1', email: 'admin@test.local', role: 'ADMIN' as const },
};

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/admin/stats', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRateLimit.mockResolvedValue(null);
});

describe('GET /api/admin/stats', () => {
  it('returns real active-user and paid-profile counts', async () => {
    prismaMock.user.count.mockResolvedValueOnce(12847);
    prismaMock.profile.count.mockResolvedValueOnce(4231);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { activeUsers: number; paidProfiles: number };
    expect(body).toEqual({ activeUsers: 12847, paidProfiles: 4231 });

    expect(prismaMock.user.count).toHaveBeenCalledWith({ where: { status: 'ACTIVE' } });
    expect(prismaMock.profile.count).toHaveBeenCalledWith({
      where: { plan: { in: ['PLUS', 'BABY'] } },
    });
  });

  it('propagates 403 from requireAdmin (non-admin denied)', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json(
        { error: 'ADMIN_REQUIRED', message: 'Admin access required' },
        { status: 403 },
      ),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });

  it('propagates 429 from the rate limiter before touching Prisma', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(429);
    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });
});
