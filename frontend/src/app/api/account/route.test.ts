import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
  clearAuthCookies: vi.fn(async () => {}),
  clearCsrfCookie: vi.fn(async () => {}),
}));
vi.mock('@/lib/server/account/delete-account', () => ({
  deleteAccount: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf, clearAuthCookies, clearCsrfCookie } from '@/lib/server/auth';
import { deleteAccount } from '@/lib/server/account/delete-account';
import { DELETE } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockDeleteAccount = vi.mocked(deleteAccount);

function makeReq(body: unknown): NextRequest {
  return new NextRequest('https://test/api/account', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockVerifyCsrf.mockReset();
  mockVerifyCsrf.mockReturnValue(null);
  mockDeleteAccount.mockReset();
  mockRequireAuth.mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } } as never);
  mockDeleteAccount.mockResolvedValue({ ok: true });
});

describe('DELETE /api/account', () => {
  it('403s when CSRF verification fails', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );

    const res = await DELETE(makeReq({ confirmation: 'DELETE' }));

    expect(res.status).toBe(403);
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it('401s when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );

    const res = await DELETE(makeReq({ confirmation: 'DELETE' }));

    expect(res.status).toBe(401);
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it('400 VALIDATION_FAILED when the confirmation literal is missing', async () => {
    const res = await DELETE(makeReq({}));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it("400 VALIDATION_FAILED when confirmation doesn't match the literal exactly", async () => {
    const res = await DELETE(makeReq({ confirmation: 'delete' }));

    expect(res.status).toBe(400);
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it('forwards a blocked result (e.g. pending withdrawal) as-is, without clearing cookies', async () => {
    mockDeleteAccount.mockResolvedValue({
      ok: false,
      status: 409,
      code: 'DELETION_BLOCKED_PENDING_WITHDRAWAL',
      message: 'A withdrawal is currently being processed; try again once it completes.',
    });

    const res = await DELETE(makeReq({ confirmation: 'DELETE' }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('DELETION_BLOCKED_PENDING_WITHDRAWAL');
    expect(vi.mocked(clearAuthCookies)).not.toHaveBeenCalled();
    expect(vi.mocked(clearCsrfCookie)).not.toHaveBeenCalled();
  });

  it('happy path: 200, deleteAccount called with the authenticated user + request metadata, cookies cleared', async () => {
    const res = await DELETE(
      new NextRequest('https://test/api/account', {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.5, 10.0.0.1',
          'user-agent': 'Mozilla/5.0',
        },
        body: JSON.stringify({ confirmation: 'DELETE' }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(mockDeleteAccount).toHaveBeenCalledWith(
      expect.anything(),
      'u1',
      expect.objectContaining({ ip: '203.0.113.5', userAgent: 'Mozilla/5.0' }),
    );
    expect(vi.mocked(clearAuthCookies)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(clearCsrfCookie)).toHaveBeenCalledTimes(1);
  });
});
