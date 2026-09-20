// Per-userId limiter for consumer support-ticket writes (create + reply).
// Composes the existing RedisRateLimitStore; mirrors enforceAdminRateLimit
// semantics (fail open in dev/CI without Redis, fail closed 503 in prod).
import 'server-only';
import { NextResponse } from 'next/server';
import { redis } from '@/lib/server/redis';
import { RedisRateLimitStore } from '@/lib/server/rate-limit-store';

const WINDOW_MS = 60 * 60 * 1000;

const LIMITS = {
  create: { prefix: 'rl:support:create:', max: 5 },
  reply: { prefix: 'rl:support:reply:', max: 20 },
} as const;

export type SupportLimitKind = keyof typeof LIMITS;

export async function enforceSupportRateLimit(
  userId: string,
  kind: SupportLimitKind,
): Promise<NextResponse | null> {
  if (!redis) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'RATE_LIMIT_BACKEND_UNAVAILABLE', message: 'Rate-limit backend unavailable.' },
        { status: 503 },
      );
    }
    return null;
  }
  const { prefix, max } = LIMITS[kind];
  const store = new RedisRateLimitStore({ redis, prefix: '', windowMs: WINDOW_MS });
  const { totalHits, resetTime } = await store.increment(`${prefix}${userId}`);
  if (totalHits > max) {
    const retryAfter = Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
    return NextResponse.json(
      { error: 'TOO_MANY_REQUESTS', message: 'Too many support requests; retry later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(max),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(resetTime.getTime() / 1000)),
        },
      },
    );
  }
  return null;
}
