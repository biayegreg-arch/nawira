import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { trackEvent } from './track';

beforeEach(() => {
  prismaMock.consent.findFirst.mockResolvedValue(null);
  prismaMock.analyticsEvent.create.mockResolvedValue({} as never);
});

describe('trackEvent', () => {
  it('records a consent-exempt event with no consent row present', async () => {
    await trackEvent(prismaMock, 'u1', 'onboarding_started', { source: 'organic' });

    expect(prismaMock.consent.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.analyticsEvent.create).toHaveBeenCalledWith({
      data: { userId: 'u1', type: 'onboarding_started', properties: { source: 'organic' } },
    });
  });

  it('drops a consent-exempt event for an account already marked DELETED', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u1' } as never);

    await trackEvent(prismaMock, 'u1', 'onboarding_started', { source: 'organic' });

    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'u1', status: 'DELETED' },
      select: { id: true },
    });
    expect(prismaMock.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it('drops a consent-gated event when no ANALYTICS consent exists', async () => {
    prismaMock.consent.findFirst.mockResolvedValue(null);

    await trackEvent(prismaMock, 'u1', 'daily_log_saved', { fields_count: 3 });

    expect(prismaMock.consent.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', type: 'ANALYTICS', revokedAt: null },
      select: { id: true },
    });
    expect(prismaMock.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it('records a consent-gated event when ANALYTICS consent is granted', async () => {
    prismaMock.consent.findFirst.mockResolvedValue({ id: 'c1' } as never);

    await trackEvent(prismaMock, 'u1', 'daily_log_saved', { fields_count: 3 });

    expect(prismaMock.analyticsEvent.create).toHaveBeenCalledWith({
      data: { userId: 'u1', type: 'daily_log_saved', properties: { fields_count: 3 } },
    });
  });

  it('drops an unknown event type without throwing', async () => {
    await trackEvent(prismaMock, 'u1', 'not_a_real_event' as never, {});

    expect(prismaMock.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it('drops a payload with an extra, non-allowlisted property', async () => {
    prismaMock.consent.findFirst.mockResolvedValue({ id: 'c1' } as never);

    await trackEvent(prismaMock, 'u1', 'daily_log_saved', {
      fields_count: 3,
      note: 'free text should never land here',
    });

    expect(prismaMock.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it('drops a payload with the wrong property type', async () => {
    prismaMock.consent.findFirst.mockResolvedValue({ id: 'c1' } as never);

    await trackEvent(prismaMock, 'u1', 'period_logged', { offline_flag: 'yes' });

    expect(prismaMock.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it('never throws when the database write itself fails', async () => {
    prismaMock.consent.findFirst.mockResolvedValue({ id: 'c1' } as never);
    prismaMock.analyticsEvent.create.mockRejectedValue(new Error('db down'));

    await expect(
      trackEvent(prismaMock, 'u1', 'daily_log_saved', { fields_count: 1 }),
    ).resolves.toBeUndefined();
  });

  it('never throws when the consent lookup itself fails', async () => {
    prismaMock.consent.findFirst.mockRejectedValue(new Error('db down'));

    await expect(
      trackEvent(prismaMock, 'u1', 'daily_log_saved', { fields_count: 1 }),
    ).resolves.toBeUndefined();
    expect(prismaMock.analyticsEvent.create).not.toHaveBeenCalled();
  });
});
