import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/server/auth', () => ({ verifyCsrf: vi.fn(() => null) }));

import { requireAuth } from '@/lib/server/middleware';
import { POST } from './route';

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/coupons/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const future = new Date(Date.now() + 86_400_000);
const past = new Date(Date.now() - 86_400_000);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } });
  prismaMock.pricingPlan.findUnique.mockResolvedValue({
    id: 'p1',
    key: 'PLUS',
    priceFcfa: 1000,
  } as never);
});

function coupon(over: Record<string, unknown> = {}): never {
  return {
    id: 'c1',
    code: 'WELCOME20',
    percentOff: 20,
    active: true,
    expiresAt: null,
    ...over,
  } as never;
}

describe('POST /api/coupons/validate', () => {
  it('returns the server-computed discounted price, case-insensitively', async () => {
    prismaMock.coupon.findUnique.mockResolvedValue(coupon());
    const res = await POST(makePost({ code: ' welcome20 ', plan: 'PLUS' }));
    expect(res.status).toBe(200);
    expect(prismaMock.coupon.findUnique).toHaveBeenCalledWith({ where: { code: 'WELCOME20' } });
    expect(await res.json()).toEqual({
      code: 'WELCOME20',
      percentOff: 20,
      plan: 'PLUS',
      originalFcfa: 1000,
      discountedFcfa: 800,
    });
  });

  it('accepts a coupon that has not expired yet', async () => {
    prismaMock.coupon.findUnique.mockResolvedValue(coupon({ expiresAt: future }));
    expect((await POST(makePost({ code: 'WELCOME20', plan: 'PLUS' }))).status).toBe(200);
  });

  it.each([
    ['unknown', null],
    ['inactive', coupon({ active: false })],
    ['expired', coupon({ expiresAt: past })],
  ])('returns the same 404 COUPON_INVALID for an %s coupon', async (_n, row) => {
    prismaMock.coupon.findUnique.mockResolvedValue(row);
    const res = await POST(makePost({ code: 'WELCOME20', plan: 'PLUS' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('COUPON_INVALID');
  });

  it('rejects an invalid plan with 400', async () => {
    const res = await POST(makePost({ code: 'WELCOME20', plan: 'FREE' }));
    expect(res.status).toBe(400);
  });
});
