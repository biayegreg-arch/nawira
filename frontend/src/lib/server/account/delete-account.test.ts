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

  it('scrubs the User row and marks it DELETED, bumping tokenVersion to invalidate refresh tokens', async () => {
    await deleteAccount(prismaMock, 'u1', {});

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        email: 'deleted-u1@deleted.nawira.invalid',
        name: null,
        avatarUrl: null,
        passwordHash: null,
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
