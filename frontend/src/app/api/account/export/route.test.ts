import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { prismaMock } from '@/test-utils/prisma-mock';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));
vi.mock('@/lib/server/account/export-rate-limit', () => ({
  enforceExportRateLimit: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { enforceExportRateLimit } from '@/lib/server/account/export-rate-limit';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockEnforceExportRateLimit = vi.mocked(enforceExportRateLimit);

function makeReq(): NextRequest {
  return new NextRequest('https://test/api/account/export', { method: 'GET' });
}

function authOk(userId = 'u1', email = 'a@b.com') {
  mockRequireAuth.mockResolvedValue({ user: { sub: userId, email } } as never);
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockEnforceExportRateLimit.mockReset();
  mockEnforceExportRateLimit.mockResolvedValue(null);

  // Every model this route queries needs a default empty/null resolution
  // so an unconfigured test doesn't throw on an un-mocked call.
  prismaMock.user.findUnique.mockResolvedValue({
    id: 'u1',
    email: 'a@b.com',
    name: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  } as never);
  prismaMock.profile.findUnique.mockResolvedValue(null);
  prismaMock.consent.findMany.mockResolvedValue([]);
  prismaMock.consent.findFirst.mockResolvedValue(null);
  prismaMock.periodEvent.findMany.mockResolvedValue([]);
  prismaMock.cycle.findMany.mockResolvedValue([]);
  prismaMock.dailyLog.findMany.mockResolvedValue([]);
  prismaMock.symptomLog.findMany.mockResolvedValue([]);
  prismaMock.fertilitySignal.findMany.mockResolvedValue([]);
  prismaMock.prediction.findUnique.mockResolvedValue(null);
  prismaMock.insight.findMany.mockResolvedValue([]);
  prismaMock.notification.findMany.mockResolvedValue([]);
  prismaMock.notificationPreferences.findUnique.mockResolvedValue(null);
  prismaMock.order.findMany.mockResolvedValue([]);
  prismaMock.withdrawal.findMany.mockResolvedValue([]);
  prismaMock.assistantConversation.findMany.mockResolvedValue([]);
  prismaMock.accountActivity.create.mockResolvedValue({} as never);
});

describe('GET /api/account/export', () => {
  it('401s when not authenticated', async () => {
    mockRequireAuth.mockResolvedValue(new NextResponse(null, { status: 401 }) as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('429s when rate-limited, before doing any data assembly', async () => {
    authOk();
    mockEnforceExportRateLimit.mockResolvedValue(
      new NextResponse(JSON.stringify({ error: 'TOO_MANY_REQUESTS' }), { status: 429 }) as never,
    );

    const res = await GET(makeReq());
    expect(res.status).toBe(429);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it('happy path: 200, full JSON shape, Content-Disposition header, activity logged', async () => {
    authOk('u1', 'a@b.com');

    const res = await GET(makeReq());

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="nawira-export-/);

    const body = await res.json();
    expect(body).toMatchObject({
      user: { id: 'u1', email: 'a@b.com' },
      profile: null,
      consents: [],
      periodEvents: [],
      cycles: [],
      dailyLogs: [],
      symptomLogs: [],
      fertilitySignals: [],
      predictions: null,
      insights: [],
      notifications: [],
      notificationPreferences: null,
      orders: [],
      withdrawals: [],
      assistantConversations: [],
    });
    expect(typeof body.exportedAt).toBe('string');

    expect(prismaMock.accountActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', type: 'DATA_EXPORTED' }),
    });
  });

  it('scopes every query to the authenticated userId', async () => {
    authOk('u1', 'a@b.com');

    await GET(makeReq());

    expect(prismaMock.cycle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
    expect(prismaMock.dailyLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
    expect(prismaMock.withdrawal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
  });

  it('assistantConversations stays empty without an active ASSISTANT_HISTORY consent', async () => {
    authOk('u1', 'a@b.com');
    prismaMock.consent.findFirst.mockResolvedValue(null);
    prismaMock.assistantConversation.findMany.mockResolvedValue([
      { id: 'c1', title: 't', createdAt: new Date(), updatedAt: new Date(), messages: [] },
    ] as never);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body.assistantConversations).toEqual([]);
    // The query itself may or may not run — what matters is the gated output.
  });

  it('includes assistantConversations when ASSISTANT_HISTORY consent is active', async () => {
    authOk('u1', 'a@b.com');
    prismaMock.consent.findFirst.mockResolvedValue({
      id: 'c1',
      userId: 'u1',
      type: 'ASSISTANT_HISTORY',
      version: 1,
      grantedAt: new Date(),
      revokedAt: null,
    } as never);
    prismaMock.assistantConversation.findMany.mockResolvedValue([
      {
        id: 'c1',
        title: 't',
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [{ id: 'm1', role: 'USER', content: 'hi', createdAt: new Date() }],
      },
    ] as never);

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body.assistantConversations).toHaveLength(1);
    expect(body.assistantConversations[0].messages).toHaveLength(1);
  });
});
