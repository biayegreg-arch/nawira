// Tests for frontend/middleware.ts's CSP hardening (E8 Part B).
//
// AUTHED_PREFIXES/SENTRY_CONNECT_SRC are computed once at module load from
// process.env — vi.resetModules() + a fresh dynamic import is required
// whenever a test needs a different value for one of those, since stubbing
// the env after the module is already loaded has no effect on the frozen
// module-level const.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

async function freshMiddleware(): Promise<typeof import('../middleware')> {
  vi.resetModules();
  return import('../middleware');
}

function makeReq(path = '/app/today'): NextRequest {
  return new NextRequest(`https://test${path}`);
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('middleware CSP (production only)', () => {
  it('does not set a CSP header outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { middleware } = await freshMiddleware();
    const res = middleware(makeReq());
    expect(res.headers.get('Content-Security-Policy')).toBeNull();
  });

  it('sets a CSP header with a nonce in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { middleware } = await freshMiddleware();
    const res = middleware(makeReq());
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).not.toBeNull();
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("style-src 'self' 'nonce-");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('issues a different nonce per request', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { middleware } = await freshMiddleware();
    const csp1 = middleware(makeReq()).headers.get('Content-Security-Policy');
    const csp2 = middleware(makeReq()).headers.get('Content-Security-Policy');
    const nonce = (csp: string | null) => csp?.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce(csp1)).toBeTruthy();
    expect(nonce(csp1)).not.toBe(nonce(csp2));
  });

  it('omits Sentry connect-src entries when no DSN is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SENTRY_DSN', '');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    const { middleware } = await freshMiddleware();
    const csp = middleware(makeReq()).headers.get('Content-Security-Policy');
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain('sentry.io');
  });

  it('adds Sentry ingest hosts to connect-src when a DSN is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://key@o123.ingest.us.sentry.io/456');
    const { middleware } = await freshMiddleware();
    const csp = middleware(makeReq()).headers.get('Content-Security-Policy');
    expect(csp).toContain('https://*.ingest.us.sentry.io');
    expect(csp).toContain('https://*.sentry.io');
  });

  it('also sets the CSP header on the silent-refresh redirect response', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_PROTECTED_PREFIXES', '/app');
    const { middleware } = await freshMiddleware();
    const res = middleware(makeReq('/app/today'));
    expect(res.status).toBe(303);
    expect(res.headers.get('Content-Security-Policy')).not.toBeNull();
  });
});

describe('middleware silent-refresh gate (unaffected by CSP work)', () => {
  it('passes unprotected paths through untouched', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { middleware } = await freshMiddleware();
    const res = middleware(makeReq('/login'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects to login when neither access nor refresh cookie is present', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('AUTH_PROTECTED_PREFIXES', '/app');
    const { middleware } = await freshMiddleware();
    const res = middleware(makeReq('/app/today'));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/login');
  });
});
