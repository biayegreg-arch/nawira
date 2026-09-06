// POST /api/onboarding/complete — Phase 2.
//
// One-time onboarding submission: creates the caller's Profile row and one
// Consent row per granted consent type, plus an optional PeriodEvent when
// the user supplied a last-known period date (OB04). All in one Prisma
// transaction so a partial failure never leaves an inconsistent state.
//
// Consent-before-storage (PRD §12): this route is deliberately the FIRST
// point any onboarding answer reaches the server — everything before it
// (OB03-OB08's answers) lives in client-side sessionStorage only.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { zPositiveInt } from '@/lib/server/zod-helpers';
import { isAdult } from '@/lib/age';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const CONSENT_VERSION = 1;

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date');

const Body = z.object({
  birthDate: isoDate,
  goal: z.enum(['PERIOD_TRACKING', 'UNDERSTAND_CYCLE', 'TRYING_TO_CONCEIVE']),
  lastPeriodDate: isoDate.nullable(),
  usualPeriodLength: zPositiveInt.nullable(),
  usualCycleLength: zPositiveInt.nullable(),
  trackedConcerns: z.array(z.string()),
  consents: z.object({
    ACCOUNT: z.literal(true),
    HEALTH_DATA: z.literal(true),
    ASSISTANT_HISTORY: z.boolean(),
    ANALYTICS: z.boolean(),
    MARKETING: z.boolean(),
  }),
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

    let body: z.infer<typeof Body>;
    try {
      const json = await req.json();
      body = Body.parse(json);
    } catch {
      return jsonError('VALIDATION_FAILED', 400, ctx.requestId, 'Invalid request body');
    }

    const existing = await prisma.profile.findUnique({
      where: { userId: auth.user.sub },
      select: { userId: true },
    });
    if (existing) {
      return jsonError(
        'PROFILE_ALREADY_EXISTS',
        400,
        ctx.requestId,
        'Onboarding was already completed.',
      );
    }

    if (!isAdult(body.birthDate)) {
      return jsonError(
        'UNDER_MINIMUM_AGE',
        400,
        ctx.requestId,
        'NAWIRA requires users to be 18 or older.',
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.profile.create({
        data: {
          userId: auth.user.sub,
          birthDate: new Date(body.birthDate),
          goal: body.goal,
          usualCycleLength: body.usualCycleLength,
          usualPeriodLength: body.usualPeriodLength,
          trackedConcerns: body.trackedConcerns,
        },
      });

      const grantedTypes = (Object.keys(body.consents) as Array<keyof typeof body.consents>).filter(
        (key) => body.consents[key],
      );
      for (const type of grantedTypes) {
        await tx.consent.create({
          data: { userId: auth.user.sub, type, version: CONSENT_VERSION },
        });
      }

      if (body.lastPeriodDate) {
        await tx.periodEvent.create({
          data: {
            userId: auth.user.sub,
            date: new Date(body.lastPeriodDate),
            flow: 'MEDIUM',
          },
        });
      }
    });

    log.info('onboarding complete', { userId: auth.user.sub });
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
