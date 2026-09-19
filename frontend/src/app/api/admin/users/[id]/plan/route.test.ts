// ADMIN-PLAN — PATCH /api/admin/users/[id]/plan behaviour. Mirrors the
// role/route.test.ts and [id]/route.test.ts (DELETE) test patterns.
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
vi.mock('@/lib/server/account/activity', () => ({
  logAccountActivity: vi.fn(),
}));

import { requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { logAccountActivity } from '@/lib/server/account/activity';
import { PATCH } from './route';

const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);
const mockLogAccountActivity = vi.mocked(logAccountActivity);

const superadminCtx = {
  user: { sub: 'super_1', email: 'super@test.local' },
  admin: { id: 'super_1', email: 'super@test.local', role: 'SUPERADMIN' as const },
};

function makePatch(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSuperadmin.mockResolvedValue(superadminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('PATCH /api/admin/users/[id]/plan', () => {
  it('returns the CSRF failure response when verifyCsrf rejects', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await PATCH(makePatch('http://test/x', { plan: 'PLUS' }), ctxWith('u1'));
    expect(res.status).toBe(403);
    expect(mockRequireSuperadmin).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not SUPERADMIN', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'SUPERADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await PATCH(makePatch('http://test/x', { plan: 'PLUS' }), ctxWith('u1'));
    expect(res.status).toBe(403);
  });

  it('returns 400 VALIDATION_FAILED for an invalid plan enum value', async () => {
    const res = await PATCH(makePatch('http://test/x', { plan: 'GOLD' }), ctxWith('u1'));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('returns 400 VALIDATION_FAILED when expiresAt is in the past', async () => {
    const res = await PATCH(
      makePatch('http://test/x', { plan: 'PLUS', expiresAt: '2020-01-01T00:00:00.000Z' }),
      ctxWith('u1'),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('returns 400 VALIDATION_FAILED when expiresAt is given together with plan FREE', async () => {
    const res = await PATCH(
      makePatch('http://test/x', {
        plan: 'FREE',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
      ctxWith('u1'),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('returns 404 USER_NOT_FOUND when the target user has no Profile row', async () => {
    prismaMock.$transaction.mockImplementationOnce(async (cb: unknown) => {
      const tx = { profile: { findUnique: vi.fn().mockResolvedValue(null) } };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as (tx: any) => unknown)(tx);
    });
    const res = await PATCH(makePatch('http://test/x', { plan: 'PLUS' }), ctxWith('missing'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('USER_NOT_FOUND');
  });

  it('is idempotent (200, no writes) when plan and expiresAt are unchanged', async () => {
    prismaMock.$transaction.mockImplementationOnce(async (cb: unknown) => {
      const tx = {
        profile: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ userId: 'u1', plan: 'PLUS', planExpiresAt: null }),
          update: vi.fn(),
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as (tx: any) => unknown)(tx);
    });
    const res = await PATCH(makePatch('http://test/x', { plan: 'PLUS' }), ctxWith('u1'));
    expect(res.status).toBe(200);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
    expect(mockLogAccountActivity).not.toHaveBeenCalled();
  });

  it('grants a plan: updates Profile, writes AdminAction and AccountActivity', async () => {
    const update = vi.fn().mockResolvedValue({
      userId: 'u1',
      plan: 'PLUS',
      planExpiresAt: new Date('2026-10-19T00:00:00.000Z'),
    });
    prismaMock.$transaction.mockImplementationOnce(async (cb: unknown) => {
      const tx = {
        profile: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ userId: 'u1', plan: 'FREE', planExpiresAt: null }),
          update,
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as (tx: any) => unknown)(tx);
    });
    const res = await PATCH(
      makePatch('http://test/x', { plan: 'PLUS', expiresAt: '2026-10-19T00:00:00.000Z' }),
      ctxWith('u1'),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { profile: { plan: string; planExpiresAt: string } };
    expect(body.profile.plan).toBe('PLUS');
    expect(update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { plan: 'PLUS', planExpiresAt: new Date('2026-10-19T00:00:00.000Z') },
    });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: 'super_1',
        action: 'user.plan_change',
        targetType: 'User',
        targetId: 'u1',
        metadata: { from: 'FREE', to: 'PLUS', expiresAt: '2026-10-19T00:00:00.000Z' },
      }),
    );
    expect(mockLogAccountActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'u1',
        type: 'PLAN_CHANGED',
        metadata: { from: 'FREE', to: 'PLUS', expiresAt: '2026-10-19T00:00:00.000Z' },
      }),
    );
  });

  it('revoking to FREE always force-writes planExpiresAt: null', async () => {
    const update = vi.fn().mockResolvedValue({ userId: 'u1', plan: 'FREE', planExpiresAt: null });
    prismaMock.$transaction.mockImplementationOnce(async (cb: unknown) => {
      const tx = {
        profile: {
          findUnique: vi.fn().mockResolvedValue({
            userId: 'u1',
            plan: 'PLUS',
            planExpiresAt: new Date('2026-10-19T00:00:00.000Z'),
          }),
          update,
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as (tx: any) => unknown)(tx);
    });
    const res = await PATCH(makePatch('http://test/x', { plan: 'FREE' }), ctxWith('u1'));
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { plan: 'FREE', planExpiresAt: null },
    });
  });

  it('applies rate-limit using the admin userId', async () => {
    prismaMock.$transaction.mockImplementationOnce(async (cb: unknown) => {
      const tx = {
        profile: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ userId: 'u1', plan: 'PLUS', planExpiresAt: null }),
          update: vi.fn(),
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as (tx: any) => unknown)(tx);
    });
    await PATCH(makePatch('http://test/x', { plan: 'PLUS' }), ctxWith('u1'));
    expect(mockRateLimit).toHaveBeenCalledWith('super_1');
  });
});
