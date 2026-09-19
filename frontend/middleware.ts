import { NextResponse, type NextRequest } from 'next/server';

// Silent-refresh gate for protected pages.
//
// The (15-min) access cookie can expire while a (7-day) refresh cookie is
// still valid — typically when a tab sat unfocused or the laptop slept. The
// (authed) layout calling /api/auth/me would 401 and the user would be kicked
// to /login. This middleware catches that case BEFORE the page renders and
// bounces the request through /api/auth/refresh-and-return, which mints fresh
// cookies and 302s back to the original URL — invisible to the user.
//
// Protected paths are configured via AUTH_PROTECTED_PREFIXES (comma-separated,
// e.g. "/dashboard,/account"). Empty by default — the API surface is the only
// thing shipped, so out-of-the-box this middleware is a no-op.
//
// Edge runtime: no DB, no bcrypt, no Prisma. We only inspect cookies and
// build redirects — the heavy lifting happens in /api/auth/refresh-and-return
// (runtime=nodejs).

const COOKIE_PREFIX = process.env.COOKIE_PREFIX || 'app';
const ACCESS_COOKIE = `${COOKIE_PREFIX}-token`;
const REFRESH_COOKIE = `${COOKIE_PREFIX}-refresh`;
const LOGIN_PATH = process.env.AUTH_LOGIN_PATH || '/login';

const AUTHED_PREFIXES = (process.env.AUTH_PROTECTED_PREFIXES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isAuthedPath(pathname: string): boolean {
  return AUTHED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// CSP (E8 Part B hardening). Nonce-based, following Next.js's own App Router
// guide: the nonce rides on both the request (so Next auto-applies it to the
// inline scripts it renders for hydration) and the response. Production-only
// — Turbopack's dev HMR needs `eval` + a websocket, which would either break
// under this policy or force loosening it enough to defeat the point; the
// other 6 static headers (next.config.ts) still apply in dev.
//
// Audited against this app's actual surface: no inline <script>/style="" (the
// Banani skill's rules already forbid inline styles), no direct browser→
// Cloudinary calls (upload is proxied server-side), no next/image remote
// hosts, fonts are self-hosted via next/font. The only cross-origin browser
// traffic is Sentry's ingest endpoint, allowed only when a DSN is configured.
const SENTRY_CONFIGURED = Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);
const SENTRY_CONNECT_SRC = SENTRY_CONFIGURED
  ? ' https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io'
  : '';

function buildCsp(nonce: string): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'${SENTRY_CONNECT_SRC}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');
}

function withCsp(req: NextRequest, res: NextResponse): NextResponse {
  if (process.env.NODE_ENV !== 'production') return res;

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  // Redirects carry no body for Next to hydrate scripts into — set the
  // header for consistency, but the request-header round-trip (which is
  // what actually nonces Next's inline scripts) only matters for `next()`.
  if (res.headers.get('location')) {
    res.headers.set('Content-Security-Policy', csp);
    return res;
  }

  const next = NextResponse.next({ request: { headers: requestHeaders } });
  next.headers.set('Content-Security-Policy', csp);
  return next;
}

export function middleware(req: NextRequest): NextResponse {
  if (AUTHED_PREFIXES.length === 0) return withCsp(req, NextResponse.next());

  const { pathname, search } = req.nextUrl;
  if (!isAuthedPath(pathname)) return withCsp(req, NextResponse.next());

  if (req.cookies.get(ACCESS_COOKIE)?.value) return withCsp(req, NextResponse.next());

  const target = pathname + search;

  if (!req.cookies.get(REFRESH_COOKIE)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = `?next=${encodeURIComponent(target)}`;
    return withCsp(req, NextResponse.redirect(url, 303));
  }

  const url = req.nextUrl.clone();
  url.pathname = '/api/auth/refresh-and-return';
  url.search = `?next=${encodeURIComponent(target)}`;
  return withCsp(req, NextResponse.redirect(url, 303));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\..*).*)'],
};
