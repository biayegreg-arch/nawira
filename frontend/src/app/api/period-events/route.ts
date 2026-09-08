// POST /api/period-events — Phase 3.
//
// The minimal "Mes règles ont commencé" logging CTA logs TODAY only. This
// route also accepts an optional `startDate`/`endDate` pair (both required
// together) to backfill a whole past period in one call — one PeriodEvent
// row per day in the inclusive range, capped at MAX_RANGE_DAYS to guard
// against a mistaken/pathological range corrupting cycle history.
// Idempotent per day: re-submitting a date that already has a row updates
// its flow instead of creating a duplicate, so a double-tap or overlapping
// range can never split an episode into two.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { recomputeCyclesAndPrediction } from '@/lib/server/cycles/recompute';
import { todayUtcDate, daysBetween, addDays } from '@/lib/server/cycles/date-utils';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const MAX_RANGE_DAYS = 14;

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');

const Body = z
  .object({
    flow: z.enum(['SPOTTING', 'LIGHT', 'MEDIUM', 'HEAVY']).default('MEDIUM'),
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
  })
  .refine((b) => (b.startDate === undefined) === (b.endDate === undefined), {
    message: 'startDate and endDate must be provided together',
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

    let dates: Date[];
    if (body.startDate !== undefined && body.endDate !== undefined) {
      const start = new Date(body.startDate);
      const end = new Date(body.endDate);
      if (start.getTime() > end.getTime()) {
        return jsonError(
          'VALIDATION_FAILED',
          400,
          ctx.requestId,
          'startDate must not be after endDate',
        );
      }
      if (end.getTime() > today.getTime()) {
        return jsonError(
          'VALIDATION_FAILED',
          400,
          ctx.requestId,
          'endDate cannot be in the future',
        );
      }
      const rangeDays = daysBetween(start, end) + 1;
      if (rangeDays > MAX_RANGE_DAYS) {
        return jsonError(
          'VALIDATION_FAILED',
          400,
          ctx.requestId,
          `Range cannot exceed ${MAX_RANGE_DAYS} days`,
        );
      }
      dates = Array.from({ length: rangeDays }, (_, i) => addDays(start, i));
    } else {
      dates = [today];
    }

    await prisma.$transaction(async (tx) => {
      for (const date of dates) {
        await tx.periodEvent.upsert({
          where: { userId_date: { userId: auth.user.sub, date } },
          create: { userId: auth.user.sub, date, flow: body.flow },
          update: { flow: body.flow },
        });
      }

      await recomputeCyclesAndPrediction(tx, auth.user.sub);
    });

    log.info('period event logged', { userId: auth.user.sub, flow: body.flow, days: dates.length });
    return NextResponse.json(
      { ok: true, daysLogged: dates.length },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
