# E4 Part 3 — Offline Read Cache Implementation Plan

**Goal:** The calendar, cycle history, journal, and Projet Bébé screens
still render their last-known data when offline, instead of falling
straight to the existing "Impossible de charger tes données" error block.

**Spec:** `docs/superpowers/specs/2026-09-17-e4-part3-offline-reads-design.md`

## Global constraints

- Reuses `frontend/src/lib/offline/db.ts` (bump `DB_VERSION` 1 → 2, add a
  second object store) and `sync-logic.ts`'s existing `isNetworkError` —
  no new dependency, no changes to the part-2 `mutations` store or queue.
- `frontend/src/lib/api.ts` stays untouched (protected, read-only).
- Cache key = endpoint string (verified: none of the 7 target endpoints
  take query params in this app).

---

### Task 1: Read-cache store + `fetchCached()`

**Files:** `frontend/src/lib/offline/db.ts` (modify),
`frontend/src/lib/offline/read-cache.ts` (new)

- [ ] Bump `DB_VERSION` to `2`. In `onupgradeneeded`, keep the existing
      `mutations` store creation guarded by `!objectStoreNames.contains`
      (already idempotent), add a second guarded block creating
      `readCache` (`keyPath: 'endpoint'`).
- [ ] Add `getCachedRead(endpoint): Promise<{ endpoint: string; data: unknown; cachedAt: string } | null>`
      and `putCachedRead(endpoint: string, data: unknown): Promise<void>` to
      `db.ts`, same Promise-wrapped-IDBRequest style as the existing 4
      functions.
- [ ] `read-cache.ts` — `fetchCached<T>(endpoint: string): Promise<{ data: T; stale: boolean; cachedAt: string | null }>`:
      try `api<T>(endpoint)`, cache it, return `{data, stale: false,
      cachedAt: now}`; on `isNetworkError`, look up `getCachedRead`, return
      the cached value with `stale: true` if found, else rethrow; any
      non-network error rethrows unconditionally (a real 401/500 must
      still surface, not silently show stale data).
- [ ] Verify: `pnpm --filter frontend exec tsc --noEmit`. No new test file
      (thin glue over `db.ts`, same rationale as part 2's `queue.ts`).

---

### Task 2: `OfflineDataBanner` + wire into the 6 pages

**Files (new):** `frontend/src/components/app/OfflineDataBanner.tsx`
**Files (modify):** `frontend/src/app/app/today/page.tsx`,
`frontend/src/app/app/calendar/page.tsx`,
`frontend/src/app/app/cycles/page.tsx`,
`frontend/src/app/app/log/page.tsx`,
`frontend/src/app/app/baby/page.tsx`,
`frontend/src/app/app/baby/add-lh-test/page.tsx`

- [ ] `OfflineDataBanner.tsx` — small banner, `{ cachedAt: string }` prop,
      reuses `frontend/src/lib/time-ago.ts`'s `timeAgo()` (already used by
      `NotificationBell`) for the relative-time string.
- [ ] In each page's `load()`: replace every `api<T>(endpoint)` call inside
      the `Promise.all` with `fetchCached<T>(endpoint)`; unwrap `.data` at
      each destructured result instead of using the result directly;
      derive `const stale = results.some((r) => r.stale)` and
      `const cachedAt = results.find((r) => r.stale)?.cachedAt ?? null`;
      store both in new `offlineCachedAt: string | null` state, set from
      `cachedAt` only when `stale` is true, else `null`.
- [ ] Render `<OfflineDataBanner cachedAt={offlineCachedAt} />` right below
      each page's header when `offlineCachedAt` is non-null.
- [ ] Verify: `pnpm --filter frontend exec tsc --noEmit && pnpm --filter frontend run lint`.

---

### Task 3: Full gate + manual verification

- [ ] `pnpm --filter frontend run format && pnpm --filter frontend run lint && pnpm --filter frontend run typecheck && pnpm --filter frontend exec vitest run && pnpm --filter frontend run build`.
- [ ] Manual browser pass: load each of the 6 pages once online (populates
      the cache), go DevTools → Network → Offline, reload each page.
      Confirm real data renders (not the error block) with the
      "Hors ligne — données de …" banner, and that a page never visited
      while online still correctly falls back to the existing error state
      (no cache to serve).
