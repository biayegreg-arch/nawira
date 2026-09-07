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

const FULL_BODY = {
  painLevel: 4,
  painLocation: 'Bas du dos',
  mood: 'TIRED',
  energy: 'LOW',
  sleepQuality: 'FAIR',
  sleepHours: 6.5,
  note: "Un peu fatiguée aujourd'hui.",
  symptoms: ['CRAMPS', 'FATIGUE'],
};

function makeGetReq(): NextRequest {
  return new NextRequest('http://test/api/daily-logs/today', { method: 'GET' });
}

function makePutReq(body?: unknown): NextRequest {
  return new NextRequest('http://test/api/daily-logs/today', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function makeRawPutReq(raw: string): NextRequest {
  return new NextRequest('http://test/api/daily-logs/today', {
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
});

describe('GET /api/daily-logs/today', () => {
  it('returns log: null when nothing is logged today', async () => {
    prismaMock.dailyLog.findUnique.mockResolvedValue(null);

    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ log: null });
  });

  it('returns the mapped fields and symptoms when an entry exists', async () => {
    prismaMock.dailyLog.findUnique.mockResolvedValue({
      id: 'dl1',
      userId: 'u1',
      date: new Date('2026-09-07'),
      painLevel: 4,
      painLocation: 'Bas du dos',
      mood: 'TIRED',
      energy: 'LOW',
      sleepQuality: 'FAIR',
      sleepHours: 6.5,
      note: "Un peu fatiguée aujourd'hui.",
      symptoms: [
        { id: 's1', dailyLogId: 'dl1', symptom: 'CRAMPS' },
        { id: 's2', dailyLogId: 'dl1', symptom: 'FATIGUE' },
      ],
    } as never);

    const res = await GET(makeGetReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.log).toEqual({
      painLevel: 4,
      painLocation: 'Bas du dos',
      mood: 'TIRED',
      energy: 'LOW',
      sleepQuality: 'FAIR',
      sleepHours: 6.5,
      note: "Un peu fatiguée aujourd'hui.",
      symptoms: ['CRAMPS', 'FATIGUE'],
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

describe('PUT /api/daily-logs/today', () => {
  it('upserts the DailyLog and replaces symptoms from a full body', async () => {
    prismaMock.dailyLog.upsert.mockResolvedValue({ id: 'dl1' } as never);

    const res = await PUT(makePutReq(FULL_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    const upsertArg = prismaMock.dailyLog.upsert.mock.calls[0]?.[0];
    expect(upsertArg?.create?.userId).toBe('u1');
    expect(upsertArg?.create?.painLevel).toBe(4);
    expect(upsertArg?.update?.mood).toBe('TIRED');

    expect(prismaMock.symptomLog.deleteMany).toHaveBeenCalledWith({
      where: { dailyLogId: 'dl1' },
    });
    expect(prismaMock.symptomLog.createMany).toHaveBeenCalledWith({
      data: [
        { dailyLogId: 'dl1', symptom: 'CRAMPS' },
        { dailyLogId: 'dl1', symptom: 'FATIGUE' },
      ],
    });
  });

  it('deduplicates repeated symptom values instead of crashing', async () => {
    prismaMock.dailyLog.upsert.mockResolvedValue({ id: 'dl1' } as never);

    const res = await PUT(makePutReq({ ...FULL_BODY, symptoms: ['CRAMPS', 'CRAMPS', 'FATIGUE'] }));
    expect(res.status).toBe(200);
    expect(prismaMock.symptomLog.createMany).toHaveBeenCalledWith({
      data: [
        { dailyLogId: 'dl1', symptom: 'CRAMPS' },
        { dailyLogId: 'dl1', symptom: 'FATIGUE' },
      ],
    });
  });

  it('accepts an all-null body (clearing every field)', async () => {
    prismaMock.dailyLog.upsert.mockResolvedValue({ id: 'dl1' } as never);

    const res = await PUT(
      makePutReq({
        painLevel: null,
        painLocation: null,
        mood: null,
        energy: null,
        sleepQuality: null,
        sleepHours: null,
        note: null,
        symptoms: [],
      }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.symptomLog.createMany).toHaveBeenCalledWith({ data: [] });
  });

  it('rejects an invalid mood value with VALIDATION_FAILED', async () => {
    const res = await PUT(makePutReq({ ...FULL_BODY, mood: 'FURIOUS' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.dailyLog.upsert).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range painLevel with VALIDATION_FAILED', async () => {
    const res = await PUT(makePutReq({ ...FULL_BODY, painLevel: 11 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('rejects an invalid symptom value with VALIDATION_FAILED', async () => {
    const res = await PUT(makePutReq({ ...FULL_BODY, symptoms: ['NOT_A_SYMPTOM'] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('rejects a malformed JSON body with VALIDATION_FAILED', async () => {
    const res = await PUT(makeRawPutReq('not json'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
    expect(prismaMock.dailyLog.upsert).not.toHaveBeenCalled();
  });

  it('returns 404 PROFILE_NOT_FOUND when the user never completed onboarding', async () => {
    prismaMock.profile.findUnique.mockResolvedValue(null);

    const res = await PUT(makePutReq(FULL_BODY));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('PROFILE_NOT_FOUND');
    expect(prismaMock.dailyLog.upsert).not.toHaveBeenCalled();
  });

  it('returns 403 when the CSRF check fails', async () => {
    vi.mocked(verifyCsrf).mockReturnValue(
      NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }) as never,
    );
    const res = await PUT(makePutReq(FULL_BODY));
    expect(res.status).toBe(403);
  });
});
