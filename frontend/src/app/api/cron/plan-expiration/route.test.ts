// CRON — POST /api/cron/plan-expiration. Downgrades expired non-FREE
// profiles back to FREE, clears planExpiresAt, writes a PLAN_EXPIRED
// AccountActivity row per downgraded user. Mirrors verification-cleanup's
// verifyCronSecret + withLease shape.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/cron/auth', () => ({
  verifyCronSecret: vi.fn(),
}));
vi.mock('@/lib/server/leader-lease', () => ({
  withLease: vi.fn(
    async (_redis: unknown, _name: string, _ttl: number, fn: () => Promise<void>) => {
      await fn();
    },
  ),
}));
vi.mock('@/lib/server/account/activity', () => ({
  logAccountActivity: vi.fn(),
}));

import { verifyCronSecret } from '@/lib/server/cron/auth';
import { logAccountActivity } from '@/lib/server/account/activity';
import { POST } from './route';

const mockVerifyCronSecret = vi.mocked(verifyCronSecret);
const mockLogAccountActivity = vi.mocked(logAccountActivity);

function makePost(): NextRequest {
  return new NextRequest('http://test/api/cron/plan-expiration', {
    method: 'POST',
    headers: { authorization: 'Bearer test-secret' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCronSecret.mockReturnValue(null);
});

describe('POST /api/cron/plan-expiration', () => {
  it('returns the auth failure response when verifyCronSecret rejects', async () => {
    mockVerifyCronSecret.mockReturnValueOnce(
      NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 }),
    );
    const res = await POST(makePost());
    expect(res.status).toBe(401);
  });

  it('downgrades expired non-FREE profiles to FREE and clears planExpiresAt', async () => {
    prismaMock.profile.findMany.mockResolvedValueOnce([
      { userId: 'u1', plan: 'PLUS' },
      { userId: 'u2', plan: 'BABY' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    const res = await POST(makePost());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; processed: number };
    expect(body.processed).toBe(2);

    expect(prismaMock.profile.update).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { plan: 'FREE', planExpiresAt: null },
    });
    expect(prismaMock.profile.update).toHaveBeenCalledWith({
      where: { userId: 'u2' },
      data: { plan: 'FREE', planExpiresAt: null },
    });
    expect(mockLogAccountActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'u1', type: 'PLAN_EXPIRED', metadata: { from: 'PLUS' } }),
    );
    expect(mockLogAccountActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'u2', type: 'PLAN_EXPIRED', metadata: { from: 'BABY' } }),
    );
  });

  it('queries only planExpiresAt < now and plan != FREE', async () => {
    prismaMock.profile.findMany.mockResolvedValueOnce([]);
    await POST(makePost());
    expect(prismaMock.profile.findMany).toHaveBeenCalledWith({
      where: { planExpiresAt: { lt: expect.any(Date) }, plan: { not: 'FREE' } },
      select: { userId: true, plan: true },
    });
  });

  it('processes 0 when nothing is expired', async () => {
    prismaMock.profile.findMany.mockResolvedValueOnce([]);
    const res = await POST(makePost());
    const body = (await res.json()) as { processed: number };
    expect(body.processed).toBe(0);
    expect(prismaMock.profile.update).not.toHaveBeenCalled();
  });
});
