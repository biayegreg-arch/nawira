// PUBLIC-PRICING — GET /api/pricing. Unauthenticated: pricing is not
// sensitive, and gating it behind login would block a future pre-signup
// pricing page. Deliberately excludes updatedAt/updatedBy (internal admin
// metadata). No admin-rate-limit — relies on the existing global IP
// limiter only.
export const runtime = 'nodejs';

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const rows = await prisma.pricingPlan.findMany({ orderBy: { key: 'asc' } });
  const plans = rows.map((r) => ({ key: r.key, priceFcfa: r.priceFcfa }));
  return NextResponse.json({ plans });
}
