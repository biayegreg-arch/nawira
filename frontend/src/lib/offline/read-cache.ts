// Thin glue between the pure network-error check in sync-logic.ts and the
// raw IndexedDB read cache in db.ts. Untested — same rationale as
// queue.ts (see the E4 part-3 design spec's §"Out of scope").
import { api } from '@/lib/api';
import { getCachedRead, putCachedRead } from './db';
import { isNetworkError } from './sync-logic';

export interface CachedResult<T> {
  data: T;
  stale: boolean;
  cachedAt: string | null;
}

/**
 * Tries the endpoint live first and refreshes the cache on success. On a
 * network failure, falls back to the last cached response for this
 * endpoint (`stale: true`) instead of throwing — PRD §28.5's "consultation
 * du calendrier déjà synchronisé." A real HTTP error (4xx/5xx) or a
 * network failure with nothing cached yet still throws, unchanged from
 * today's behavior.
 */
export async function fetchCached<T>(endpoint: string): Promise<CachedResult<T>> {
  try {
    const data = await api<T>(endpoint);
    await putCachedRead(endpoint, data);
    return { data, stale: false, cachedAt: new Date().toISOString() };
  } catch (err) {
    if (isNetworkError(err)) {
      const cached = await getCachedRead(endpoint);
      if (cached) {
        return { data: cached.data as T, stale: true, cachedAt: cached.cachedAt };
      }
    }
    throw err;
  }
}
