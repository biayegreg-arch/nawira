import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { prismaMock } from '@/test-utils/prisma-mock';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);

function makeReq(): NextRequest {
  return new NextRequest('https://test/api/account/privacy', { method: 'GET' });
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  prismaMock.consent.findMany.mockReset();
  prismaMock.accountActivity.findMany.mockReset();
});

describe('GET /api/account/privacy', () => {
  it('401s when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue(new NextResponse(null, { status: 401 }) as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns consents and activity, scoped to the authenticated user', async () => {
    mockRequireAuth.mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } } as never);
    prismaMock.consent.findMany.mockResolvedValue([
      {
        id: 'c1',
        userId: 'u1',
        type: 'HEALTH_DATA',
        version: 1,
        grantedAt: new Date(),
        revokedAt: null,
      },
    ] as never);
    prismaMock.accountActivity.findMany.mockResolvedValue([
      {
        id: 'a1',
        userId: 'u1',
        type: 'LOGIN',
        ip: null,
        userAgent: null,
        metadata: null,
        createdAt: new Date(),
      },
    ] as never);

    const res = await GET(makeReq());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.consents).toHaveLength(1);
    expect(body.consents[0]).toMatchObject({ type: 'HEALTH_DATA' });
    expect(body.activity).toHaveLength(1);
    expect(body.activity[0]).toMatchObject({ type: 'LOGIN' });

    expect(prismaMock.consent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
    expect(prismaMock.accountActivity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' }, take: 50 }),
    );
  });

  it('caps activity at 50 rows via the query itself', async () => {
    mockRequireAuth.mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } } as never);
    prismaMock.consent.findMany.mockResolvedValue([]);
    prismaMock.accountActivity.findMany.mockResolvedValue([]);

    await GET(makeReq());

    const arg = prismaMock.accountActivity.findMany.mock.calls[0]?.[0];
    expect(arg).toMatchObject({ take: 50, orderBy: { createdAt: 'desc' } });
  });
});
