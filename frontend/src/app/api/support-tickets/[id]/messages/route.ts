// POST /api/support-tickets/[id]/messages — the ticket owner replies on
// their own open/in-progress thread. 404 on ownership mismatch (never
// 403). 409 TICKET_CLOSED once the admin has resolved/closed it.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { enforceSupportRateLimit } from '@/lib/server/support/rate-limit';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ message: z.string().trim().min(1).max(5000) });

export async function POST(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceSupportRateLimit(auth.user.sub, 'reply');
    if (limited) return limited;

    const { id } = await routeCtx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: { id, userId: auth.user.sub },
      select: { id: true, status: true },
    });
    if (!ticket) {
      return NextResponse.json(
        { error: 'TICKET_NOT_FOUND', message: 'Ticket not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
      return NextResponse.json(
        { error: 'TICKET_CLOSED', message: 'This ticket is closed' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const message = await prisma.supportTicketMessage.create({
      data: { ticketId: id, authorId: auth.user.sub, role: 'USER', body: parsed.data.message },
    });

    return NextResponse.json(
      {
        message: { id: message.id, body: message.body, createdAt: message.createdAt.toISOString() },
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
