// Self-service account deletion (E8 Part B). Health and behavioral data is
// hard deleted; financial records (Order, Withdrawal) are anonymized in
// place — never deleted — since they may carry accounting/legal retention
// obligations this starter doesn't assume away.
//
// The User row itself is scrubbed (email/name/passwordHash cleared, status
// set to DELETED, tokenVersion bumped) rather than removed. Keeping the row
// gives Order/Withdrawal a still-valid userId to anonymize against instead
// of nulling it out — Withdrawal.userId is `onDelete: Restrict` specifically
// to prevent losing that trail, so a real `User.delete` would fail outright
// for any user with withdrawal history.
//
// A PENDING/PROCESSING withdrawal blocks deletion entirely: its `destination`
// (payout phone/account) is still needed to actually move money, so
// anonymizing it out from under an in-flight payout would strand it.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { logAccountActivity } from './activity';

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

const BLOCKING_WITHDRAWAL_STATUSES = ['PENDING', 'PROCESSING'];

export async function deleteAccount(
  prisma: PrismaClient,
  userId: string,
  meta: { ip?: string | undefined; userAgent?: string | undefined },
): Promise<DeleteAccountResult> {
  const blocking = await prisma.withdrawal.findFirst({
    where: { userId, status: { in: BLOCKING_WITHDRAWAL_STATUSES } },
    select: { id: true },
  });
  if (blocking) {
    return {
      ok: false,
      status: 409,
      code: 'DELETION_BLOCKED_PENDING_WITHDRAWAL',
      message: 'A withdrawal is currently being processed; try again once it completes.',
    };
  }

  await prisma.$transaction(async (tx) => {
    // Health / behavioral / self-service data — hard deleted. DailyLog and
    // AssistantConversation cascade to SymptomLog and AssistantMessage at
    // the Postgres FK level (ON DELETE CASCADE), so no separate deleteMany
    // is needed for those two child tables.
    await tx.verificationCode.deleteMany({ where: { userId } });
    await tx.fileUpload.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.notificationPreferences.deleteMany({ where: { userId } });
    await tx.profile.deleteMany({ where: { userId } });
    await tx.consent.deleteMany({ where: { userId } });
    await tx.assistantConversation.deleteMany({ where: { userId } });
    await tx.dailyLog.deleteMany({ where: { userId } });
    await tx.periodEvent.deleteMany({ where: { userId } });
    await tx.cycle.deleteMany({ where: { userId } });
    await tx.fertilitySignal.deleteMany({ where: { userId } });
    await tx.prediction.deleteMany({ where: { userId } });
    await tx.insight.deleteMany({ where: { userId } });
    await tx.analyticsEvent.deleteMany({ where: { userId } });
    await tx.accountActivity.deleteMany({ where: { userId } });
    await tx.oAuthAccount.deleteMany({ where: { userId } });

    // Financial data — anonymized, never deleted.
    await tx.order.updateMany({
      where: { userId },
      data: { customerEmail: null, customerPhone: null, customerName: null },
    });

    const withdrawals = await tx.withdrawal.findMany({
      where: { userId },
      select: { id: true, destination: true },
    });
    for (const w of withdrawals) {
      const destination = w.destination as unknown as { method?: string } | null;
      await tx.withdrawal.update({
        where: { id: w.id },
        data: {
          destination: { method: destination?.method ?? null, phone: null, accountName: null },
        },
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@deleted.nawira.invalid`,
        name: null,
        avatarUrl: null,
        passwordHash: null,
        withdrawalPinHash: null,
        status: 'DELETED',
        tokenVersion: { increment: 1 },
      },
    });

    await logAccountActivity(tx, {
      userId,
      type: 'ACCOUNT_DELETED',
      ...(meta.ip !== undefined ? { ip: meta.ip } : {}),
      ...(meta.userAgent !== undefined ? { userAgent: meta.userAgent } : {}),
    });
  });

  return { ok: true };
}
