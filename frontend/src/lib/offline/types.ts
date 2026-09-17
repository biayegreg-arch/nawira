export interface QueuedMutation {
  id: string;
  /** Dedup key — enqueueing the same key again replaces the pending row. */
  resourceKey: string;
  endpoint: string;
  method: 'POST' | 'PUT';
  payload: unknown;
  createdAt: string;
  attempts: number;
}

export type SyncStatus = 'idle' | 'offline' | 'syncing' | 'synced' | 'error';
