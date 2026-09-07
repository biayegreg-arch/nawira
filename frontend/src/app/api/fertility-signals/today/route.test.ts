import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'u1', email: 'a@b.com' } })),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { GET, PUT } from './route';

const ALL_NULL_BODY = {
  temperatureValue: null,
  temperatureUnit: null,
  cervicalMucusType: null,
  lhResult: null,
};

function makeGetReq(): NextRequest {
  return new NextRequest('http://test/api/fertility-signals/today', { method: 'GET' });
}

function makePutReq(body?: unknown): NextRequest {
  return new NextRequest('http://test/api/fertility-signals/today', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function makeRawPutReq(raw: string): NextRequest {
  return new NextRequest('http://test/api/fertility-signals/today', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: raw,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } });
  vi.mocked(verifyCsrf).mockReturnValue(null);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
  prismaMock.profile.findUnique.mockResolvedValue({ userId: 'u1' } as never);
  prismaMock.fertilitySignal.upsert.mockResolvedValue({} as never);
  prismaMock.fertilitySignal.deleteMany.mockResolvedValue({ count: 0 } as never);
});

describe('GET /api/fertility-signals/today', () => {
  it('returns signal: null when nothing is logged today', async () => {
    prismaMock.fertilitySignal.findMany.mockResolvedValue([]);

    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ signal: null });
  });

  it('folds a single type row into the flat response shape', async () => {
    prismaMock.fertilitySignal.findMany.mockResolvedValue([
      {
        id: 'fs1',
        userId: 'u1',
        date: new Date('2026-09-07'),
        type: 'CERVICAL_MUCUS',
        temperatureValue: null,
        temperatureUnit: null,
        cervicalMucusType: 'EGG_WHITE',
        lhResult: null,
      },
    ] as never);

    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      signal: {
        temperatureValue: null,
        temperatureUnit: null,
        cervicalMucusType: 'EGG_WHITE',
        lhResult: null,
      },
    });
  });

  it('folds all 3 type rows into the flat response shape', async () => {
    prismaMock.fertilitySignal.findMany.mockResolvedValue([
      {
        id: 'fs1',
        userId: 'u1',
        date: new Date('2026-09-07'),
        type: 'BASAL_TEMPERATURE',
        temperatureValue: 36.6,
        temperatureUnit: 'CELSIUS',
        cervicalMucusType: null,
        lhResult: null,
      },
      {
        id: 'fs2',
        userId: 'u1',
        date: new Date('2026-09-07'),
        type: 'CERVICAL_MUCUS',
        temperatureValue: null,
        temperatureUnit: null,
        cervicalMucusType: 'WATERY',
        lhResult: null,
      },
      {
        id: 'fs3',
        userId: 'u1',
        date: new Date('2026-09-07'),
        type: 'LH_TEST',
        temperatureValue: null,
        temperatureUnit: null,
        cervicalMucusType: null,
        lhResult: 'PEAK',
      },
    ] as never);

    const res = await GET(makeGetReq());
    const body = await res.json();
    expect(body).toEqual({
      signal: {
        temperatureValue: 36.6,
        temperatureUnit: 'CELSIUS',
        cervicalMucusType: 'WATERY',
        lhResult: 'PEAK',
      },
    });
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockResolvedValue(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    const res = await GET(makeGetReq());
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/fertility-signals/today', () => {
  it('upserts only the BASAL_TEMPERATURE row when only temperature is set', async () => {
    const res = await PUT(
      makePutReq({ ...ALL_NULL_BODY, temperatureValue: 36.7, temperatureUnit: 'CELSIUS' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(prismaMock.fertilitySignal.upsert).toHaveBeenCalledTimes(1);
    const arg = prismaMock.fertilitySignal.upsert.mock.calls[0]?.[0];
    expect(arg?.where).toMatchObject({
      userId_date_type: { userId: 'u1', type: 'BASAL_TEMPERATURE' },
    });
    expect(arg?.create).toMatchObject({
      userId: 'u1',
      type: 'BASAL_TEMPERATURE',
      temperatureValue: 36.7,
      temperatureUnit: 'CELSIUS',
    });
    expect(prismaMock.fertilitySignal.deleteMany).toHaveBeenCalledTimes(2);
    expect(prismaMock.fertilitySignal.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: 'CERVICAL_MUCUS' }) }),
    );
    expect(prismaMock.fertilitySignal.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: 'LH_TEST' }) }),
    );
  });

  it('upserts all 3 type rows independently in one call', async () => {
    const res = await PUT(
      makePutReq({
        temperatureValue: 36.5,
        temperatureUnit: 'CELSIUS',
        cervicalMucusType: 'CREAMY',
        lhResult: 'NEGATIVE',
      }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.fertilitySignal.upsert).toHaveBeenCalledTimes(3);
    expect(prismaMock.fertilitySignal.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes a type row when its value is cleared to null', async () => {
    const res = await PUT(makePutReq(ALL_NULL_BODY));
    expect(res.status).toBe(200);
    expect(prismaMock.fertilitySignal.upsert).not.toHaveBeenCalled();
    expect(prismaMock.fertilitySignal.deleteMany).toHaveBeenCalledTimes(3);
  });

  it('rejects an invalid cervicalMucusType with VALIDATION_FAILED', async () => {
    const res = await PUT(makePutReq({ ...ALL_NULL_BODY, cervicalMucusType: 'SOGGY' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.fertilitySignal.upsert).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range temperatureValue with VALIDATION_FAILED', async () => {
    const res = await PUT(
      makePutReq({ ...ALL_NULL_BODY, temperatureValue: 50, temperatureUnit: 'CELSIUS' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('rejects temperatureValue without temperatureUnit with VALIDATION_FAILED', async () => {
    const res = await PUT(makePutReq({ ...ALL_NULL_BODY, temperatureValue: 36.6 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('rejects a malformed JSON body with VALIDATION_FAILED', async () => {
    const res = await PUT(makeRawPutReq('not json'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.fertilitySignal.upsert).not.toHaveBeenCalled();
  });

  it('returns 404 PROFILE_NOT_FOUND when the user never completed onboarding', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);

    const res = await PUT(makePutReq(ALL_NULL_BODY));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('PROFILE_NOT_FOUND');
    expect(prismaMock.fertilitySignal.upsert).not.toHaveBeenCalled();
  });

  it('returns 403 when the CSRF check fails', async () => {
    vi.mocked(verifyCsrf).mockReturnValue(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }) as never,
    );
    const res = await PUT(makePutReq(ALL_NULL_BODY));
    expect(res.status).toBe(403);
  });
});
