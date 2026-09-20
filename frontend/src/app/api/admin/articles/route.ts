// GET  /api/admin/articles — list, cursor-paginated, optional ?status.
// POST /api/admin/articles — create a DRAFT article. slug auto-generated
// from title via slugify() when omitted; 409 SLUG_TAKEN on collision
// (no auto-retry — the admin edits and resubmits).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { slugify } from '@/lib/server/slug';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const CreateBody = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

const VALID_STATUSES: string[] = ['DRAFT', 'PUBLISHED'];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const status = url.searchParams.get('status');
    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid status filter' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const cursor = decodeCursor(url.searchParams.get('cursor'));
    const baseWhere = status ? { status } : {};
    const where = cursor ? { AND: [baseWhere, cursorWhere(cursor)] } : baseWhere;

    const rows = await prisma.article.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: { id: true, title: true, slug: true, status: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json(buildPage(rows, limit), {
      headers: { 'x-request-id': ctx.requestId },
    });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const slug = parsed.data.slug ?? slugify(parsed.data.title);

    try {
      const article = await prisma.article.create({
        data: {
          title: parsed.data.title,
          body: parsed.data.body,
          slug,
          authorId: auth.admin.id,
          status: 'DRAFT',
        },
      });
      await logAdminAction(prisma, {
        actorId: auth.admin.id,
        action: 'article.create',
        targetType: 'Article',
        targetId: article.id,
      });
      return NextResponse.json(
        {
          article: {
            id: article.id,
            title: article.title,
            slug: article.slug,
            status: article.status,
            createdAt: article.createdAt.toISOString(),
          },
        },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
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
