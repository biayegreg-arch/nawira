// Unit tests for enforceExportRateLimit — mirrors the shape of
// frontend/src/lib/server/middleware/rate-limit-by-userid.ts's
// enforceAdminRateLimit (no existing test file for that one to copy, so
// this is the first direct test of this pattern in the codebase; uses the
// generic mockRedis() stub from test-utils/admin-fixtures.ts, which is not
// admin-specific — it's a plain Upstash-shaped in-memory fake).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockRedis, type MockRedisStub } from '@/test-utils/admin-fixtures';

const redisHolder: { current: MockRedisStub | null } = { current: null };

vi.mock('@/lib/server/redis', () => ({
  get redis() {
    return redisHolder.current;
  },
}));

import { enforceExportRateLimit } from './export-rate-limit';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  redisHolder.current = mockRedis();
});

afterEach(() => {
  (process.env as { NODE_ENV?: string }).NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('enforceExportRateLimit', () => {
  it('allows the first 3 calls in a window', async () => {
    expect(await enforceExportRateLimit('user_1')).toBeNull();
    expect(await enforceExportRateLimit('user_1')).toBeNull();
    expect(await enforceExportRateLimit('user_1')).toBeNull();
  });

  it('rejects the 4th call in the same window with 429', async () => {
    await enforceExportRateLimit('user_2');
    await enforceExportRateLimit('user_2');
    await enforceExportRateLimit('user_2');

    const res = await enforceExportRateLimit('user_2');
    expect(res).not.toBeNull();
    expect(res?.status).toBe(429);
    const body = await res!.json();
    expect(body).toMatchObject({ error: 'TOO_MANY_REQUESTS' });
    expect(res?.headers.get('Retry-After')).toBeTruthy();
    expect(res?.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('keys are independent per userId', async () => {
    await enforceExportRateLimit('user_3');
    await enforceExportRateLimit('user_3');
    await enforceExportRateLimit('user_3');

    // A different user's 1st call in the same window is still allowed.
    expect(await enforceExportRateLimit('user_4')).toBeNull();
  });

  it('fails open (returns null) in dev/test when redis is absent', async () => {
    redisHolder.current = null;
    (process.env as { NODE_ENV?: string }).NODE_ENV = 'test';

    expect(await enforceExportRateLimit('user_5')).toBeNull();
  });

  it('fails closed (503) in production when redis is absent', async () => {
    redisHolder.current = null;
    (process.env as { NODE_ENV?: string }).NODE_ENV = 'production';

    const res = await enforceExportRateLimit('user_6');
    expect(res).not.toBeNull();
    expect(res?.status).toBe(503);
    const body = await res!.json();
    expect(body).toMatchObject({ error: 'RATE_LIMIT_BACKEND_UNAVAILABLE' });
  });
});
