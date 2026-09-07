// GET /api/predictions/current — Phase 3, extended Phase 5 (E5).
// Read-only. `prediction: null` is a normal, expected 200 response (0
// complete cycles, no declared usualCycleLength) — never treated as an
// error. ovulationEstimate/fertileWindowStart/fertileWindowEnd are the
// fenêtre-fertile fields computed by computeFertilityWindow() inside
// recompute.ts — null together whenever there's no prediction to derive
// them from.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

function isoDateOrNull(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

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
              ovulationEstimate: isoDateOrNull(prediction.ovulationEstimate),
              fertileWindowStart: isoDateOrNull(prediction.fertileWindowStart),
              fertileWindowEnd: isoDateOrNull(prediction.fertileWindowEnd),
            }
          : null,
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
