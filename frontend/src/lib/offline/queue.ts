// Thin glue between the pure decision logic in sync-logic.ts and the raw
// IndexedDB wrapper in db.ts. Untested (see the design spec's §5 rationale)
// — verified in the E4-part-2 plan's manual browser pass.
import { api } from '@/lib/api';
import { deleteMutation, findByResourceKey, getAllMutations, putMutation } from './db';
import { isNetworkError, MAX_SYNC_ATTEMPTS } from './sync-logic';
import type { QueuedMutation } from './types';

/** Fired after a period-event or fertility-signal mutation syncs — pages
 * with stale predictions/cycles listen for this to refetch. */
export const CYCLE_DATA_CHANGED_EVENT = 'nawira:cycle-data-changed';

/** Subscribes `onChange` to CYCLE_DATA_CHANGED_EVENT; returns the cleanup. */
export function onCycleDataChanged(onChange: () => void): () => void {
  const handler = (): void => onChange();
  window.addEventListener(CYCLE_DATA_CHANGED_EVENT, handler);
  return () => window.removeEventListener(CYCLE_DATA_CHANGED_EVENT, handler);
}

function affectsCycleData(endpoint: string): boolean {
  return endpoint.startsWith('/api/period-events') || endpoint.startsWith('/api/fertility-signals');
}

export interface EnqueueInput {
  resourceKey: string;
  endpoint: string;
  method: 'POST' | 'PUT';
  payload: unknown;
}

export async function enqueue(input: EnqueueInput): Promise<void> {
  const existing = await findByResourceKey(input.resourceKey);
  const mutation: QueuedMutation = {
    id: existing?.id ?? crypto.randomUUID(),
    resourceKey: input.resourceKey,
    endpoint: input.endpoint,
    method: input.method,
    payload: input.payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  await putMutation(mutation);
}

export interface DrainResult {
  synced: number;
  failed: number;
  remaining: number;
}

/**
 * Replays queued mutations oldest-first. Stops at the first network
 * failure (still offline — no point burning through the rest of the
 * queue this pass); a real HTTP error past MAX_SYNC_ATTEMPTS drops that
 * one mutation and keeps going.
 */
export async function drain(): Promise<DrainResult> {
  const mutations = await getAllMutations();
  mutations.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  let synced = 0;
  let failed = 0;

  for (const mutation of mutations) {
    try {
      await api(mutation.endpoint, { method: mutation.method, body: mutation.payload });
      await deleteMutation(mutation.id);
      synced += 1;
      if (affectsCycleData(mutation.endpoint) && typeof window !== 'undefined') {
        window.dispatchEvent(new Event(CYCLE_DATA_CHANGED_EVENT));
      }
    } catch (err) {
      if (isNetworkError(err)) {
        await putMutation({ ...mutation, attempts: mutation.attempts + 1 });
        break;
      }
      if (mutation.attempts + 1 >= MAX_SYNC_ATTEMPTS) {
        await deleteMutation(mutation.id);
        failed += 1;
      } else {
        await putMutation({ ...mutation, attempts: mutation.attempts + 1 });
      }
    }
  }

  const remaining = await getAllMutations();
  return { synced, failed, remaining: remaining.length };
}

export async function pendingCount(): Promise<number> {
  return (await getAllMutations()).length;
}

/**
 * Tries the mutation live first; on a network failure (not a real HTTP
 * error) it queues instead of throwing — "saisie locale considérée
 * réussie avant réseau" (PRD §13.1). Any other error still throws, so
 * validation/server errors keep surfacing to the user normally.
 */
export async function runOrQueue<T = unknown>(
  resourceKey: string,
  endpoint: string,
  method: 'POST' | 'PUT',
  payload: unknown,
): Promise<{ queued: boolean; result: T | null }> {
  try {
    const result = await api<T>(endpoint, { method, body: payload });
    return { queued: false, result };
  } catch (err) {
    if (isNetworkError(err)) {
      await enqueue({ resourceKey, endpoint, method, payload });
      return { queued: true, result: null };
    }
    throw err;
  }
}
