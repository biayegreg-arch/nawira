import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const userCtx = { user: { sub: 'user_1', email: 'u@test.local' } };

function makeGet(id: string): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    new NextRequest(`http://test/api/support-tickets/${id}`, { method: 'GET' }),
    { params: Promise.resolve({ id }) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(userCtx as never);
});

describe('GET /api/support-tickets/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    const res = await GET(...makeGet('t1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 TICKET_NOT_FOUND when the ticket does not exist', async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue(null);
    const res = await GET(...makeGet('missing'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('TICKET_NOT_FOUND');
  });

  it('returns 404 TICKET_NOT_FOUND (never 403) when the ticket belongs to another user', async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue(null);
    const res = await GET(...makeGet('someone-elses-ticket'));
    expect(res.status).toBe(404);
    expect(prismaMock.supportTicket.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'someone-elses-ticket', userId: 'user_1' } }),
    );
  });

  it('returns the ticket + message thread without author emails', async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue({
      id: 't1',
      subject: 'Aide',
      status: 'OPEN',
      createdAt: new Date('2026-09-20T00:00:00.000Z'),
      messages: [
        {
          id: 'm1',
          role: 'USER',
          body: 'Bonjour',
          createdAt: new Date('2026-09-20T00:00:00.000Z'),
        },
      ],
    } as never);
    const res = await GET(...makeGet('t1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticket).toMatchObject({ id: 't1', subject: 'Aide', status: 'OPEN' });
    expect(body.messages[0]).toMatchObject({
      id: 'm1',
      role: 'USER',
      body: 'Bonjour',
    });
    expect(body.messages[0]).not.toHaveProperty('authorEmail');
    expect(JSON.stringify(body)).not.toContain('u@test.local');
  });
});
