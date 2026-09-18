// DELETE /api/account — self-service account deletion (E8 Part B). Health
// and behavioral data (cycles, journal, fertility signals, assistant
// history, consents, notifications, uploads, OAuth links) is hard deleted.
// Financial records (Order, Withdrawal) are anonymized, never deleted — see
// lib/server/account/delete-account.ts for the full rationale.
//
// Requires a literal `{ "confirmation": "DELETE" }` body as a
// deliberate-intent gate. Chosen over a current-password re-check because
// it works uniformly for both password and OAuth-only users (who have no
// password to re-enter).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf, clearAuthCookies, clearCsrfCookie } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { deleteAccount } from '@/lib/server/account/delete-account';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ confirmation: z.literal('DELETE') });

export async function DELETE(req: NextRequest): Promise<NextResponse> {
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

    try {
      const text = await req.text();
      Body.parse(text.trim().length > 0 ? JSON.parse(text) : {});
    } catch {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Missing or invalid confirmation.' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const userAgent = req.headers.get('user-agent') ?? undefined;
    const result = await deleteAccount(prisma, auth.user.sub, { ip, userAgent });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.code, message: result.message },
        { status: result.status, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await clearAuthCookies();
    await clearCsrfCookie();

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
