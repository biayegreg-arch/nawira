// ADMIN-PRICING — GET /api/admin/pricing-plans. Read access for both ADMIN
// and SUPERADMIN (matches every other admin list route's read-tier gate).
// Only 2 rows ever exist (PLUS, BABY) — no pagination needed.
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

    const rows = await prisma.pricingPlan.findMany({ orderBy: { key: 'asc' } });
    const updaterIds = [
      ...new Set(rows.map((r) => r.updatedBy).filter((v): v is string => v !== null)),
    ];
    const updaters = updaterIds.length
      ? await prisma.user.findMany({
          where: { id: { in: updaterIds } },
          select: { id: true, email: true },
        })
      : [];
    const emailById = new Map(updaters.map((u) => [u.id, u.email]));

    const plans = rows.map((r) => ({
      key: r.key,
      priceFcfa: r.priceFcfa,
      updatedAt: r.updatedAt.toISOString(),
      updatedBy: r.updatedBy ? (emailById.get(r.updatedBy) ?? null) : null,
    }));

    return NextResponse.json({ plans }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
