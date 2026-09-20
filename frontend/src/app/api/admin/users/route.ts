// ADMIN-01 — GET /api/admin/users (list with q + status + role filters,
// cursor pagination).
//
// Sequence (Phase 3 RESEARCH.md Pattern 1, "admin-read"):
//   makeRequestContext → withRequestContext →
//     requireAdmin('ADMIN') (D-ADMIN-03 — ADMIN suffices for PII reads) →
//     enforceAdminRateLimit(auth.admin.id) (D-ADMIN-05 — 100/min/userId) →
//     parse ?q ?status ?role ?cursor ?limit →
//     prisma.user.findMany(take=limit+1, orderBy createdAt DESC, id DESC) →
//     buildPage → return { items, nextCursor }
//
// PII whitelist: USER_SELECT excludes passwordHash / withdrawalPinHash /
// tokenVersion (T-03-02-02 — info-disclosure mitigation). The admin UI
// only needs identity + role + status + createdAt.
//
// Empty result → 200 { items: [], nextCursor: null } per D-LIST-05 — never 404.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  profile: { select: { plan: true, planExpiresAt: true } },
} as const satisfies Prisma.UserSelect;

const Q_MAX = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const q = (url.searchParams.get('q') ?? '').slice(0, Q_MAX).trim();
    const status = url.searchParams.get('status');
    const role = url.searchParams.get('role');
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    // Split from the cursor fragment: `total` must count every row matching
    // q/status/role regardless of which page the caller is on, not just the
    // rows remaining after the cursor. Also fixes a latent bug: both the q
    // search filter and cursorWhere() produce an `OR` key, so a flat spread
    // (the previous shape) silently let the cursor's OR clobber the search's
    // OR whenever a search was paginated past its first page — nest under
    // AND instead so the two OR clauses combine rather than collide.
    const baseWhere: Prisma.UserWhereInput = {
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
      ...(role ? { role } : {}),
    };
    const where: Prisma.UserWhereInput = cursor
      ? { AND: [baseWhere, cursorWhere(cursor)] }
      : baseWhere;

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: USER_SELECT,
      }),
      prisma.user.count({ where: baseWhere }),
    ]);

    const mapped = rows.map(({ profile, ...rest }) => ({
      ...rest,
      plan: profile?.plan ?? 'FREE',
      planExpiresAt: profile?.planExpiresAt ?? null,
    }));

    const page = buildPage(mapped, limit);
    return NextResponse.json(
      { ...page, total },
      {
        headers: { 'x-request-id': ctx.requestId },
      },
    );
  });
}
