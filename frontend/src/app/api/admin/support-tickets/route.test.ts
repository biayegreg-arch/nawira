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

function makeGet(qs = ''): NextRequest {
  return new NextRequest(`http://test/api/admin/support-tickets${qs}`, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx as never);
  mockRateLimit.mockResolvedValue(null);
});

describe('GET /api/admin/support-tickets', () => {
  it('returns 403 when the caller is not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }) as never,
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
  });

  it('masks the reporting user email in every row, never returning the raw address', async () => {
    prismaMock.supportTicket.findMany.mockResolvedValue([
      {
        id: 't1',
        subject: 'Aide',
        status: 'OPEN',
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { messages: 2 },
        user: { email: 'gregory@gmail.com' },
      },
    ] as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.items[0].userEmailMasked).toBe('g******@gmail.com');
    expect(JSON.stringify(body)).not.toContain('gregory@gmail.com');
  });

  it('combines the status filter with cursor pagination via AND (never lets the cursor clobber the filter)', async () => {
    prismaMock.supportTicket.findMany.mockResolvedValue([]);
    await GET(
      makeGet(
        '?status=OPEN&cursor=eyJjcmVhdGVkQXQiOiIyMDI2LTAxLTAxVDAwOjAwOjAwLjAwMFoiLCJpZCI6InQxIn0=',
      ),
    );
    const call = prismaMock.supportTicket.findMany.mock.calls[0]?.[0];
    expect(call?.where).toHaveProperty('AND');
  });

  it('applies the status filter alone when no cursor is given', async () => {
    prismaMock.supportTicket.findMany.mockResolvedValue([]);
    await GET(makeGet('?status=OPEN'));
    expect(prismaMock.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'OPEN' } }),
    );
  });
});
