import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Thrown by `sendAssistantMessage()` when `ANTHROPIC_API_KEY` is
 * missing/empty. The route catches this `instanceof` and returns 503
 * `{ error: 'AI_NOT_CONFIGURED' }` (spec §6, §8) — mirrors
 * `upload/cloudinary-client.ts`'s `StorageNotConfiguredError` pattern
 * exactly. Deliberately NOT added to env.ts's Zod schema — an empty value
 * must not block boot (same reasoning as Cloudinary's keys).
 */
export class AssistantNotConfiguredError extends Error {
  constructor() {
    super('Assistant not configured (ANTHROPIC_API_KEY missing or empty)');
    this.name = 'AssistantNotConfiguredError';
  }
}

const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 2048;

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  if (!apiKey) throw new AssistantNotConfiguredError();
  _client = new Anthropic({ apiKey });
  return _client;
}

export interface AssistantHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SendAssistantMessageInput {
  systemPrompt: string;
  history: AssistantHistoryMessage[];
  userMessage: string;
}

/**
 * Calls the Claude Messages API and returns the complete response text.
 * Uses the SDK's streaming transport (`.stream()` + `.finalMessage()`) —
 * avoids long-request timeout classification — but waits for the complete
 * message rather than exposing individual deltas: the caller (route.ts,
 * Task 8) needs the full text before it can run the output filter (spec
 * §3.2, §8). The system prompt is cached (`cache_control: 'ephemeral'`)
 * since `buildSystemPrompt()` never varies between requests (spec §3.1).
 */
export async function sendAssistantMessage(input: SendAssistantMessageInput): Promise<string> {
  const client = getClient();

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: input.systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [
      ...input.history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: input.userMessage },
    ],
  });

  const finalMessage = await stream.finalMessage();
  const textParts: string[] = [];
  for (const block of finalMessage.content) {
    if (block.type === 'text') textParts.push(block.text);
  }
  return textParts.join('');
}

/**
 * Test-only escape hatch — clears the cached client so a test can mutate
 * `process.env.ANTHROPIC_API_KEY` and re-trigger lazy init. Never call this
 * from application code.
 *
 * @internal
 */
export function __resetAssistantClientSingleton(): void {
  _client = null;
}
