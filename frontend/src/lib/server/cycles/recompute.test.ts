import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { recomputeCyclesAndPrediction } from './recompute';

function d(iso: string): Date {
  return new Date(iso);
}

beforeEach(() => {
  prismaMock.cycle.upsert.mockResolvedValue({} as never);
  prismaMock.prediction.upsert.mockResolvedValue({} as never);
  prismaMock.prediction.deleteMany.mockResolvedValue({ count: 0 } as never);
});

describe('recomputeCyclesAndPrediction', () => {
  it('does nothing but delete any stale Prediction when there are no PeriodEvents', async () => {
    prismaMock.periodEvent.findMany.mockResolvedValue([]);
    prismaMock.profile.findUnique.mockResolvedValue(null);

    await recomputeCyclesAndPrediction(prismaMock, 'u1');

    expect(prismaMock.periodEvent.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
    expect(prismaMock.cycle.upsert).not.toHaveBeenCalled();
    expect(prismaMock.prediction.upsert).not.toHaveBeenCalled();
    expect(prismaMock.prediction.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('upserts a single open Cycle and skips Prediction when no length is known', async () => {
    prismaMock.periodEvent.findMany.mockResolvedValue([{ date: d('2026-01-01') }] as never);
    prismaMock.profile.findUnique.mockResolvedValue({
      usualCycleLength: null,
      usualPeriodLength: null,
    } as never);

    await recomputeCyclesAndPrediction(prismaMock, 'u1');

    expect(prismaMock.cycle.upsert).toHaveBeenCalledTimes(1);
    const arg = prismaMock.cycle.upsert.mock.calls[0]?.[0];
    expect(arg?.where).toEqual({ userId_startDate: { userId: 'u1', startDate: d('2026-01-01') } });
    expect(arg?.create).toMatchObject({
      userId: 'u1',
      startDate: d('2026-01-01'),
      endDate: null,
      length: null,
      isOutlier: false,
    });
    expect(prismaMock.prediction.upsert).not.toHaveBeenCalled();
    expect(prismaMock.prediction.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('upserts a Prediction using the declared usualCycleLength when 0 cycles are complete', async () => {
    prismaMock.periodEvent.findMany.mockResolvedValue([{ date: d('2026-01-01') }] as never);
    prismaMock.profile.findUnique.mockResolvedValue({
      usualCycleLength: 30,
      usualPeriodLength: 5,
    } as never);

    await recomputeCyclesAndPrediction(prismaMock, 'u1');

    expect(prismaMock.prediction.upsert).toHaveBeenCalledTimes(1);
    const arg = prismaMock.prediction.upsert.mock.calls[0]?.[0];
    expect(arg?.where).toEqual({ userId: 'u1' });
    expect(arg?.create).toMatchObject({ userId: 'u1', confidence: 'LOW', algorithmVersion: 'v1' });
    expect(prismaMock.prediction.deleteMany).not.toHaveBeenCalled();
  });

  it('upserts one Cycle per episode pair for multiple PeriodEvents', async () => {
    prismaMock.periodEvent.findMany.mockResolvedValue([
      { date: d('2026-01-01') },
      { date: d('2026-01-29') },
    ] as never);
    prismaMock.profile.findUnique.mockResolvedValue({
      usualCycleLength: null,
      usualPeriodLength: null,
    } as never);

    await recomputeCyclesAndPrediction(prismaMock, 'u1');

    expect(prismaMock.cycle.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.prediction.upsert).toHaveBeenCalledTimes(1);
  });
});
