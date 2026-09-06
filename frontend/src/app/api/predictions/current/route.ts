// GET /api/predictions/current — Phase 3. Read-only. `prediction: null`
// is a normal, expected 200 response (0 complete cycles, no declared
// usualCycleLength) — never treated as an error. Fertility fields
// (ovulationEstimate, fertileWindowStart/End) are intentionally omitted
// from this response shape — always null in this phase (E5, later).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const prediction = await prisma.prediction.findUnique({ where: { userId: auth.user.sub } });

    return NextResponse.json(
      {
        prediction: prediction
          ? {
              confidence: prediction.confidence,
              expectedPeriodStart: prediction.expectedPeriodStart.toISOString().slice(0, 10),
              expectedPeriodEnd: prediction.expectedPeriodEnd.toISOString().slice(0, 10),
              algorithmVersion: prediction.algorithmVersion,
              computedAt: prediction.computedAt.toISOString(),
            }
          : null,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
