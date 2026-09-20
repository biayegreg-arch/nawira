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
import { POST } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);
const adminCtx = {
  user: { sub: 'admin_1', email: 'admin@test.local' },
  admin: { id: 'admin_1', email: 'admin@test.local', role: 'ADMIN' as const },
};

function makePost(id: string): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    new NextRequest(`http://test/api/admin/support-tickets/${id}/reveal`, { method: 'POST' }),
    { params: Promise.resolve({ id }) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx as never);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('POST /api/admin/support-tickets/[id]/reveal', () => {
  it('returns 404 TICKET_NOT_FOUND for a missing ticket', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue(null);
    const res = await POST(...makePost('missing'));
    expect(res.status).toBe(404);
  });

  it('returns the raw email and logs an audited reveal action', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue({
      id: 't1',
      user: { email: 'gregory@gmail.com' },
    } as never);
    const res = await POST(...makePost('t1'));
    expect(res.status).toBe(200);
    expect((await res.json()).email).toBe('gregory@gmail.com');
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: 'admin_1',
        action: 'support_ticket.reveal_pii',
        targetType: 'SupportTicket',
        targetId: 't1',
      }),
    );
  });
});
