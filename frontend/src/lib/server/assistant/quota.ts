import 'server-only';
import { redis } from '../redis';
import {
  MemoryRateLimitStore,
  RedisRateLimitStore,
  type RateLimitStore,
} from '../rate-limit-store';
import { log } from '../observability/log';

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24h fixed window (spec §5) -- resets 24h after the
// first message in the window, not a true rolling window (RedisRateLimitStore sets the TTL
// only on the first increment; see rate-limit-store.ts)

function getDailyLimit(): number {
  const raw = Number(process.env.ASSISTANT_DAILY_MESSAGE_LIMIT ?? '10');
  if (!Number.isFinite(raw) || raw <= 0) {
    log.warn('ASSISTANT_DAILY_MESSAGE_LIMIT is not a valid positive number, falling back to 10', {
      value: process.env.ASSISTANT_DAILY_MESSAGE_LIMIT,
    });
    return 10;
  }
  return raw;
}

let _store: RateLimitStore | null = null;

function getStore(): RateLimitStore {
  if (_store) return _store;
  if (redis) {
    _store = new RedisRateLimitStore({ redis, prefix: 'assistant-quota:', windowMs: WINDOW_MS });
  } else {
    log.warn('assistant quota using in-memory fallback (Redis absent)');
    _store = new MemoryRateLimitStore({ windowMs: WINDOW_MS });
  }
  return _store;
}

/**
 * Per-user daily message quota — the cost control for a live LLM available
 * to every plan tier during this launch phase (spec §1, §5). Always
 * increments (even once over limit) so the store's own window/reset
 * semantics stay simple; callers only care about `allowed`.
 */
export async function checkAndConsumeQuota(userId: string): Promise<{ allowed: boolean }> {
  const { totalHits } = await getStore().increment(userId);
  return { allowed: totalHits <= getDailyLimit() };
}

/**
 * Test-only escape hatch — clears the cached store so each test starts
 * with a fresh quota. Never call this from application code.
 *
 * @internal
 */
export function __resetAssistantQuotaStore(): void {
  _store = null;
}
