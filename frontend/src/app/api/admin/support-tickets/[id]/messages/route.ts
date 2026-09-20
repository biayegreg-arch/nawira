// POST /api/admin/support-tickets/[id]/messages — admin reply. A reply
// only ever auto-transitions OPEN -> IN_PROGRESS; RESOLVED/CLOSED tickets
// accept replies without re-transitioning (an admin can still answer a
// closed ticket without silently reopening it — status is a separate,
// explicit action via PATCH .../status).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enqueueOutbox } from '@/lib/server/outbox';
import { createNotification } from '@/lib/server/notifications';
import { supportTicketReplied } from '@/lib/server/notifications/templates';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ message: z.string().trim().min(1).max(5000) });
const REPLY_SUBJECT = 'Réponse à votre demande de support NAWIRA';

export async function POST(
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
      select: { id: true, status: true, userId: true, user: { select: { email: true } } },
    });
    if (!ticket) {
      return NextResponse.json(
        { error: 'TICKET_NOT_FOUND', message: 'Ticket not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const nextStatus = ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status;

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.supportTicketMessage.create({
        data: { ticketId: id, authorId: auth.admin.id, role: 'ADMIN', body: parsed.data.message },
      });

      if (ticket.status === 'OPEN') {
        await tx.supportTicket.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
      }

      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'support_ticket.reply',
        targetType: 'SupportTicket',
        targetId: id,
        metadata: { messageId: created.id },
      });

      await enqueueOutbox(tx, {
        kind: 'email.support_ticket_reply',
        payload: { to: ticket.user.email, subject: REPLY_SUBJECT, ticketId: id },
      });

      await createNotification(tx, supportTicketReplied(ticket.userId, id, created.id));

      return created;
    });

    return NextResponse.json(
      {
        message: { id: message.id, body: message.body, createdAt: message.createdAt.toISOString() },
        status: nextStatus,
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
