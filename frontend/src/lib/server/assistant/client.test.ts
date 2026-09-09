import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sendAssistantMessage,
  AssistantNotConfiguredError,
  __resetAssistantClientSingleton,
} from './client';

describe('sendAssistantMessage', () => {
  beforeEach(() => {
    __resetAssistantClientSingleton();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetAssistantClientSingleton();
  });

  it('throws AssistantNotConfiguredError when ANTHROPIC_API_KEY is missing', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    await expect(
      sendAssistantMessage({ systemPrompt: 'system', history: [], userMessage: 'hello' }),
    ).rejects.toThrow(AssistantNotConfiguredError);
  });
});
