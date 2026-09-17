// Hand-rolled IndexedDB wrapper — two object stores (mutation queue +
// read cache), a handful of operations. No library (matches this
// codebase's "no Workbox" precedent for public/sw.js): the surface here
// is too small to justify a dependency. Every export wraps the raw
// IDBRequest callback API in a Promise. Untested (see
// docs/superpowers/specs/2026-09-17-e4-part2-offline-sync-design.md §5
// and .../2026-09-17-e4-part3-offline-reads-design.md) — this codebase's
// Vitest config runs Node-only with no IndexedDB polyfill; verification
// is the manual browser pass in each plan.
import type { QueuedMutation } from './types';

const DB_NAME = 'nawira-offline';
const DB_VERSION = 2;
const STORE = 'mutations';
const RESOURCE_KEY_INDEX = 'resourceKey';
const READ_CACHE_STORE = 'readCache';

interface ReadCacheEntry {
  endpoint: string;
  data: unknown;
  cachedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex(RESOURCE_KEY_INDEX, 'resourceKey', { unique: false });
      }
      if (!db.objectStoreNames.contains(READ_CACHE_STORE)) {
        db.createObjectStore(READ_CACHE_STORE, { keyPath: 'endpoint' });
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

export async function getCachedRead(endpoint: string): Promise<ReadCacheEntry | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(READ_CACHE_STORE, 'readonly');
    const req = tx.objectStore(READ_CACHE_STORE).get(endpoint);
    req.onsuccess = () => resolve((req.result as ReadCacheEntry | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function putCachedRead(endpoint: string, data: unknown): Promise<void> {
  const db = await openDb();
  const entry: ReadCacheEntry = { endpoint, data, cachedAt: new Date().toISOString() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(READ_CACHE_STORE, 'readwrite');
    tx.objectStore(READ_CACHE_STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
