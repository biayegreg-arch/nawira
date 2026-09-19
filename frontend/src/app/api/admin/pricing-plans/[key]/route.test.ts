// ADMIN-PRICING — PATCH /api/admin/pricing-plans/[key] (SUPERADMIN-only).
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireSuperadmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn(),
}));

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { PATCH } from './route';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);

const superadminCtx = {
  user: { sub: 'super_1', email: 'super@test.local' },
  admin: { id: 'super_1', email: 'super@test.local', role: 'SUPERADMIN' as const },
};

function makePatch(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/pricing-plans/PLUS', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function ctxWith(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSuperadmin.mockResolvedValue(superadminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('PATCH /api/admin/pricing-plans/[key]', () => {
  it('returns 404 PLAN_NOT_FOUND for key=FREE', async () => {
    const res = await PATCH(makePatch({ priceFcfa: 500 }), ctxWith('FREE'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('PLAN_NOT_FOUND');
  });

  it('returns 400 VALIDATION_FAILED for a negative price', async () => {
    const res = await PATCH(makePatch({ priceFcfa: -1 }), ctxWith('PLUS'));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('returns 400 VALIDATION_FAILED for a price above the 1,000,000 ceiling', async () => {
    const res = await PATCH(makePatch({ priceFcfa: 1_000_001 }), ctxWith('PLUS'));
    expect(res.status).toBe(400);
  });

  it('returns 400 VALIDATION_FAILED for a non-integer price', async () => {
    const res = await PATCH(makePatch({ priceFcfa: 12.5 }), ctxWith('PLUS'));
    expect(res.status).toBe(400);
  });

  it('is idempotent (200, no write) when the price is unchanged', async () => {
    prismaMock.pricingPlan.findUnique.mockResolvedValueOnce({
      id: 'p1',
      key: 'PLUS',
      priceFcfa: 1000,
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedBy: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const res = await PATCH(makePatch({ priceFcfa: 1000 }), ctxWith('PLUS'));
    expect(res.status).toBe(200);
    expect(prismaMock.pricingPlan.update).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('updates the price, writes AdminAction, returns the new row', async () => {
    prismaMock.pricingPlan.findUnique.mockResolvedValueOnce({
      id: 'p1',
      key: 'PLUS',
      priceFcfa: 1000,
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedBy: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    prismaMock.pricingPlan.update.mockResolvedValueOnce({
      id: 'p1',
      key: 'PLUS',
      priceFcfa: 1200,
      updatedAt: new Date('2026-09-19T00:00:00.000Z'),
      updatedBy: 'super_1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const res = await PATCH(makePatch({ priceFcfa: 1200 }), ctxWith('PLUS'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plan: { priceFcfa: number } };
    expect(body.plan.priceFcfa).toBe(1200);
    expect(prismaMock.pricingPlan.update).toHaveBeenCalledWith({
      where: { key: 'PLUS' },
      data: { priceFcfa: 1200, updatedBy: 'super_1' },
    });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: 'super_1',
        action: 'pricing.update',
        targetType: 'PricingPlan',
        targetId: 'PLUS',
        metadata: { from: 1000, to: 1200 },
      }),
    );
  });

  it('403s a non-SUPERADMIN caller', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'SUPERADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await PATCH(makePatch({ priceFcfa: 1200 }), ctxWith('PLUS'));
    expect(res.status).toBe(403);
  });
});
