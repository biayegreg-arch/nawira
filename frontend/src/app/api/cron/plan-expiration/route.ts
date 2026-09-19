export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';
import { withLease } from '@/lib/server/leader-lease';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { logAccountActivity } from '@/lib/server/account/activity';
import { createLogger } from '@/lib/server/logger';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const log = createLogger();
const LEASE_TTL_MS = 60_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    let processed = 0;

    await withLease(redis ?? undefined, 'plan-expiration', LEASE_TTL_MS, async () => {
      const expired = await prisma.profile.findMany({
        where: { planExpiresAt: { lt: new Date() }, plan: { not: 'FREE' } },
        select: { userId: true, plan: true },
      });

      for (const p of expired) {
        await prisma.profile.update({
          where: { userId: p.userId },
          data: { plan: 'FREE', planExpiresAt: null },
        });
        await logAccountActivity(prisma, {
          userId: p.userId,
          type: 'PLAN_EXPIRED',
          metadata: { from: p.plan },
        });
      }

      processed = expired.length;
      log.info('plan-expiration tick', { processed, requestId: ctx.requestId });
    });

    return NextResponse.json(
      { ok: true, processed },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
