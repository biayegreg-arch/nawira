// GET/PUT /api/fertility-signals/today — Phase 5 (E5 Projet Bébé).
//
// Today-only, like daily-logs/today. Unlike daily-logs/today (one row,
// full-replace upsert), FertilitySignal is normalized: up to 3 rows per
// day, one per `type` (BASAL_TEMPERATURE | CERVICAL_MUCUS | LH_TEST).
// The client-facing shape stays flat; this route folds/unfolds it
// against the 3 typed rows. No call to recomputeCyclesAndPrediction —
// signals do not feed the prediction engine this phase (no signal-
// adjustment rule engine yet — PRD §8.2 defers that to a future,
// clinically-validated version).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { todayUtcDate } from '@/lib/server/cycles/date-utils';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const Body = z
  .object({
    temperatureValue: z.number().nullable(),
    temperatureUnit: z.enum(['CELSIUS', 'FAHRENHEIT']).nullable(),
    cervicalMucusType: z.enum(['DRY', 'STICKY', 'CREAMY', 'WATERY', 'EGG_WHITE']).nullable(),
    lhResult: z.enum(['NEGATIVE', 'POSITIVE', 'PEAK', 'INCONCLUSIVE']).nullable(),
  })
  .refine((b) => (b.temperatureValue === null) === (b.temperatureUnit === null), {
    message: 'temperatureValue and temperatureUnit must be both set or both null',
  })
  .refine(
    (b) =>
      b.temperatureValue === null ||
      b.temperatureUnit === null ||
      (b.temperatureUnit === 'CELSIUS'
        ? b.temperatureValue >= 34 && b.temperatureValue <= 42
        : b.temperatureValue >= 93 && b.temperatureValue <= 108),
    { message: 'temperatureValue out of plausible range for the given unit' },
  );

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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth(req.headers.get('authorization'));
    if (auth instanceof NextResponse) {
      auth.headers.set('x-request-id', ctx.requestId);
      return auth;
    }

    const rows = await prisma.fertilitySignal.findMany({
      where: { userId: auth.user.sub, date: todayUtcDate() },
    });

    if (rows.length === 0) {
      return NextResponse.json(
        { signal: null },
        { status: 200, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const byType = new Map(rows.map((r) => [r.type, r]));
    const temperature = byType.get('BASAL_TEMPERATURE');
    const mucus = byType.get('CERVICAL_MUCUS');
    const lh = byType.get('LH_TEST');

    return NextResponse.json(
      {
        signal: {
          temperatureValue: temperature?.temperatureValue ?? null,
          temperatureUnit: temperature?.temperatureUnit ?? null,
          cervicalMucusType: mucus?.cervicalMucusType ?? null,
          lhResult: lh?.lhResult ?? null,
        },
      },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
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

    let body: z.infer<typeof Body>;
    try {
      const text = await req.text();
      const json: unknown = text.trim().length > 0 ? JSON.parse(text) : {};
      body = Body.parse(json);
    } catch {
      return jsonError('VALIDATION_FAILED', 400, ctx.requestId, 'Invalid request body');
    }

    const profile = await prisma.profile.findUnique({
      where: { userId: auth.user.sub },
      select: { userId: true },
    });
    if (!profile) {
      return jsonError('PROFILE_NOT_FOUND', 404, ctx.requestId);
    }

    const today = todayUtcDate();
    const userId = auth.user.sub;

    await prisma.$transaction(async (tx) => {
      if (body.temperatureValue !== null) {
        await tx.fertilitySignal.upsert({
          where: { userId_date_type: { userId, date: today, type: 'BASAL_TEMPERATURE' } },
          create: {
            userId,
            date: today,
            type: 'BASAL_TEMPERATURE',
            temperatureValue: body.temperatureValue,
            temperatureUnit: body.temperatureUnit,
          },
          update: {
            temperatureValue: body.temperatureValue,
            temperatureUnit: body.temperatureUnit,
          },
        });
      } else {
        await tx.fertilitySignal.deleteMany({
          where: { userId, date: today, type: 'BASAL_TEMPERATURE' },
        });
      }

      if (body.cervicalMucusType !== null) {
        await tx.fertilitySignal.upsert({
          where: { userId_date_type: { userId, date: today, type: 'CERVICAL_MUCUS' } },
          create: {
            userId,
            date: today,
            type: 'CERVICAL_MUCUS',
            cervicalMucusType: body.cervicalMucusType,
          },
          update: { cervicalMucusType: body.cervicalMucusType },
        });
      } else {
        await tx.fertilitySignal.deleteMany({
          where: { userId, date: today, type: 'CERVICAL_MUCUS' },
        });
      }

      if (body.lhResult !== null) {
        await tx.fertilitySignal.upsert({
          where: { userId_date_type: { userId, date: today, type: 'LH_TEST' } },
          create: { userId, date: today, type: 'LH_TEST', lhResult: body.lhResult },
          update: { lhResult: body.lhResult },
        });
      } else {
        await tx.fertilitySignal.deleteMany({ where: { userId, date: today, type: 'LH_TEST' } });
      }
    });

    log.info('fertility signal saved', { userId });
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
