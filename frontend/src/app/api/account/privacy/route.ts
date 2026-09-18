// GET /api/account/privacy — consent history + recent account-security
// activity, for the /settings "Confidentialité & sécurité" page (E8 part
// A). Read-only, no CSRF (GET is exempt from this project's CSRF policy).
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

    const userId = auth.user.sub;

    const [consents, activity] = await Promise.all([
      prisma.consent.findMany({ where: { userId }, orderBy: { grantedAt: 'desc' } }),
      prisma.accountActivity.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    return NextResponse.json(
      { consents, activity },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
