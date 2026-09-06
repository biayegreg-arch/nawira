// POST /api/period-events — Phase 3.
//
// The minimal "Mes règles ont commencé" logging CTA. Always logs TODAY
// (no free-date entry — that is the full journal, E4, a later phase).
// Idempotent: a second call on the same day updates the existing row's
// flow instead of creating a duplicate, so a double-tap can never split
// an episode into two.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { recomputeCyclesAndPrediction } from '@/lib/server/cycles/recompute';
import { todayUtcDate } from '@/lib/server/cycles/date-utils';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const Body = z.object({
  flow: z.enum(['SPOTTING', 'LIGHT', 'MEDIUM', 'HEAVY']).default('MEDIUM'),
});

function jsonError(
  code: string,
  status: number,
  requestId: string,
  message?: string,
): NextResponse {
  const res = NextResponse.json({ error: code, ...(message ? { message } : {}) }, { status });
  res.headers.set('x-request-id', requestId);
  return res;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) {
      csrfFail.headers.set('x-request-id', ctx.requestId);
      return csrfFail;
    }

    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    // An absent/empty body is valid (every field has a default); malformed
    // JSON is NOT — parsing it to `{}` would silently 200 on client garbage.
    let body: z.infer<typeof Body>;
    try {
      const text = await req.text();
      const json: unknown = text.trim().length > 0 ? JSON.parse(text) : {};
      body = Body.parse(json);
    } catch {
      return jsonError('VALIDATION_FAILED', 400, ctx.requestId, 'Invalid request body');
    }

    // Writing health data requires a completed onboarding — that is where the
    // HEALTH_DATA consent is granted. No Profile means no consent.
    const profile = await prisma.profile.findUnique({
      where: { userId: auth.user.sub },
      select: { userId: true },
    });
    if (!profile) {
      return jsonError('PROFILE_NOT_FOUND', 404, ctx.requestId);
    }

    const today = todayUtcDate();

    await prisma.$transaction(async (tx) => {
      await tx.periodEvent.upsert({
        where: { userId_date: { userId: auth.user.sub, date: today } },
        create: { userId: auth.user.sub, date: today, flow: body.flow },
        update: { flow: body.flow },
      });

      await recomputeCyclesAndPrediction(tx, auth.user.sub);
    });

    log.info('period event logged', { userId: auth.user.sub, flow: body.flow });
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
