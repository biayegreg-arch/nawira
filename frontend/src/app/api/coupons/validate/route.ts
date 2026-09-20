// POST /api/coupons/validate — a signed-in user checks a coupon code against a
// plan on the billing page, just before requesting it. The discounted price is
// computed server-side from the live PricingPlan row (never trusted from the
// client). Every failure mode (unknown / inactive / expired) returns the same
// 404 COUPON_INVALID so codes can't be probed for existence or state.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { applyPercentOff, normalizeCouponCode } from '@/lib/server/coupons';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  code: z.string().min(1).max(64),
  plan: z.enum(['PLUS', 'BABY']),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const headers = { 'x-request-id': ctx.requestId };

    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers },
      );
    }

    const coupon = await prisma.coupon.findUnique({
      where: { code: normalizeCouponCode(parsed.data.code) },
    });
    const usable = coupon && coupon.active && (!coupon.expiresAt || coupon.expiresAt > new Date());
    if (!coupon || !usable) {
      return NextResponse.json(
        { error: 'COUPON_INVALID', message: 'Coupon invalid or expired' },
        { status: 404, headers },
      );
    }

    const plan = await prisma.pricingPlan.findUnique({ where: { key: parsed.data.plan } });
    if (!plan) {
      return NextResponse.json(
        { error: 'PLAN_NOT_FOUND', message: 'Unknown pricing plan' },
        { status: 404, headers },
      );
    }

    return NextResponse.json(
      {
        code: coupon.code,
        percentOff: coupon.percentOff,
        plan: plan.key,
        originalFcfa: plan.priceFcfa,
        discountedFcfa: applyPercentOff(plan.priceFcfa, coupon.percentOff),
      },
      { headers },
    );
  });
}
