import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { PATCH } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);
const adminCtx = {
  user: { sub: 'admin_1', email: 'admin@test.local' },
  admin: { id: 'admin_1', email: 'admin@test.local', role: 'ADMIN' as const },
};

function makePatch(id: string, body: unknown): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    new NextRequest(`http://test/api/admin/support-tickets/${id}/status`, {
      method: 'PATCH',
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
});

describe('PATCH /api/admin/support-tickets/[id]/status', () => {
  it('returns 400 VALIDATION_FAILED for an invalid status value', async () => {
    const res = await PATCH(...makePatch('t1', { status: 'DONE' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 TICKET_NOT_FOUND for a missing ticket', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue(null);
    const res = await PATCH(...makePatch('missing', { status: 'RESOLVED' }));
    expect(res.status).toBe(404);
  });

  it('is idempotent (200, no write, no AdminAction) when the status is unchanged', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue({
      id: 't1',
      status: 'RESOLVED',
    } as never);
    const res = await PATCH(...makePatch('t1', { status: 'RESOLVED' }));
    expect(res.status).toBe(200);
    expect(prismaMock.supportTicket.update).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('updates the status and logs the admin action on an actual change', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue({
      id: 't1',
      status: 'IN_PROGRESS',
    } as never);
    prismaMock.supportTicket.update.mockResolvedValue({ status: 'RESOLVED' } as never);
    const res = await PATCH(...makePatch('t1', { status: 'RESOLVED' }));
    expect(res.status).toBe(200);
    expect(prismaMock.supportTicket.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'RESOLVED' },
    });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: 'admin_1',
        action: 'support_ticket.status_change',
        targetType: 'SupportTicket',
        targetId: 't1',
        metadata: { from: 'IN_PROGRESS', to: 'RESOLVED' },
      }),
    );
  });
});
