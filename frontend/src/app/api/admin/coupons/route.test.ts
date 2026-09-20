import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAdmin: vi.fn(), requireSuperadmin: vi.fn() }));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({ enforceAdminRateLimit: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));
vi.mock('@/lib/server/admin/audit', () => ({ logAdminAction: vi.fn() }));

import { requireAdmin, requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { GET, POST } from './route';

const superCtx = {
  user: { sub: 's1', email: 's@test.local' },
  admin: { id: 's1', email: 's@test.local', role: 'SUPERADMIN' as const },
};

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/coupons', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(superCtx);
  vi.mocked(requireSuperadmin).mockResolvedValue(superCtx);
  vi.mocked(enforceAdminRateLimit).mockResolvedValue(null);
});

describe('GET /api/admin/coupons', () => {
  it('lists coupons with ISO dates', async () => {
    prismaMock.coupon.findMany.mockResolvedValue([
      {
        id: 'c1',
        code: 'WELCOME20',
        percentOff: 20,
        active: true,
        expiresAt: null,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        createdBy: 's1',
      },
    ] as never);
    const res = await GET(new NextRequest('http://test/api/admin/coupons'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coupons[0]).toMatchObject({
      code: 'WELCOME20',
      createdAt: '2026-09-01T00:00:00.000Z',
    });
  });
});

describe('POST /api/admin/coupons', () => {
  it('creates a coupon with an uppercased code and audits it', async () => {
    prismaMock.coupon.findUnique.mockResolvedValue(null);
    prismaMock.coupon.create.mockResolvedValue({
      id: 'c1',
      code: 'WELCOME20',
      percentOff: 20,
      active: true,
      expiresAt: null,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    } as never);
    const res = await POST(makePost({ code: 'welcome20', percentOff: 20 }));
    expect(res.status).toBe(201);
    expect(prismaMock.coupon.create).toHaveBeenCalledWith({
      data: { code: 'WELCOME20', percentOff: 20, createdBy: 's1' },
    });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'coupon.create', targetId: 'c1' }),
    );
  });

  it('returns 409 when the code already exists', async () => {
    prismaMock.coupon.findUnique.mockResolvedValue({ id: 'c0' } as never);
    const res = await POST(makePost({ code: 'WELCOME20', percentOff: 20 }));
    expect(res.status).toBe(409);
    expect(prismaMock.coupon.create).not.toHaveBeenCalled();
  });

  it.each([
    { code: 'WELCOME20', percentOff: 0 },
    { code: 'WELCOME20', percentOff: 101 },
    { code: 'a b', percentOff: 10 },
  ])('rejects invalid body %j with 400', async (body) => {
    expect((await POST(makePost(body))).status).toBe(400);
  });
});
