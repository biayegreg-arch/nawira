// set-password route tests.
// Covers: happy path (hashes + bumps tokenVersion + cookies), CSRF reject,
// requireAuth reject, PASSWORD_ALREADY_SET refusal, password policy gates
// (banned/short/HIBP), Zod validation failure, USER_NOT_FOUND, runtime shape.
//
// Mirrors change-password/route.test.ts's mocking strategy (D-25 + Pitfall
// 11) minus the lockout/currentPassword machinery — set-password has no
// current password to verify, so there is nothing to brute-force here.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { prismaMock } from '@/test-utils/prisma-mock';

interface MockEntry {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}
const __cookieStore = new Map<string, MockEntry>();
const cookieMockStore = {
  get(name: string) {
    const e = __cookieStore.get(name);
    return e ? { name: e.name, value: e.value } : undefined;
  },
  set(name: string, value: string, options?: Record<string, unknown>) {
    __cookieStore.set(name, { name, value, ...(options ? { options } : {}) });
  },
  delete(name: string) {
    __cookieStore.delete(name);
  },
  has(name: string) {
    return __cookieStore.has(name);
  },
  getAll() {
    return [...__cookieStore.values()].map((e) => ({ name: e.name, value: e.value }));
  },
};
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve(cookieMockStore),
}));

vi.mock('@/lib/server/auth/banned-passwords', () => ({
  isBanned: vi.fn().mockReturnValue(false),
}));
vi.mock('@/lib/server/auth/hibp', () => ({
  isPwned: vi.fn().mockResolvedValue(false),
}));

import { isBanned } from '@/lib/server/auth/banned-passwords';
import { isPwned } from '@/lib/server/auth/hibp';
import {
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  createAccessToken,
} from '@/lib/server/auth';
import { POST } from './route';

const CSRF_TOKEN = 'csrf-token-fixture-deadbeef';

interface BuildOpts {
  body: unknown;
  csrf?: string | null;
  csrfCookieValue?: string | null;
}

function buildRequest(opts: BuildOpts): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (opts.csrf !== null && opts.csrf !== undefined) {
    headers.set('x-csrf-token', opts.csrf);
  }
  if (opts.csrfCookieValue !== null && opts.csrfCookieValue !== undefined) {
    headers.set('cookie', `${CSRF_COOKIE_NAME}=${opts.csrfCookieValue}`);
  }
  return new NextRequest('http://localhost/api/auth/set-password', {
    method: 'POST',
    headers,
    body: JSON.stringify(opts.body),
  });
}

function seedAccessCookie(token: string): void {
  cookieMockStore.set(COOKIE_NAME, token);
}

let validToken: string;

const isBannedMock = vi.mocked(isBanned);
const isPwnedMock = vi.mocked(isPwned);

beforeEach(async () => {
  __cookieStore.clear();
  validToken = await createAccessToken({
    sub: 'user_1',
    email: 'oauth-user@example.com',
    tokenVersion: 0,
  });
  // Default: an OAuth-only user with no password set yet.
  prismaMock.user.findUnique.mockResolvedValue({
    id: 'user_1',
    email: 'oauth-user@example.com',
    passwordHash: null,
    tokenVersion: 0,
  } as unknown as never);
  prismaMock.user.update.mockResolvedValue({
    id: 'user_1',
    email: 'oauth-user@example.com',
    tokenVersion: 1,
  } as unknown as never);

  isBannedMock.mockReturnValue(false);
  isPwnedMock.mockResolvedValue(false);
  delete process.env.PASSWORD_HIBP_CHECK;
  delete process.env.AUTH_PASSWORD_MIN_LENGTH;
});

describe('POST /api/auth/set-password', () => {
  it('Test 1 — happy path: hashes newPassword, bumps tokenVersion, sets fresh cookies', async () => {
    await seedAccessCookie(validToken);
    const req = buildRequest({
      body: { newPassword: 'Brand-New-Pass-2026' },
      csrf: CSRF_TOKEN,
      csrfCookieValue: CSRF_TOKEN,
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true });

    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
    const updateArg = prismaMock.user.update.mock.calls[0]![0];
    expect(updateArg).toMatchObject({
      where: { id: 'user_1' },
      data: {
        passwordHash: expect.any(String),
        tokenVersion: { increment: 1 },
      },
    });

    expect(__cookieStore.has(COOKIE_NAME)).toBe(true);
    expect(__cookieStore.has(REFRESH_COOKIE_NAME)).toBe(true);
    expect(__cookieStore.has(CSRF_COOKIE_NAME)).toBe(true);

    const newAccess = __cookieStore.get(COOKIE_NAME);
    expect(newAccess?.value).toBeTruthy();
    expect(newAccess?.value).not.toBe(validToken);
  });

  it('Test 2 — missing CSRF header returns 403', async () => {
    await seedAccessCookie(validToken);
    const req = buildRequest({
      body: { newPassword: 'Brand-New-Pass-2026' },
      csrf: null,
      csrfCookieValue: CSRF_TOKEN,
    });

    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('Test 3 — missing access cookie returns 401', async () => {
    const req = buildRequest({
      body: { newPassword: 'Brand-New-Pass-2026' },
      csrf: CSRF_TOKEN,
      csrfCookieValue: CSRF_TOKEN,
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('Test 4 — a password already set returns 409 PASSWORD_ALREADY_SET (no update)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'oauth-user@example.com',
      passwordHash: 'already-hashed',
      tokenVersion: 0,
    } as unknown as never);
    await seedAccessCookie(validToken);
    const req = buildRequest({
      body: { newPassword: 'Brand-New-Pass-2026' },
      csrf: CSRF_TOKEN,
      csrfCookieValue: CSRF_TOKEN,
    });

    const res = await POST(req);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'PASSWORD_ALREADY_SET' });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('Test 5 — banned newPassword returns 400 PASSWORD_BANNED', async () => {
    await seedAccessCookie(validToken);
    isBannedMock.mockReturnValue(true);
    const req = buildRequest({
      body: { newPassword: 'password123' },
      csrf: CSRF_TOKEN,
      csrfCookieValue: CSRF_TOKEN,
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'PASSWORD_BANNED' });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('Test 6 — short newPassword returns 400 PASSWORD_TOO_SHORT', async () => {
    await seedAccessCookie(validToken);
    const req = buildRequest({
      body: { newPassword: 'short1' },
      csrf: CSRF_TOKEN,
      csrfCookieValue: CSRF_TOKEN,
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'PASSWORD_TOO_SHORT' });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('Test 7 — HIBP-pwned newPassword returns 400 PASSWORD_PWNED when env enabled', async () => {
    await seedAccessCookie(validToken);
    process.env.PASSWORD_HIBP_CHECK = '1';
    isPwnedMock.mockResolvedValue(true);
    const req = buildRequest({
      body: { newPassword: 'Brand-New-Pass-2026' },
      csrf: CSRF_TOKEN,
      csrfCookieValue: CSRF_TOKEN,
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'PASSWORD_PWNED' });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('Test 8 — missing newPassword returns 400 VALIDATION_FAILED', async () => {
    await seedAccessCookie(validToken);
    const req = buildRequest({
      body: {},
      csrf: CSRF_TOKEN,
      csrfCookieValue: CSRF_TOKEN,
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'VALIDATION_FAILED' });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('Test 9 — user disappeared from DB returns 404 USER_NOT_FOUND', async () => {
    // requireAuth() does its own findUnique (tokenVersion re-check) before the
    // route's handler runs its own lookup — the first call must still resolve
    // so auth succeeds, and only the route's own (second) call sees null.
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        id: 'user_1',
        email: 'oauth-user@example.com',
        tokenVersion: 0,
      } as unknown as never)
      .mockResolvedValueOnce(null as unknown as never);
    await seedAccessCookie(validToken);
    const req = buildRequest({
      body: { newPassword: 'Brand-New-Pass-2026' },
      csrf: CSRF_TOKEN,
      csrfCookieValue: CSRF_TOKEN,
    });

    const res = await POST(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'USER_NOT_FOUND' });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("Test 10 — route file exports runtime='nodejs' and POST handler", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'route.ts'), 'utf8');
    expect(src).toMatch(/runtime\s*=\s*['"]nodejs['"]/);
    expect(src).toMatch(/export\s+async\s+function\s+POST/);
  });
});
