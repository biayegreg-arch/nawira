// Hand-rolled IndexedDB wrapper — one object store, four operations. No
// library (matches this codebase's "no Workbox" precedent for public/sw.js):
// the surface here is too small to justify a dependency. Every export wraps
// the raw IDBRequest callback API in a Promise. Untested (see
// docs/superpowers/specs/2026-09-17-e4-part2-offline-sync-design.md §5) —
// this codebase's Vitest config runs Node-only with no IndexedDB polyfill;
// verification is the manual browser pass in the E4-part-2 plan.
import type { QueuedMutation } from './types';

const DB_NAME = 'nawira-offline';
const DB_VERSION = 1;
const STORE = 'mutations';
const RESOURCE_KEY_INDEX = 'resourceKey';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex(RESOURCE_KEY_INDEX, 'resourceKey', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putMutation(mutation: QueuedMutation): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(mutation);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllMutations(): Promise<QueuedMutation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as QueuedMutation[]);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMutation(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function findByResourceKey(resourceKey: string): Promise<QueuedMutation | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).index(RESOURCE_KEY_INDEX).get(resourceKey);
    req.onsuccess = () => resolve((req.result as QueuedMutation | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}
