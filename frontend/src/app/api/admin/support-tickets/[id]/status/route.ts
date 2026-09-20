// PATCH /api/admin/support-tickets/[id]/status — explicit status change,
// independent of the reply route. Idempotent no-op (no AdminAction write)
// when unchanged, mirroring the plan-change route's audit-log-noise
// mitigation.
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

const Body = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) });

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
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!ticket) {
      return NextResponse.json(
        { error: 'TICKET_NOT_FOUND', message: 'Ticket not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (ticket.status === parsed.data.status) {
      return NextResponse.json(
        { status: ticket.status },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const updated = await prisma.supportTicket.update({
      where: { id },
      data: { status: parsed.data.status },
    });
    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'support_ticket.status_change',
      targetType: 'SupportTicket',
      targetId: id,
      metadata: { from: ticket.status, to: updated.status },
    });

    return NextResponse.json(
      { status: updated.status },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
