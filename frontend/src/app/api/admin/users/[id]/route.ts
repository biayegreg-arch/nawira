// ADMIN-01 — GET /api/admin/users/[id] (detail).
//
// Sequence: makeRequestContext → withRequestContext → requireAdmin('ADMIN')
// → enforceAdminRateLimit → prisma.user.findUnique with the same PII-safe
// USER_SELECT shape as the list endpoint. 404 on miss with stable code
// USER_NOT_FOUND.
//
// DELETE /api/admin/users/[id] — SUPERADMIN-only admin-initiated deletion.
// Reuses the same deleteAccount() helper as the self-service DELETE
// /api/account route (hard-deletes health/behavioral data, anonymizes
// financial records — see lib/server/account/delete-account.ts). Requires
// a literal `{ confirmation: 'DELETE' }` body as a deliberate-intent gate,
// mirroring the self-service route. Refuses to delete the last SUPERADMIN
// (same guard as the role-change route) since deletion strips access just
// as effectively as a demotion would.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin, requireSuperadmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { deleteAccount } from '@/lib/server/account/delete-account';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  profile: { select: { plan: true, planExpiresAt: true } },
} as const satisfies Prisma.UserSelect;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const row = await prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!row) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    const { profile, ...rest } = row;
    const user = {
      ...rest,
      plan: profile?.plan ?? 'FREE',
      planExpiresAt: profile?.planExpiresAt ?? null,
    };
    return NextResponse.json({ user }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}

const DeleteBody = z.object({ confirmation: z.literal('DELETE') });

export async function DELETE(
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
    const parsed = DeleteBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Missing or invalid confirmation.' },
        { status: 400, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true, status: true },
    });
    if (!target) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User not found' },
        { status: 404, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (target.status === 'DELETED') {
      return NextResponse.json(
        { error: 'ALREADY_DELETED', message: 'This account is already deleted.' },
        { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }
    if (target.role === 'SUPERADMIN') {
      const superadminCount = await prisma.user.count({ where: { role: 'SUPERADMIN' } });
      if (superadminCount <= 1) {
        return NextResponse.json(
          { error: 'LAST_SUPERADMIN', message: 'Refuse to delete the last SUPERADMIN.' },
          { status: 409, headers: { 'x-request-id': reqCtx.requestId } },
        );
      }
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const userAgent = req.headers.get('user-agent') ?? undefined;
    const result = await deleteAccount(prisma, id, { ip, userAgent });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.code, message: result.message },
        { status: result.status, headers: { 'x-request-id': reqCtx.requestId } },
      );
    }

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'user.delete',
      targetType: 'User',
      targetId: id,
      metadata: { email: target.email },
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': reqCtx.requestId } },
    );
  });
}
