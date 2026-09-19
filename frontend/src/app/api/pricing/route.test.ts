// PUBLIC-PRICING — GET /api/pricing. No auth, excludes admin-only fields.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

function makeGet(): NextRequest {
  return new NextRequest('http://test/api/pricing', { method: 'GET' });
}

beforeEach(() => {
  // prismaMock auto-resets via test-utils/prisma-mock's beforeEach
});

describe('GET /api/pricing', () => {
  it('returns 200 with plans, no auth required', async () => {
    prismaMock.pricingPlan.findMany.mockResolvedValueOnce([
      {
        id: 'p1',
        key: 'PLUS',
        priceFcfa: 1000,
        updatedAt: new Date(),
        updatedBy: null,
      },
      {
        id: 'p2',
        key: 'BABY',
        priceFcfa: 2500,
        updatedAt: new Date(),
        updatedBy: 'admin_1',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plans: Array<Record<string, unknown>> };
    expect(body.plans).toEqual([
      { key: 'PLUS', priceFcfa: 1000 },
      { key: 'BABY', priceFcfa: 2500 },
    ]);
  });

  it('excludes updatedAt and updatedBy from the public response', async () => {
    prismaMock.pricingPlan.findMany.mockResolvedValueOnce([
      { id: 'p1', key: 'PLUS', priceFcfa: 1000, updatedAt: new Date(), updatedBy: 'admin_1' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);
    const res = await GET(makeGet());
    const body = (await res.json()) as { plans: Array<Record<string, unknown>> };
    expect(body.plans[0]).not.toHaveProperty('updatedAt');
    expect(body.plans[0]).not.toHaveProperty('updatedBy');
  });
});
