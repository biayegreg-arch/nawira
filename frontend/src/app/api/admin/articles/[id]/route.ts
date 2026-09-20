// GET/PATCH/DELETE /api/admin/articles/[id]. PATCH sets publishedAt ONLY
// on the DRAFT -> PUBLISHED transition — later edits (including
// PUBLISHED -> DRAFT -> PUBLISHED again) never move it, matching how
// most CMSes distinguish "first published" from "last updated"
// (article.updatedAt already covers the latter).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PatchBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(20000).optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
});

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

function serialize(a: {
  id: string;
  title: string;
  slug: string;
  body: string;
  status: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: a.id,
    title: a.title,
    slug: a.slug,
    body: a.body,
    status: a.status,
    publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export async function GET(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await routeCtx.params;
    const article = await prisma.article.findUnique({ where: { id } });
    if (!article) {
      return NextResponse.json(
        { error: 'ARTICLE_NOT_FOUND', message: 'Article not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    return NextResponse.json(
      { article: serialize(article) },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function PATCH(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await routeCtx.params;
    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existing = await prisma.article.findUnique({
      where: { id },
      select: { status: true, publishedAt: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'ARTICLE_NOT_FOUND', message: 'Article not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const firstPublish = existing.status === 'DRAFT' && parsed.data.status === 'PUBLISHED';

    try {
      const updated = await prisma.article.update({
        where: { id },
        data: {
          ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
          ...(parsed.data.body !== undefined ? { body: parsed.data.body } : {}),
          ...(parsed.data.slug !== undefined ? { slug: parsed.data.slug } : {}),
          ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
          ...(firstPublish ? { publishedAt: new Date() } : {}),
        },
      });
      await logAdminAction(prisma, {
        actorId: auth.admin.id,
        action: 'article.update',
        targetType: 'Article',
        targetId: id,
      });
      return NextResponse.json(
        { article: serialize(updated) },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        return NextResponse.json(
          { error: 'SLUG_TAKEN', message: 'This slug is already in use' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}

export async function DELETE(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await routeCtx.params;
    const existing = await prisma.article.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json(
        { error: 'ARTICLE_NOT_FOUND', message: 'Article not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.article.delete({ where: { id } });
    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'article.delete',
      targetType: 'Article',
      targetId: id,
    });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
