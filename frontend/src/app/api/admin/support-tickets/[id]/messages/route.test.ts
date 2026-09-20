import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn(),
}));
vi.mock('@/lib/server/outbox', () => ({
  enqueueOutbox: vi.fn(),
}));
vi.mock('@/lib/server/notifications', () => ({
  createNotification: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enqueueOutbox } from '@/lib/server/outbox';
import { createNotification } from '@/lib/server/notifications';
import { POST } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);
const mockEnqueueOutbox = vi.mocked(enqueueOutbox);
const mockCreateNotification = vi.mocked(createNotification);
const adminCtx = {
  user: { sub: 'admin_1', email: 'admin@test.local' },
  admin: { id: 'admin_1', email: 'admin@test.local', role: 'ADMIN' as const },
};

function makePost(id: string, body: unknown): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    new NextRequest(`http://test/api/admin/support-tickets/${id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx as never);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
  prismaMock.$transaction.mockImplementation(async (cb: unknown) =>
    (cb as (tx: unknown) => unknown)(prismaMock),
  );
});

describe('POST /api/admin/support-tickets/[id]/messages', () => {
  it('returns the CSRF failure response when verifyCsrf rejects', async () => {
    mockVerifyCsrf.mockReturnValueOnce(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }),
    );
    const res = await POST(...makePost('t1', { message: 'hi' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 when the caller is not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }) as never,
    );
    const res = await POST(...makePost('t1', { message: 'hi' }));
    expect(res.status).toBe(403);
  });

  it('returns 404 TICKET_NOT_FOUND for a missing ticket', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue(null);
    const res = await POST(...makePost('missing', { message: 'hi' }));
    expect(res.status).toBe(404);
  });

  it('writes the message, transitions OPEN to IN_PROGRESS, logs the action, enqueues the email, and creates the notification — all in one transaction', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue({
      id: 't1',
      status: 'OPEN',
      userId: 'user_1',
      user: { email: 'u@test.local' },
    } as never);
    prismaMock.supportTicketMessage.create.mockResolvedValue({
      id: 'm2',
      body: 'Voici la solution',
      createdAt: new Date('2026-09-20T00:00:00.000Z'),
    } as never);
    prismaMock.supportTicket.update.mockResolvedValue({} as never);

    const res = await POST(...makePost('t1', { message: 'Voici la solution' }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('IN_PROGRESS');
    expect(prismaMock.supportTicketMessage.create).toHaveBeenCalledWith({
      data: { ticketId: 't1', authorId: 'admin_1', role: 'ADMIN', body: 'Voici la solution' },
    });
    expect(prismaMock.supportTicket.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'IN_PROGRESS' },
    });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: 'admin_1',
        action: 'support_ticket.reply',
        targetType: 'SupportTicket',
        targetId: 't1',
      }),
    );
    expect(mockEnqueueOutbox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: 'email.support_ticket_reply',
        payload: expect.objectContaining({ to: 'u@test.local', ticketId: 't1' }),
      }),
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user_1',
        type: 'SUPPORT_TICKET_REPLIED',
        dedupeKey: 'support-ticket-reply:m2',
      }),
    );
  });

  it('does NOT re-transition status when the ticket is already IN_PROGRESS', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue({
      id: 't1',
      status: 'IN_PROGRESS',
      userId: 'user_1',
      user: { email: 'u@test.local' },
    } as never);
    prismaMock.supportTicketMessage.create.mockResolvedValue({
      id: 'm3',
      body: 'Suite',
      createdAt: new Date(),
    } as never);

    const res = await POST(...makePost('t1', { message: 'Suite' }));

    expect(res.status).toBe(201);
    expect(prismaMock.supportTicket.update).not.toHaveBeenCalled();
  });

  it('does NOT re-transition status when the ticket is RESOLVED (admin can still reply)', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue({
      id: 't1',
      status: 'RESOLVED',
      userId: 'user_1',
      user: { email: 'u@test.local' },
    } as never);
    prismaMock.supportTicketMessage.create.mockResolvedValue({
      id: 'm4',
      body: 'Reouvert',
      createdAt: new Date(),
    } as never);

    const res = await POST(...makePost('t1', { message: 'Reouvert' }));

    expect(res.status).toBe(201);
    expect(prismaMock.supportTicket.update).not.toHaveBeenCalled();
  });
});
