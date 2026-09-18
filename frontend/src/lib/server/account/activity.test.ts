// Companion unit test for `account/activity.ts::logAccountActivity` —
// mirrors `frontend/src/lib/server/admin/audit.test.ts`'s structure for
// `logAdminAction`.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import { logAccountActivity } from './activity';

const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

beforeEach(() => mockReset(prismaMock));

describe('logAccountActivity', () => {
  it('writes an AccountActivity row with all fields', async () => {
    prismaMock.accountActivity.create.mockResolvedValue({} as never);

    await logAccountActivity(prismaMock, {
      userId: 'u1',
      type: 'LOGIN',
      ip: '203.0.113.5',
      userAgent: 'Mozilla/5.0',
      metadata: { via: 'password' },
    });

    expect(prismaMock.accountActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        type: 'LOGIN',
        ip: '203.0.113.5',
        userAgent: 'Mozilla/5.0',
        metadata: { via: 'password' },
      }),
    });
  });

  it('defaults optional fields to null when omitted', async () => {
    prismaMock.accountActivity.create.mockResolvedValue({} as never);

    await logAccountActivity(prismaMock, { userId: 'u2', type: 'PASSWORD_CHANGED' });

    const arg = prismaMock.accountActivity.create.mock.calls[0]?.[0];
    expect(arg?.data).toMatchObject({
      userId: 'u2',
      type: 'PASSWORD_CHANGED',
      ip: null,
      userAgent: null,
      metadata: null,
    });
  });

  it('accepts a tx-shaped client (TransactionClient subset)', async () => {
    const accountActivityCreate = vi.fn().mockResolvedValue({});
    const txMock = { accountActivity: { create: accountActivityCreate } } as never;

    await logAccountActivity(txMock, { userId: 'u3', type: 'DATA_EXPORTED' });

    expect(accountActivityCreate).toHaveBeenCalledOnce();
  });
});
