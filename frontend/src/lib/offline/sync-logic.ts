import { ApiError } from '@/lib/api';

export const MAX_SYNC_ATTEMPTS = 5;

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;

/** 1s, 2s, 4s, 8s, 16s, capped at 30s. */
export function backoffDelayMs(attempts: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempts);
}

/**
 * `lib/api.ts` always throws ApiError, including on network failure — with
 * `status === 0` (see api.ts's catch block). A real HTTP error (validation,
 * server error) always carries a non-zero status. This is the entire
 * "should this be queued for retry, or shown to the user right now?" test.
 */
export function isNetworkError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0;
}
