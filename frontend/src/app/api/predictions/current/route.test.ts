import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'u1', email: 'a@b.com' } })),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/predictions/current', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } });
});

describe('GET /api/predictions/current', () => {
  it('returns the serialized Prediction when one exists', async () => {
    prismaMock.prediction.findUnique.mockResolvedValue({
      userId: 'u1',
      algorithmVersion: 'v1',
      confidence: 'MEDIUM',
      expectedPeriodStart: new Date('2026-03-01'),
      expectedPeriodEnd: new Date('2026-03-05'),
      ovulationEstimate: new Date('2026-02-15'),
      fertileWindowStart: new Date('2026-02-10'),
      fertileWindowEnd: new Date('2026-02-16'),
      computedAt: new Date('2026-02-01T10:00:00.000Z'),
    } as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      prediction: {
        confidence: 'MEDIUM',
        expectedPeriodStart: '2026-03-01',
        expectedPeriodEnd: '2026-03-05',
        algorithmVersion: 'v1',
        computedAt: '2026-02-01T10:00:00.000Z',
        ovulationEstimate: '2026-02-15',
        fertileWindowStart: '2026-02-10',
        fertileWindowEnd: '2026-02-16',
      },
    });

    expect(prismaMock.prediction.findUnique).toHaveBeenCalledWith({ where: { userId: 'u1' } });
  });

  it('returns { prediction: null } as a normal 200 response when none exists', async () => {
    prismaMock.prediction.findUnique.mockResolvedValue(null);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ prediction: null });
  });

  it('maps null fertility fields to null in the response', async () => {
    prismaMock.prediction.findUnique.mockResolvedValue({
      userId: 'u1',
      algorithmVersion: 'v1',
      confidence: 'LOW',
      expectedPeriodStart: new Date('2026-03-01'),
      expectedPeriodEnd: new Date('2026-03-05'),
      ovulationEstimate: null,
      fertileWindowStart: null,
      fertileWindowEnd: null,
      computedAt: new Date('2026-02-01T10:00:00.000Z'),
    } as never);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.prediction.ovulationEstimate).toBeNull();
    expect(body.prediction.fertileWindowStart).toBeNull();
    expect(body.prediction.fertileWindowEnd).toBeNull();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });
});
