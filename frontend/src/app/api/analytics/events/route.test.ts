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

function makeReq(body?: unknown): NextRequest {
  return new NextRequest('http://test/api/analytics/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } });
  vi.mocked(verifyCsrf).mockReturnValue(null);
  prismaMock.consent.findFirst.mockResolvedValue({ id: 'c1' } as never);
  prismaMock.analyticsEvent.create.mockResolvedValue({} as never);
});

describe('POST /api/analytics/events', () => {
  it('returns 204 and records a known event type', async () => {
    const res = await POST(makeReq({ type: 'daily_log_saved', properties: { fields_count: 2 } }));
    expect(res.status).toBe(204);
    expect(prismaMock.analyticsEvent.create).toHaveBeenCalledWith({
      data: { userId: 'u1', type: 'daily_log_saved', properties: { fields_count: 2 } },
    });
  });

  it('defaults properties to {} when omitted', async () => {
    const res = await POST(makeReq({ type: 'sync_completed' }));
    expect(res.status).toBe(204);
    expect(prismaMock.analyticsEvent.create).toHaveBeenCalledWith({
      data: { userId: 'u1', type: 'sync_completed', properties: {} },
    });
  });

  it('returns 400 VALIDATION_FAILED for an unknown event type', async () => {
    const res = await POST(makeReq({ type: 'not_a_real_event', properties: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_FAILED for malformed JSON', async () => {
    const req = new NextRequest('http://test/api/analytics/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns the CSRF failure response when verifyCsrf rejects', async () => {
    vi.mocked(verifyCsrf).mockReturnValue(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await POST(makeReq({ type: 'sync_completed' }));
    expect(res.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    const res = await POST(makeReq({ type: 'sync_completed' }));
    expect(res.status).toBe(401);
  });
});
