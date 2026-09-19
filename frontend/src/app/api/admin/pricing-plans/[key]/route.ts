// ADMIN-PRICING — PATCH /api/admin/pricing-plans/[key]. SUPERADMIN-only.
// `key` is restricted to PLUS|BABY — FREE is always 0 FCFA and has no row.
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

const Body = z.object({
  priceFcfa: z.number().int().min(0).max(1_000_000),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { key } = await ctx.params;
    if (key !== 'PLUS' && key !== 'BABY') {
      return NextResponse.json(
        { error: 'PLAN_NOT_FOUND', message: 'Unknown pricing plan key' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const existing = await prisma.pricingPlan.findUnique({ where: { key } });
    if (!existing) {
      return NextResponse.json(
        { error: 'PLAN_NOT_FOUND', message: 'Unknown pricing plan key' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (existing.priceFcfa === parsed.data.priceFcfa) {
      return NextResponse.json(
        {
          plan: {
            key: existing.key,
            priceFcfa: existing.priceFcfa,
            updatedAt: existing.updatedAt.toISOString(),
            updatedBy: existing.updatedBy,
          },
        },
        { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const updated = await prisma.pricingPlan.update({
      where: { key },
      data: { priceFcfa: parsed.data.priceFcfa, updatedBy: auth.admin.id },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'pricing.update',
      targetType: 'PricingPlan',
      targetId: key,
      metadata: { from: existing.priceFcfa, to: parsed.data.priceFcfa },
    });

    return NextResponse.json(
      {
        plan: {
          key: updated.key,
          priceFcfa: updated.priceFcfa,
          updatedAt: updated.updatedAt.toISOString(),
          updatedBy: updated.updatedBy,
        },
      },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
