// ADMIN-PLAN — PATCH /api/admin/users/[id]/plan
//
// SUPERADMIN-only plan grant/revoke, optionally time-bounded. Mirrors
// PATCH /api/admin/users/[id]/role's shape (SUPERADMIN + transaction +
// logAdminAction) but also writes to the user-facing AccountActivity
// trail (E8) since a plan change is something the user themselves should
// see in their own privacy/activity log.
//
// Setting plan: 'FREE' always force-writes planExpiresAt: null, even if
// the caller didn't pass expiresAt — revoking access must never leave a
// stale expiry date behind that a later re-grant could accidentally
// inherit. Providing expiresAt together with plan: 'FREE' is rejected
// outright (VALIDATION_FAILED) rather than silently ignored.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { logAccountActivity } from '@/lib/server/account/activity';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z
  .object({
    plan: z.enum(['FREE', 'PLUS', 'BABY']),
    expiresAt: z.string().datetime().optional(),
  })
  .refine((v) => !(v.plan === 'FREE' && v.expiresAt !== undefined), {
    message: 'expiresAt is not allowed together with plan FREE',
  })
  .refine((v) => v.expiresAt === undefined || new Date(v.expiresAt).getTime() > Date.now(), {
    message: 'expiresAt must be a future date',
  });

type Discriminator =
  | { kind: 'NOT_FOUND' }
  | { kind: 'PROFILE_NOT_FOUND' }
  | { kind: 'NOOP'; profile: { plan: string; planExpiresAt: Date | null } }
  | { kind: 'OK'; from: string; profile: { plan: string; planExpiresAt: Date | null } };

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireSuperadmin();
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const nextExpiresAt = parsed.data.plan === 'FREE' ? null : (parsed.data.expiresAt ?? null);
    const nextExpiresAtDate = nextExpiresAt ? new Date(nextExpiresAt) : null;

    const result: Discriminator = await prisma.$transaction(async (tx) => {
      const target = await tx.profile.findUnique({
        where: { userId: id },
        select: { plan: true, planExpiresAt: true },
      });
      if (!target) {
        const existingUser = await tx.user.findUnique({ where: { id }, select: { id: true } });
        if (!existingUser) return { kind: 'NOT_FOUND' as const };
        return { kind: 'PROFILE_NOT_FOUND' as const };
      }

      const unchanged =
        target.plan === parsed.data.plan &&
        (target.planExpiresAt?.getTime() ?? null) === (nextExpiresAtDate?.getTime() ?? null);
      if (unchanged) {
        return { kind: 'NOOP' as const, profile: target };
      }

      const updated = await tx.profile.update({
        where: { userId: id },
        data: { plan: parsed.data.plan, planExpiresAt: nextExpiresAtDate },
      });

      const metadata = {
        from: target.plan,
        to: updated.plan,
        expiresAt: updated.planExpiresAt ? updated.planExpiresAt.toISOString() : null,
      };
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'user.plan_change',
        targetType: 'User',
        targetId: id,
        metadata,
      });
      await logAccountActivity(tx, { userId: id, type: 'PLAN_CHANGED', metadata });

      return {
        kind: 'OK' as const,
        from: target.plan,
        profile: { plan: updated.plan, planExpiresAt: updated.planExpiresAt },
      };
    });

    if (result.kind === 'NOT_FOUND') {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    if (result.kind === 'PROFILE_NOT_FOUND') {
      return NextResponse.json(
        {
          error: 'PROFILE_NOT_FOUND',
          message: "This user hasn't completed onboarding yet; no plan can be assigned.",
        },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    return NextResponse.json(
      {
        profile: {
          plan: result.profile.plan,
          planExpiresAt: result.profile.planExpiresAt
            ? result.profile.planExpiresAt.toISOString()
            : null,
        },
      },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
