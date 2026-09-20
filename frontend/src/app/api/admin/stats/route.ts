// GET /api/admin/stats — the two KPI counts the /admin overview page can
// answer honestly from the real schema today: total active users, and
// total paid-plan (PLUS + BABY) profiles. Deliberately does NOT include
// MRR, retention rate, or revenue deltas — NAWIRA has no recurring-billing
// model (Bictorys charges are one-shot Orders; `Profile.plan` is an
// admin-granted entitlement, not a metered subscription) and no historical
// snapshot table to diff against for a trend, so those numbers cannot be
// computed without fabricating them. See .planning/banani/admin.md's
// 2026-09-20 delta for the full audit.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const [activeUsers, paidProfiles] = await Promise.all([
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.profile.count({ where: { plan: { in: ['PLUS', 'BABY'] } } }),
    ]);

    return NextResponse.json(
      { activeUsers, paidProfiles },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
