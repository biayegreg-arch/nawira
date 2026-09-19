// ADMIN-01 (Wave 1) — users DETAIL endpoint behaviour.
// Mirrors the pattern from the LIST sibling test.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
  requireSuperadmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/account/delete-account', () => ({
  deleteAccount: vi.fn(),
}));
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn(),
}));

import { requireAdmin, requireSuperadmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { deleteAccount } from '@/lib/server/account/delete-account';
import { logAdminAction } from '@/lib/server/admin/audit';
import { GET, DELETE } from './route';
import { seedAdmin } from '@/test-utils/admin-fixtures';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRequireSuperadmin = vi.mocked(requireSuperadmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockDeleteAccount = vi.mocked(deleteAccount);
const mockLogAdminAction = vi.mocked(logAdminAction);

const adminUser = seedAdmin({ id: 'admin_1', email: 'admin@test.local' });
const adminCtx = {
  user: { sub: adminUser.id, email: adminUser.email },
  admin: { id: adminUser.id, email: adminUser.email, role: 'ADMIN' as const },
};
const superadminCtx = {
  user: { sub: 'super_1', email: 'super@test.local' },
  admin: { id: 'super_1', email: 'super@test.local', role: 'SUPERADMIN' as const },
};

function makeGet(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function makeDelete(url: string, body: unknown = { confirmation: 'DELETE' }): NextRequest {
  return new NextRequest(url, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx);
  mockRequireSuperadmin.mockResolvedValue(superadminCtx);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
  mockDeleteAccount.mockResolvedValue({ ok: true });
});

describe('/api/admin/users/[id] — detail', () => {
  it('GET returns 200 { user } for an existing user', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      email: 'u1@test.local',
      name: null,
      avatarUrl: null,
      role: 'USER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2026-05-01T00:00:00Z'),
      profile: { plan: 'BABY', planExpiresAt: null },
    } as never);

    const res = await GET(makeGet('http://test/api/admin/users/u1'), ctxWith('u1'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user: { id: string; email: string; plan: string; planExpiresAt: string | null };
    };
    expect(body.user.id).toBe('u1');
    expect(body.user.plan).toBe('BABY');
    expect(body.user.planExpiresAt).toBeNull();
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(body.user).not.toHaveProperty('profile');
  });

  it('GET defaults plan to FREE and planExpiresAt to null when the user has no Profile row', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u2',
      email: 'u2@test.local',
      name: null,
      avatarUrl: null,
      role: 'USER',
      status: 'ACTIVE',
      emailVerifiedAt: null,
      createdAt: new Date('2026-05-01T00:00:00Z'),
      profile: null,
    } as never);

    const res = await GET(makeGet('http://test/api/admin/users/u2'), ctxWith('u2'));
    const body = (await res.json()) as { user: { plan: string; planExpiresAt: string | null } };
    expect(body.user.plan).toBe('FREE');
    expect(body.user.planExpiresAt).toBeNull();
  });

  it('GET returns 404 USER_NOT_FOUND for a missing user', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null as never);
    const res = await GET(makeGet('http://test/api/admin/users/missing'), ctxWith('missing'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('USER_NOT_FOUND');
  });

  it('GET propagates 429 from rate limiter without DB hit', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await GET(makeGet('http://test/api/admin/users/u1'), ctxWith('u1'));
    expect(res.status).toBe(429);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('GET propagates 403 from requireAdmin without DB hit', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await GET(makeGet('http://test/api/admin/users/u1'), ctxWith('u1'));
    expect(res.status).toBe(403);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('/api/admin/users/[id] — DELETE (admin-initiated deletion)', () => {
  it('403s when CSRF verification fails', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await DELETE(makeDelete('http://test/api/admin/users/u1'), ctxWith('u1'));
    expect(res.status).toBe(403);
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it('propagates non-SUPERADMIN rejection from requireSuperadmin', async () => {
    mockRequireSuperadmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'SUPERADMIN_REQUIRED' }, { status: 403 }),
    );
    const res = await DELETE(makeDelete('http://test/api/admin/users/u1'), ctxWith('u1'));
    expect(res.status).toBe(403);
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it('400 VALIDATION_FAILED when confirmation literal is missing', async () => {
    const res = await DELETE(makeDelete('http://test/api/admin/users/u1', {}), ctxWith('u1'));
    expect(res.status).toBe(400);
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it('404 USER_NOT_FOUND when the target does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null as never);
    const res = await DELETE(makeDelete('http://test/api/admin/users/missing'), ctxWith('missing'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('USER_NOT_FOUND');
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it('409 ALREADY_DELETED when the target is already deleted', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      email: 'u1@test.local',
      role: 'USER',
      status: 'DELETED',
    } as never);
    const res = await DELETE(makeDelete('http://test/api/admin/users/u1'), ctxWith('u1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('ALREADY_DELETED');
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it('409 LAST_SUPERADMIN when the target is the only SUPERADMIN', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      email: 'u1@test.local',
      role: 'SUPERADMIN',
      status: 'ACTIVE',
    } as never);
    prismaMock.user.count.mockResolvedValueOnce(1);
    const res = await DELETE(makeDelete('http://test/api/admin/users/u1'), ctxWith('u1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('LAST_SUPERADMIN');
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it('allows deleting a SUPERADMIN when another SUPERADMIN remains', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      email: 'u1@test.local',
      role: 'SUPERADMIN',
      status: 'ACTIVE',
    } as never);
    prismaMock.user.count.mockResolvedValueOnce(2);
    const res = await DELETE(makeDelete('http://test/api/admin/users/u1'), ctxWith('u1'));
    expect(res.status).toBe(200);
    expect(mockDeleteAccount).toHaveBeenCalledWith(
      expect.anything(),
      'u1',
      expect.objectContaining({}),
    );
  });

  it('propagates deleteAccount failure (e.g. pending withdrawal) without logging an admin action', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      email: 'u1@test.local',
      role: 'USER',
      status: 'ACTIVE',
    } as never);
    mockDeleteAccount.mockResolvedValueOnce({
      ok: false,
      status: 409,
      code: 'DELETION_BLOCKED_PENDING_WITHDRAWAL',
      message: 'blocked',
    });
    const res = await DELETE(makeDelete('http://test/api/admin/users/u1'), ctxWith('u1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('DELETION_BLOCKED_PENDING_WITHDRAWAL');
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('200s and logs a user.delete admin action on success', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'u1',
      email: 'u1@test.local',
      role: 'USER',
      status: 'ACTIVE',
    } as never);
    const res = await DELETE(makeDelete('http://test/api/admin/users/u1'), ctxWith('u1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: 'super_1',
        action: 'user.delete',
        targetType: 'User',
        targetId: 'u1',
      }),
    );
  });

  it('propagates 429 from rate limiter without DB hit', async () => {
    mockRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: 'TOO_MANY_REQUESTS' }, { status: 429 }),
    );
    const res = await DELETE(makeDelete('http://test/api/admin/users/u1'), ctxWith('u1'));
    expect(res.status).toBe(429);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});
