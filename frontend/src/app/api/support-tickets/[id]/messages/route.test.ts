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
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const userCtx = { user: { sub: 'user_1', email: 'u@test.local' } };

function makePost(id: string, body: unknown): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    new NextRequest(`http://test/api/support-tickets/${id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(userCtx as never);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('POST /api/support-tickets/[id]/messages', () => {
  it('returns the CSRF failure response when verifyCsrf rejects', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    );
    const res = await POST(...makePost('t1', { message: 'hi' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 VALIDATION_FAILED for an empty message', async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue({ id: 't1', status: 'OPEN' } as never);
    const res = await POST(...makePost('t1', { message: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 TICKET_NOT_FOUND when the ticket is missing or belongs to another user', async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue(null);
    const res = await POST(...makePost('t1', { message: 'hi' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('TICKET_NOT_FOUND');
  });

  it('returns 409 TICKET_CLOSED when the ticket status is RESOLVED', async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue({ id: 't1', status: 'RESOLVED' } as never);
    const res = await POST(...makePost('t1', { message: 'hi' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('TICKET_CLOSED');
  });

  it('returns 409 TICKET_CLOSED when the ticket status is CLOSED', async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue({ id: 't1', status: 'CLOSED' } as never);
    const res = await POST(...makePost('t1', { message: 'hi' }));
    expect(res.status).toBe(409);
  });

  it('creates the message and returns 201 for an OPEN ticket', async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue({ id: 't1', status: 'OPEN' } as never);
    prismaMock.supportTicketMessage.create.mockResolvedValue({
      id: 'm2',
      body: 'Merci',
      createdAt: new Date('2026-09-20T00:00:00.000Z'),
    } as never);
    const res = await POST(...makePost('t1', { message: 'Merci' }));
    expect(res.status).toBe(201);
    expect(prismaMock.supportTicketMessage.create).toHaveBeenCalledWith({
      data: { ticketId: 't1', authorId: 'user_1', role: 'USER', body: 'Merci' },
    });
  });

  it('creates the message and returns 201 for an IN_PROGRESS ticket', async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue({
      id: 't1',
      status: 'IN_PROGRESS',
    } as never);
    prismaMock.supportTicketMessage.create.mockResolvedValue({
      id: 'm3',
      body: 'Merci',
      createdAt: new Date(),
    } as never);
    const res = await POST(...makePost('t1', { message: 'Merci' }));
    expect(res.status).toBe(201);
  });
});
