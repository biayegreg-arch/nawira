// ADMIN-COUPONS — PATCH (activate/deactivate) and DELETE /api/admin/coupons/[id].
// SUPERADMIN-only, audited.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ active: z.boolean() });

function notFound(requestId: string): NextResponse {
  return NextResponse.json(
    { error: 'COUPON_NOT_FOUND', message: 'Coupon not found' },
    { status: 404, headers: { 'x-request-id': requestId } },
  );
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const { id } = await ctx.params;
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) return notFound(reqCtx.requestId);

    const updated = await prisma.coupon.update({
      where: { id },
      data: { active: parsed.data.active },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'coupon.update',
      targetType: 'Coupon',
      targetId: id,
      metadata: { code: existing.code, from: existing.active, to: updated.active },
    });

    return NextResponse.json(
      {
        coupon: {
          id: updated.id,
          code: updated.code,
          percentOff: updated.percentOff,
          active: updated.active,
          expiresAt: updated.expiresAt ? updated.expiresAt.toISOString() : null,
          createdAt: updated.createdAt.toISOString(),
        },
      },
      { headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) return notFound(reqCtx.requestId);

    await prisma.coupon.delete({ where: { id } });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'coupon.delete',
      targetType: 'Coupon',
      targetId: id,
      metadata: { code: existing.code, percentOff: existing.percentOff },
    });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
