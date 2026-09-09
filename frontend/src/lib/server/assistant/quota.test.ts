import { describe, it, expect, beforeEach } from 'vitest';
import { checkAndConsumeQuota, __resetAssistantQuotaStore } from './quota';

describe('checkAndConsumeQuota', () => {
  beforeEach(() => {
    __resetAssistantQuotaStore();
  });

  it('allows up to the daily limit (10) then blocks the 11th message', async () => {
    for (let i = 0; i < 10; i++) {
      const result = await checkAndConsumeQuota('user-1');
      expect(result.allowed).toBe(true);
    }
    const eleventh = await checkAndConsumeQuota('user-1');
    expect(eleventh.allowed).toBe(false);
  });

  it('tracks quota independently per user', async () => {
    for (let i = 0; i < 10; i++) {
      await checkAndConsumeQuota('user-a');
    }
    const blockedA = await checkAndConsumeQuota('user-a');
    expect(blockedA.allowed).toBe(false);

    const allowedB = await checkAndConsumeQuota('user-b');
    expect(allowedB.allowed).toBe(true);
  });
});
