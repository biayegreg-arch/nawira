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

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { GET, POST } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const adminCtx = {
  user: { sub: 'admin_1', email: 'admin@test.local' },
  admin: { id: 'admin_1', email: 'admin@test.local', role: 'ADMIN' as const },
};

function makeGet(qs = ''): NextRequest {
  return new NextRequest(`http://test/api/admin/articles${qs}`, { method: 'GET' });
}
function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/articles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx as never);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('GET /api/admin/articles', () => {
  it('returns 403 when the caller is not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(
      NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }) as never,
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
  });

  it('returns items + nextCursor shape', async () => {
    prismaMock.article.findMany.mockResolvedValue([]);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('nextCursor');
  });
});

describe('POST /api/admin/articles', () => {
  it('returns 400 VALIDATION_FAILED for an empty title', async () => {
    const res = await POST(makePost({ title: '', body: 'x' }));
    expect(res.status).toBe(400);
  });

  it('auto-generates the slug from the title when none is given', async () => {
    prismaMock.article.create.mockResolvedValue({
      id: 'a1',
      title: 'Comprendre son cycle',
      slug: 'comprendre-son-cycle',
      status: 'DRAFT',
      createdAt: new Date(),
    } as never);
    const res = await POST(makePost({ title: 'Comprendre son cycle', body: 'Contenu…' }));
    expect(res.status).toBe(201);
    expect(prismaMock.article.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: 'comprendre-son-cycle', authorId: 'admin_1' }),
      }),
    );
  });

  it('returns 409 SLUG_TAKEN on a unique-constraint violation', async () => {
    prismaMock.article.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint'), { code: 'P2002' }),
    );
    const res = await POST(makePost({ title: 'Doublon', body: 'x', slug: 'doublon' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('SLUG_TAKEN');
  });
});
