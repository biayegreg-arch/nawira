// ADMIN-COUPONS — GET (ADMIN+SUPERADMIN read) and POST (SUPERADMIN create)
// /api/admin/coupons. Gated by the existing pricing:read / pricing:write tiers.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin, requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { COUPON_CODE_PATTERN, normalizeCouponCode } from '@/lib/server/coupons';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  code: z.string().transform(normalizeCouponCode).pipe(z.string().regex(COUPON_CODE_PATTERN)),
  percentOff: z.number().int().min(1).max(100),
  expiresAt: z.string().datetime().nullable().optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const rows = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    const coupons = rows.map((c) => ({
      id: c.id,
      code: c.code,
      percentOff: c.percentOff,
      active: c.active,
      expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    }));
    return NextResponse.json({ coupons }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
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
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const { code, percentOff, expiresAt } = parsed.data;

    const existing = await prisma.coupon.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json(
        { error: 'COUPON_CODE_TAKEN', message: 'A coupon with this code already exists' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const created = await prisma.coupon.create({
      data: {
        code,
        percentOff,
        createdBy: auth.admin.id,
        ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
      },
    });

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'coupon.create',
      targetType: 'Coupon',
      targetId: created.id,
      metadata: { code, percentOff },
    });

    return NextResponse.json(
      {
        coupon: {
          id: created.id,
          code: created.code,
          percentOff: created.percentOff,
          active: created.active,
          expiresAt: created.expiresAt ? created.expiresAt.toISOString() : null,
          createdAt: created.createdAt.toISOString(),
        },
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
