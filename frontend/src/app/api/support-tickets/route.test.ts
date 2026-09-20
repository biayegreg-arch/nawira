import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { POST, GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);

const userCtx = { user: { sub: 'user_1', email: 'u@test.local' } };

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/support-tickets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGet(qs = ''): NextRequest {
  return new NextRequest(`http://test/api/support-tickets${qs}`, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(userCtx as never);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('POST /api/support-tickets', () => {
  it('returns the CSRF failure response when verifyCsrf rejects', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    );
    const res = await POST(makePost({ subject: 'x', message: 'y' }));
    expect(res.status).toBe(403);
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    const res = await POST(makePost({ subject: 'x', message: 'y' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 VALIDATION_FAILED for an empty subject', async () => {
    const res = await POST(makePost({ subject: '', message: 'y' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('returns 400 VALIDATION_FAILED for an empty message', async () => {
    const res = await POST(makePost({ subject: 'x', message: '' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('creates the ticket and its first message atomically, returns 201', async () => {
    prismaMock.$transaction.mockImplementationOnce(async (cb: unknown) => {
      const tx = {
        supportTicket: {
          create: vi.fn().mockResolvedValue({
            id: 'ticket_1',
            subject: 'Problème de connexion',
            status: 'OPEN',
            createdAt: new Date('2026-09-20T00:00:00.000Z'),
          }),
        },
        supportTicketMessage: { create: vi.fn().mockResolvedValue({ id: 'msg_1' }) },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as (tx: any) => unknown)(tx);
    });

    const res = await POST(
      makePost({ subject: 'Problème de connexion', message: "Je n'arrive pas à me connecter" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ticket).toMatchObject({
      id: 'ticket_1',
      subject: 'Problème de connexion',
      status: 'OPEN',
    });
  });
});

describe('GET /api/support-tickets', () => {
  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it('scopes the list to the authenticated userId', async () => {
    prismaMock.supportTicket.findMany.mockResolvedValue([]);
    await GET(makeGet());
    expect(prismaMock.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_1' } }),
    );
  });

  it('returns items + nextCursor shape', async () => {
    prismaMock.supportTicket.findMany.mockResolvedValue([
      { id: 't1', subject: 'A', status: 'OPEN', createdAt: new Date(), updatedAt: new Date() },
    ] as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('nextCursor');
  });
});
