// Per-userId rate limiter for GET /api/account/export — 3 exports / 24h
// per user. Mirrors frontend/src/lib/server/middleware/rate-limit-by-userid.ts
// (the admin per-userId limiter) but as its own small, purpose-built file
// rather than a parameterized shared one — matches this codebase's
// established pattern (see rate-limit-by-email.ts vs rate-limit-by-userid.ts:
// two separate files, not one generic one).
//
// A full data export is a scraping/abuse vector if callable at unbounded
// rate even from an authenticated session (e.g. a compromised token used
// to repeatedly pull a user's full history). 3/24h is generous for
// legitimate use (nobody re-exports their own data more than a couple
// times a day) while bounding the abuse case.
//
// Same fail-open-dev/fail-closed-prod semantics as enforceAdminRateLimit:
// when redis is absent, dev/test proceeds (returns null) so local
// development without Upstash still works, but production returns 503 so
// a misconfigured deploy doesn't silently disable the limit.
import 'server-only';
import { NextResponse } from 'next/server';
import { redis } from '@/lib/server/redis';
import { RedisRateLimitStore } from '@/lib/server/rate-limit-store';

const EXPORT_PREFIX = 'rl:export:userid:';
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_HITS = 3;

export async function enforceExportRateLimit(userId: string): Promise<NextResponse | null> {
  if (!redis) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        {
          error: 'RATE_LIMIT_BACKEND_UNAVAILABLE',
          message: 'Rate-limit backend unavailable.',
        },
        { status: 503 },
      );
    }
    return null;
  }
  const store = new RedisRateLimitStore({ redis, prefix: '', windowMs: WINDOW_MS });
  const { totalHits, resetTime } = await store.increment(`${EXPORT_PREFIX}${userId}`);
  if (totalHits > MAX_HITS) {
    const retryAfter = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
    return NextResponse.json(
      {
        error: 'TOO_MANY_REQUESTS',
        message: 'Export rate limit exceeded; retry tomorrow.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(MAX_HITS),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(resetTime.getTime() / 1000)),
        },
      },
    );
  }
  return null;
}
