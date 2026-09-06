// PATCH /api/profile — Phase 2 OB10 (notification level).
//
// Minimal profile-update endpoint: sets Profile.notificationLevel and, if
// the chosen level isn't NONE, grants the PRD's C04 NOTIFICATIONS consent
// (idempotently — skips if one is already granted). There is no path back
// to NONE within this one-time onboarding flow, so revocation is out of
// scope here, not silently skipped.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { log } from '@/lib/server/observability/log';

const CONSENT_VERSION = 1;

const Body = z.object({
  notificationLevel: z.enum(['NORMAL', 'DISCREET', 'NONE']),
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

export async function PATCH(req: NextRequest): Promise<NextResponse> {
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

    const profile = await prisma.profile.findUnique({
      where: { userId: auth.user.sub },
      select: { userId: true },
    });
    if (!profile) {
      return jsonError('PROFILE_NOT_FOUND', 404, ctx.requestId);
    }

    await prisma.$transaction(async (tx) => {
      await tx.profile.update({
        where: { userId: auth.user.sub },
        data: { notificationLevel: body.notificationLevel },
      });

      if (body.notificationLevel !== 'NONE') {
        const existingConsent = await tx.consent.findFirst({
          where: { userId: auth.user.sub, type: 'NOTIFICATIONS', revokedAt: null },
          select: { id: true },
        });
        if (!existingConsent) {
          await tx.consent.create({
            data: { userId: auth.user.sub, type: 'NOTIFICATIONS', version: CONSENT_VERSION },
          });
        }
      }
    });

    log.info('profile updated', {
      userId: auth.user.sub,
      notificationLevel: body.notificationLevel,
    });
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
