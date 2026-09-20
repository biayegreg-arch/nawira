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
import { GET, PATCH, DELETE } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const adminCtx = {
  user: { sub: 'admin_1', email: 'admin@test.local' },
  admin: { id: 'admin_1', email: 'admin@test.local', role: 'ADMIN' as const },
};

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}
function makeGet(id: string): NextRequest {
  return new NextRequest(`http://test/api/admin/articles/${id}`, { method: 'GET' });
}
function makePatch(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://test/api/admin/articles/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function makeDelete(id: string): NextRequest {
  return new NextRequest(`http://test/api/admin/articles/${id}`, { method: 'DELETE' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx as never);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('GET /api/admin/articles/[id]', () => {
  it('returns 404 ARTICLE_NOT_FOUND for a missing article', async () => {
    prismaMock.article.findUnique.mockResolvedValue(null);
    const res = await GET(makeGet('missing'), ctxWith('missing'));
    expect(res.status).toBe(404);
  });

  it('returns the full article', async () => {
    prismaMock.article.findUnique.mockResolvedValue({
      id: 'a1',
      title: 'T',
      slug: 't',
      body: 'B',
      status: 'DRAFT',
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    const res = await GET(makeGet('a1'), ctxWith('a1'));
    expect(res.status).toBe(200);
    expect((await res.json()).article).toMatchObject({ id: 'a1', title: 'T', body: 'B' });
  });
});

describe('PATCH /api/admin/articles/[id]', () => {
  it('sets publishedAt only on the first DRAFT -> PUBLISHED transition', async () => {
    prismaMock.article.findUnique.mockResolvedValue({
      id: 'a1',
      status: 'DRAFT',
      publishedAt: null,
    } as never);
    prismaMock.article.update.mockResolvedValue({
      id: 'a1',
      title: 'T',
      slug: 't',
      body: 'B',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-09-20T00:00:00.000Z'),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    await PATCH(makePatch('a1', { status: 'PUBLISHED' }), ctxWith('a1'));
    expect(prismaMock.article.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PUBLISHED', publishedAt: expect.any(Date) }),
      }),
    );
  });

  it('does not reset publishedAt on a subsequent edit while already PUBLISHED', async () => {
    const originalPublishedAt = new Date('2026-01-01T00:00:00.000Z');
    prismaMock.article.findUnique.mockResolvedValue({
      id: 'a1',
      status: 'PUBLISHED',
      publishedAt: originalPublishedAt,
    } as never);
    prismaMock.article.update.mockResolvedValue({
      id: 'a1',
      title: 'T2',
      slug: 't',
      body: 'B2',
      status: 'PUBLISHED',
      publishedAt: originalPublishedAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    await PATCH(makePatch('a1', { title: 'T2', body: 'B2' }), ctxWith('a1'));
    const call = prismaMock.article.update.mock.calls[0]?.[0];
    expect(call?.data).not.toHaveProperty('publishedAt');
  });

  it('does not reset publishedAt on a republish (PUBLISHED -> DRAFT -> PUBLISHED again)', async () => {
    const originalPublishedAt = new Date('2026-01-01T00:00:00.000Z');
    // Article was published on 2026-01-01, later unpublished back to DRAFT
    // (publishedAt correctly preserved through that transition), and is now
    // being republished. existing.status === 'DRAFT' is true here, so the
    // naive "existing.status === DRAFT && target === PUBLISHED" guard would
    // wrongly treat this as a first publish and stomp the original date.
    prismaMock.article.findUnique.mockResolvedValue({
      id: 'a1',
      status: 'DRAFT',
      publishedAt: originalPublishedAt,
    } as never);
    prismaMock.article.update.mockResolvedValue({
      id: 'a1',
      title: 'T',
      slug: 't',
      body: 'B',
      status: 'PUBLISHED',
      publishedAt: originalPublishedAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    await PATCH(makePatch('a1', { status: 'PUBLISHED' }), ctxWith('a1'));
    const call = prismaMock.article.update.mock.calls[0]?.[0];
    expect(call?.data).not.toHaveProperty('publishedAt');
  });

  it('returns 409 SLUG_TAKEN on a unique-constraint violation', async () => {
    prismaMock.article.findUnique.mockResolvedValue({
      id: 'a1',
      status: 'DRAFT',
      publishedAt: null,
    } as never);
    prismaMock.article.update.mockRejectedValue(
      Object.assign(new Error('Unique constraint'), { code: 'P2002' }),
    );
    const res = await PATCH(makePatch('a1', { slug: 'taken' }), ctxWith('a1'));
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/admin/articles/[id]', () => {
  it('deletes the article and returns 200', async () => {
    prismaMock.article.findUnique.mockResolvedValue({ id: 'a1', title: 'T', slug: 't' } as never);
    prismaMock.article.delete.mockResolvedValue({} as never);
    const res = await DELETE(makeDelete('a1'), ctxWith('a1'));
    expect(res.status).toBe(200);
    expect(prismaMock.article.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
    expect(vi.mocked(logAdminAction)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'article.delete',
        targetId: 'a1',
        metadata: { title: 'T', slug: 't' },
      }),
    );
  });

  it('returns 404 ARTICLE_NOT_FOUND for a missing article', async () => {
    prismaMock.article.findUnique.mockResolvedValue(null);
    const res = await DELETE(makeDelete('missing'), ctxWith('missing'));
    expect(res.status).toBe(404);
  });
});
