// POST /api/analytics/events — E12 foundations.
//
// Thin ingestion endpoint for client-observed events (page views, PWA
// lifecycle, sync outcomes). Server-observed events (assistant_used,
// third_cycle_completed) call trackEvent() directly from their own route
// handler instead — this route exists only for events with no other
// natural server-side hook. Delegates all allowlist/consent enforcement
// to trackEvent(); this handler's own validation is limited to "is
// `type` one of the known event names" so a typo'd event name from a
// future client change is a loud 400, not a silently-dropped no-op.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { trackEvent } from '@/lib/server/analytics/track';
import { ANALYTICS_EVENT_TYPES } from '@/lib/analytics/events';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  type: z.enum(ANALYTICS_EVENT_TYPES as [string, ...string[]]),
  properties: z.record(z.string(), z.unknown()).default({}),
});

function jsonError(code: string, status: number, requestId: string): NextResponse {
  const res = NextResponse.json({ error: code }, { status });
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
      const text = await req.text();
      const json: unknown = text.trim().length > 0 ? JSON.parse(text) : {};
      body = Body.parse(json);
    } catch {
      return jsonError('VALIDATION_FAILED', 400, ctx.requestId);
    }

    await trackEvent(prisma, auth.user.sub, body.type as never, body.properties);

    return new NextResponse(null, { status: 204, headers: { 'x-request-id': ctx.requestId } });
  });
}
