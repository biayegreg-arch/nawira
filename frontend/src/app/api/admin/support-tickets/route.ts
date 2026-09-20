// GET /api/admin/support-tickets — filterable, cursor-paginated queue.
// Never returns the raw reporting-user email — only userEmailMasked.
// See POST .../[id]/reveal for the audited unmask action.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { maskEmail } from '@/lib/server/support/mask-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const VALID_STATUSES: string[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

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

    const rows = await prisma.supportTicket.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        subject: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
        user: { select: { email: true } },
      },
    });

    const mapped = rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      messageCount: r._count.messages,
      userEmailMasked: maskEmail(r.user.email),
    }));

    return NextResponse.json(buildPage(mapped, limit), {
      headers: { 'x-request-id': ctx.requestId },
    });
  });
}
