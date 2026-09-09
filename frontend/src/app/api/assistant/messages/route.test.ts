import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'u1', email: 'a@b.com' } })),
}));

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

vi.mock('@/lib/server/assistant/quota', () => ({
  checkAndConsumeQuota: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/lib/server/assistant/client', () => ({
  sendAssistantMessage: vi.fn(async () => 'Voici une réponse de test.'),
  AssistantNotConfiguredError: class AssistantNotConfiguredError extends Error {
    constructor() {
      super('Assistant not configured');
      this.name = 'AssistantNotConfiguredError';
    }
  },
}));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { checkAndConsumeQuota } from '@/lib/server/assistant/quota';
import { sendAssistantMessage, AssistantNotConfiguredError } from '@/lib/server/assistant/client';
import { SAFE_FALLBACK_MESSAGE } from '@/lib/server/assistant/output-filter';
import { POST } from './route';

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://test/api/assistant/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAuth).mockResolvedValue({ user: { sub: 'u1', email: 'a@b.com' } });
  vi.mocked(verifyCsrf).mockReturnValue(null);
  vi.mocked(checkAndConsumeQuota).mockResolvedValue({ allowed: true });
  vi.mocked(sendAssistantMessage).mockResolvedValue('Voici une réponse de test.');
  prismaMock.prediction.findUnique.mockResolvedValue(null);
  prismaMock.cycle.findMany.mockResolvedValue([]);
  prismaMock.dailyLog.findMany.mockResolvedValue([]);
  prismaMock.periodEvent.findMany.mockResolvedValue([]);
  prismaMock.consent.findFirst.mockResolvedValue(null);
});

describe('POST /api/assistant/messages', () => {
  it('returns 403 when CSRF verification fails', async () => {
    vi.mocked(verifyCsrf).mockReturnValueOnce(
      NextResponse.json({ error: 'CSRF_INVALID' }, { status: 403 }),
    );
    const res = await POST(makeReq({ message: 'Salut' }));
    expect(res.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce(
      NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never,
    );
    const res = await POST(makeReq({ message: 'Salut' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 VALIDATION_FAILED for an invalid body', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });

  it('returns 429 ASSISTANT_QUOTA_EXCEEDED when the daily quota is exhausted', async () => {
    vi.mocked(checkAndConsumeQuota).mockResolvedValueOnce({ allowed: false });
    const res = await POST(makeReq({ message: 'Salut' }));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('ASSISTANT_QUOTA_EXCEEDED');
  });

  it('returns 503 AI_NOT_CONFIGURED when the Anthropic client is not configured', async () => {
    vi.mocked(sendAssistantMessage).mockRejectedValueOnce(new AssistantNotConfiguredError());
    const res = await POST(makeReq({ message: 'Salut', history: [] }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('AI_NOT_CONFIGURED');
  });

  it('returns 502 ASSISTANT_UPSTREAM_ERROR when the Anthropic API call fails for another reason', async () => {
    vi.mocked(sendAssistantMessage).mockRejectedValueOnce(new Error('network blip'));
    const res = await POST(makeReq({ message: 'Salut', history: [] }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('ASSISTANT_UPSTREAM_ERROR');
  });

  it('returns 404 CONVERSATION_NOT_FOUND when conversationId does not exist or belongs to another user', async () => {
    prismaMock.consent.findFirst.mockResolvedValue({
      id: 'c1',
      userId: 'u1',
      type: 'ASSISTANT_HISTORY',
      version: 1,
      grantedAt: new Date(),
      revokedAt: null,
    } as never);
    prismaMock.assistantConversation.findUnique.mockResolvedValue(null);
    const res = await POST(makeReq({ conversationId: 'conv-x', message: 'Bonjour' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('CONVERSATION_NOT_FOUND');
  });

  it('does not persist and forwards client-supplied history when ASSISTANT_HISTORY consent is not granted', async () => {
    const res = await POST(
      makeReq({
        message: 'Bonjour',
        history: [
          { role: 'USER', content: 'Salut' },
          { role: 'ASSISTANT', content: 'Bonjour, comment puis-je aider ?' },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(prismaMock.assistantConversation.create).not.toHaveBeenCalled();
    expect(prismaMock.assistantMessage.create).not.toHaveBeenCalled();
    expect(vi.mocked(sendAssistantMessage)).toHaveBeenCalledWith(
      expect.objectContaining({
        history: [
          { role: 'user', content: 'Salut' },
          { role: 'assistant', content: 'Bonjour, comment puis-je aider ?' },
        ],
      }),
    );
  });

  it('persists a new conversation + both messages with intentCategory when consent is granted', async () => {
    prismaMock.consent.findFirst.mockResolvedValue({
      id: 'c1',
      userId: 'u1',
      type: 'ASSISTANT_HISTORY',
      version: 1,
      grantedAt: new Date(),
      revokedAt: null,
    } as never);
    prismaMock.assistantConversation.create.mockResolvedValue({
      id: 'conv-1',
      userId: 'u1',
      title: 'Bonjour',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    prismaMock.assistantMessage.create
      .mockResolvedValueOnce({ id: 'msg-user-1' } as never)
      .mockResolvedValueOnce({ id: 'msg-assistant-1' } as never);

    const res = await POST(makeReq({ message: 'Bonjour' }));
    expect(res.status).toBe(200);

    expect(prismaMock.assistantConversation.create).toHaveBeenCalledWith({
      data: { userId: 'u1', title: 'Bonjour' },
    });
    expect(prismaMock.assistantMessage.create).toHaveBeenNthCalledWith(1, {
      data: { conversationId: 'conv-1', role: 'USER', content: 'Bonjour', intentCategory: 'OTHER' },
    });
    expect(prismaMock.assistantMessage.create).toHaveBeenNthCalledWith(2, {
      data: { conversationId: 'conv-1', role: 'ASSISTANT', content: 'Voici une réponse de test.' },
    });

    const body = await res.text();
    expect(body).toContain('"conversationId":"conv-1"');
    expect(body).toContain('"messageId":"msg-assistant-1"');
  });

  it('streams the response as SSE chunks followed by a done event', async () => {
    const res = await POST(makeReq({ message: 'Salut', history: [] }));
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    const body = await res.text();
    expect(body).toContain('data: {"type":"chunk"');
    expect(body).toContain('event: done');
  });

  it('replaces a red-line response with the safe fallback on the wire when unfiltered text would be flagged', async () => {
    vi.mocked(sendAssistantMessage).mockResolvedValueOnce('Tu es enceinte, félicitations !');
    const res = await POST(makeReq({ message: 'Salut', history: [] }));
    const body = await res.text();
    expect(body).toContain(JSON.stringify(SAFE_FALLBACK_MESSAGE).slice(0, 30));
    expect(body).not.toContain('félicitations');
  });

  it('persists the safe fallback, not the raw red-line text, when consent is granted', async () => {
    vi.mocked(sendAssistantMessage).mockResolvedValueOnce('Tu es enceinte, félicitations !');
    prismaMock.consent.findFirst.mockResolvedValue({
      id: 'c1',
      userId: 'u1',
      type: 'ASSISTANT_HISTORY',
      version: 1,
      grantedAt: new Date(),
      revokedAt: null,
    } as never);
    prismaMock.assistantConversation.create.mockResolvedValue({
      id: 'conv-1',
      userId: 'u1',
      title: 'Bonjour',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    prismaMock.assistantMessage.create
      .mockResolvedValueOnce({ id: 'msg-user-1' } as never)
      .mockResolvedValueOnce({ id: 'msg-assistant-1' } as never);

    await POST(makeReq({ message: 'Bonjour' }));

    expect(prismaMock.assistantMessage.create).toHaveBeenNthCalledWith(2, {
      data: { conversationId: 'conv-1', role: 'ASSISTANT', content: SAFE_FALLBACK_MESSAGE },
    });
  });
});
