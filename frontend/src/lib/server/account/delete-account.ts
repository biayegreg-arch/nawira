// Self-service account deletion (E8 Part B). Health and behavioral data is
// hard deleted.
//
// The User row itself is scrubbed (email/name/passwordHash cleared, status
// set to DELETED, tokenVersion bumped) rather than removed.
import 'server-only';
import type { PrismaClient } from '@prisma/client';
import { logAccountActivity } from './activity';

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

export async function deleteAccount(
  prisma: PrismaClient,
  userId: string,
  meta: { ip?: string | undefined; userAgent?: string | undefined },
): Promise<DeleteAccountResult> {
  await prisma.$transaction(
    async (tx) => {
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

      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@deleted.nawira.invalid`,
          name: null,
          avatarUrl: null,
          passwordHash: null,
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
    },
    // This transaction runs ~15 sequential queries (one deleteMany per
    // domain table, plus the final user update). Prisma's default
    // interactive-transaction timeout (5s) can be exceeded by that many
    // round-trips under real network latency (e.g. Neon), aborting an
    // otherwise-correct deletion. 15s gives comfortable headroom without
    // holding row locks indefinitely.
    { timeout: 15000 },
  );

  return { ok: true };
}
