/**
 * User-facing account activity log. Call after any security-relevant
 * self-service action so the /settings privacy page can show it back to
 * the user ("was this really me?").
 *
 *   await logAccountActivity(prisma, {
 *     userId: auth.user.sub,
 *     type: 'PASSWORD_CHANGED',
 *     ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
 *     userAgent: req.headers.get('user-agent') ?? undefined,
 *   });
 *
 * Type naming: stable uppercase strings, the /settings UI switches on them
 * directly — do not rename an existing type once shipped.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

export type AccountActivityType =
  | 'LOGIN'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_SET'
  | 'OAUTH_LINKED'
  | 'DATA_EXPORTED';

export interface AccountActivityInput {
  userId: string;
  type: AccountActivityType;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export type AccountActivityClient = Pick<PrismaClient, 'accountActivity'>;

export async function logAccountActivity(
  prisma: AccountActivityClient,
  input: AccountActivityInput,
): Promise<void> {
  await prisma.accountActivity.create({
    data: {
      userId: input.userId,
      type: input.type,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata: (input.metadata ?? null) as unknown as Prisma.InputJsonValue,
    },
  });
}
