import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'u1', email: 'a@b.com' } })),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { POST } from './route';

const VALID_BODY = {
  birthDate: '2000-01-01',
  goal: 'PERIOD_TRACKING',
  lastPeriodDate: null,
  usualPeriodLength: null,
  usualCycleLength: null,
  trackedConcerns: [],
  consents: {
    ACCOUNT: true,
    HEALTH_DATA: true,
    ASSISTANT_HISTORY: false,
    ANALYTICS: false,
    MARKETING: false,
  },
};

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://test/api/onboarding/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } });
  vi.mocked(verifyCsrf).mockReturnValue(null);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('POST /api/onboarding/complete', () => {
  it('creates a Profile and the granted Consent rows on success', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);
    prismaMock.profile.create.mockResolvedValue({} as never);
    prismaMock.consent.create.mockResolvedValue({} as never);

    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(prismaMock.profile.create).toHaveBeenCalledTimes(1);
    const profileArg = prismaMock.profile.create.mock.calls[0]?.[0];
    expect(profileArg?.data?.userId).toBe('u1');
    expect(profileArg?.data?.goal).toBe('PERIOD_TRACKING');

    expect(prismaMock.consent.create).toHaveBeenCalledTimes(2);
    const types = prismaMock.consent.create.mock.calls.map((c) => c[0]?.data?.type).sort();
    expect(types).toEqual(['ACCOUNT', 'HEALTH_DATA']);

    expect(prismaMock.periodEvent.create).not.toHaveBeenCalled();
  });

  it('creates a PeriodEvent when lastPeriodDate is provided', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);
    prismaMock.profile.create.mockResolvedValue({} as never);
    prismaMock.consent.create.mockResolvedValue({} as never);
    prismaMock.periodEvent.create.mockResolvedValue({} as never);

    const res = await POST(makeReq({ ...VALID_BODY, lastPeriodDate: '2026-08-01' }));
    expect(res.status).toBe(200);

    expect(prismaMock.periodEvent.create).toHaveBeenCalledTimes(1);
    const arg = prismaMock.periodEvent.create.mock.calls[0]?.[0];
    expect(arg?.data?.flow).toBe('MEDIUM');
    expect(arg?.data?.userId).toBe('u1');
  });

  it('rejects a second onboarding submission with PROFILE_ALREADY_EXISTS', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({ userId: 'u1' } as never);

    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('PROFILE_ALREADY_EXISTS');
    expect(prismaMock.profile.create).not.toHaveBeenCalled();
  });

  it('rejects an under-18 birthDate with UNDER_MINIMUM_AGE', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);
    const now = new Date();
    const under18 = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate())
      .toISOString()
      .slice(0, 10);

    const res = await POST(makeReq({ ...VALID_BODY, birthDate: under18 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('UNDER_MINIMUM_AGE');
    expect(prismaMock.profile.create).not.toHaveBeenCalled();
  });

  it('rejects when a required consent is false even if the client claims otherwise', async () => {
    const res = await POST(
      makeReq({ ...VALID_BODY, consents: { ...VALID_BODY.consents, HEALTH_DATA: false } }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.profile.findUnique).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('returns 403 when the CSRF check fails', async () => {
    vi.mocked(verifyCsrf).mockReturnValue(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }) as never,
    );
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(403);
  });
});
