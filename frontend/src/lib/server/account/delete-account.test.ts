import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { deleteAccount } from './delete-account';

beforeEach(() => {
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
  prismaMock.withdrawal.findFirst.mockResolvedValue(null);
  prismaMock.withdrawal.findMany.mockResolvedValue([]);
  prismaMock.withdrawal.update.mockResolvedValue({} as never);
  prismaMock.order.updateMany.mockResolvedValue({ count: 0 } as never);
  prismaMock.user.update.mockResolvedValue({} as never);
  prismaMock.accountActivity.create.mockResolvedValue({} as never);
  for (const model of [
    'verificationCode',
    'fileUpload',
    'notification',
    'notificationPreferences',
    'profile',
    'consent',
    'assistantConversation',
    'dailyLog',
    'periodEvent',
    'cycle',
    'fertilitySignal',
    'prediction',
    'insight',
    'analyticsEvent',
    'accountActivity',
    'oAuthAccount',
  ] as const) {
    prismaMock[model].deleteMany.mockResolvedValue({ count: 0 } as never);
  }
});

describe('deleteAccount', () => {
  it('blocks with 409 when a PENDING withdrawal exists, before touching any other table', async () => {
    prismaMock.withdrawal.findFirst.mockResolvedValue({ id: 'w1' } as never);

    const result = await deleteAccount(prismaMock, 'u1', {});

    expect(result).toMatchObject({
      ok: false,
      status: 409,
      code: 'DELETION_BLOCKED_PENDING_WITHDRAWAL',
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('blocks with 409 when a PROCESSING withdrawal exists', async () => {
    prismaMock.withdrawal.findFirst.mockResolvedValue({ id: 'w2' } as never);

    const result = await deleteAccount(prismaMock, 'u1', {});

    expect(result.ok).toBe(false);
    expect(prismaMock.withdrawal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', status: { in: ['PENDING', 'PROCESSING'] } },
      }),
    );
  });

  it('hard-deletes every health/behavioral table for the user, scoped by userId', async () => {
    const result = await deleteAccount(prismaMock, 'u1', {});

    expect(result).toEqual({ ok: true });
    for (const model of [
      'verificationCode',
      'fileUpload',
      'notification',
      'notificationPreferences',
      'profile',
      'consent',
      'assistantConversation',
      'dailyLog',
      'periodEvent',
      'cycle',
      'fertilitySignal',
      'prediction',
      'insight',
      'analyticsEvent',
      'accountActivity',
      'oAuthAccount',
    ] as const) {
      expect(prismaMock[model].deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    }
  });

  it('anonymizes Order rows instead of deleting them', async () => {
    await deleteAccount(prismaMock, 'u1', {});

    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { customerEmail: null, customerPhone: null, customerName: null },
    });
  });

  it('scrubs the phone/accountName out of each non-blocking Withdrawal.destination but keeps the method', async () => {
    prismaMock.withdrawal.findMany.mockResolvedValue([
      { id: 'w1', destination: { method: 'WAVE', phone: '+221700000000', accountName: 'Alice' } },
      { id: 'w2', destination: { method: 'ORANGE_MONEY', phone: '+221711111111' } },
    ] as never);

    await deleteAccount(prismaMock, 'u1', {});

    expect(prismaMock.withdrawal.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'w1' },
      data: { destination: { method: 'WAVE', phone: null, accountName: null } },
    });
    expect(prismaMock.withdrawal.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'w2' },
      data: { destination: { method: 'ORANGE_MONEY', phone: null, accountName: null } },
    });
  });

  it('scrubs the User row and marks it DELETED, bumping tokenVersion to invalidate refresh tokens', async () => {
    await deleteAccount(prismaMock, 'u1', {});

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        email: 'deleted-u1@deleted.nawira.invalid',
        name: null,
        avatarUrl: null,
        passwordHash: null,
        withdrawalPinHash: null,
        status: 'DELETED',
        tokenVersion: { increment: 1 },
      },
    });
  });

  it('logs a single final ACCOUNT_DELETED activity row after wiping the prior history', async () => {
    await deleteAccount(prismaMock, 'u1', { ip: '203.0.113.5', userAgent: 'Mozilla/5.0' });

    expect(prismaMock.accountActivity.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(prismaMock.accountActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        type: 'ACCOUNT_DELETED',
        ip: '203.0.113.5',
        userAgent: 'Mozilla/5.0',
      }),
    });
  });

  it('runs entirely inside a single transaction', async () => {
    await deleteAccount(prismaMock, 'u1', {});

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});
