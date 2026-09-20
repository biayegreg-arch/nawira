import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const adminCtx = {
  user: { sub: 'admin_1', email: 'admin@test.local' },
  admin: { id: 'admin_1', email: 'admin@test.local', role: 'ADMIN' as const },
};

function makeGet(id: string): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    new NextRequest(`http://test/api/admin/support-tickets/${id}`, { method: 'GET' }),
    { params: Promise.resolve({ id }) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx as never);
  mockRateLimit.mockResolvedValue(null);
});

describe('GET /api/admin/support-tickets/[id]', () => {
  it('returns 403 when the caller is not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }) as never,
    );
    const res = await GET(...makeGet('t1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 TICKET_NOT_FOUND for a missing ticket', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue(null);
    const res = await GET(...makeGet('missing'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('TICKET_NOT_FOUND');
  });

  it('returns the masked email and the message thread without author emails', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue({
      id: 't1',
      subject: 'Aide',
      status: 'OPEN',
      createdAt: new Date('2026-09-20T00:00:00.000Z'),
      user: { email: 'gregory@gmail.com' },
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
    expect(body.ticket.userEmailMasked).toBe('g******@gmail.com');
    expect(JSON.stringify(body)).not.toContain('gregory@gmail.com');
    expect(body.messages[0]).toEqual({
      id: 'm1',
      role: 'USER',
      body: 'Bonjour',
      createdAt: '2026-09-20T00:00:00.000Z',
    });
  });
});
