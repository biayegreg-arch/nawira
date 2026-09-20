// POST /api/admin/support-tickets/[id]/reveal — the ONLY route that
// returns the reporting user's raw email. Every call is audited via
// logAdminAction (PRD "recherche compte support par identifiant sécurisé").
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

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
    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, user: { select: { email: true } } },
    });
    if (!ticket) {
      return NextResponse.json(
        { error: 'TICKET_NOT_FOUND', message: 'Ticket not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'support_ticket.reveal_pii',
      targetType: 'SupportTicket',
      targetId: id,
    });

    return NextResponse.json(
      { email: ticket.user.email },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
