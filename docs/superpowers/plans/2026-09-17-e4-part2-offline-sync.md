# E4 Part 2 — Offline Mutation Sync Implementation Plan

**Goal:** Journal, règles, and Projet Bébé signal entries survive a dropped
connection — queued locally, synced automatically, with a visible
`Hors ligne / Synchronisation… / Synchronisé / Échec de synchronisation`
status. Zero offline reads (deferred to E4 part 3, per user decision).

**Spec:** `docs/superpowers/specs/2026-09-17-e4-part2-offline-sync-design.md`

## Global constraints

- `frontend/src/lib/api.ts` is PROTECTED — read, never edit. It already
  throws `ApiError(0, ...)` for every network failure
  (`frontend/src/lib/api.ts:208`) — that is the only signal this plan needs
  to tell "go offline-queue this" apart from "surface a real error."
- `frontend/public/sw.js` is NOT touched by this plan (see spec §1's "No
  changes to sw.js").
- No new npm dependency. Hand-rolled IndexedDB, hand-rolled backoff.
- `sync-logic.ts` must stay dependency-free (no `db.ts`/browser API
  imports) so it can be unit tested under the existing Node-only Vitest
  config (`include: ['src/**/*.test.ts', ...]`, `environment: 'node'`).

---

### Task 1: Schema — `updatedAt` + `Prediction.version`

**Files:** `frontend/prisma/schema.prisma`,
`frontend/src/lib/server/cycles/recompute.ts`,
`frontend/src/lib/server/cycles/recompute.test.ts`,
`frontend/src/app/api/predictions/current/route.ts`,
`frontend/src/app/api/predictions/current/route.test.ts`

- [ ] Add `updatedAt DateTime @default(now()) @updatedAt` to `PeriodEvent`,
      `DailyLog`, `FertilitySignal`. Add `version Int @default(0)` to
      `Prediction`.
- [ ] Run `pnpm --filter frontend exec prisma migrate dev --name nawira_offline_sync`
      from repo root (or `cd frontend && pnpm db:migrate:dev --name nawira_offline_sync`).
      Confirm a new `frontend/prisma/migrations/10_nawira_offline_sync/`
      directory is generated and the dev DB applies cleanly.
- [ ] In `recompute.ts`'s `tx.prediction.upsert` call, add
      `version: { increment: 1 }` to the `update` object only (leave
      `create` alone — the column default `0` covers first-ever creation).
- [ ] Update `recompute.test.ts`'s existing upsert-shape assertions to
      account for the new `update.version` field (the mocked
      `prismaMock.prediction.upsert` call-arg assertions will need the new
      key added to their expected object).
- [ ] Add `version: prediction.version` to `GET /api/predictions/current`'s
      response object; add/extend a test asserting the field is present
      and numeric.
- [ ] Verify: `pnpm --filter frontend exec vitest run src/lib/server/cycles/recompute.test.ts src/app/api/predictions/current/route.test.ts` — green.
- [ ] Commit: `git add frontend/prisma frontend/src/lib/server/cycles/recompute.ts frontend/src/lib/server/cycles/recompute.test.ts frontend/src/app/api/predictions/current/route.ts frontend/src/app/api/predictions/current/route.test.ts && git commit -m "feat(offline): add updatedAt + prediction version columns (E4 part 2)"`

---

### Task 2: Offline lib — types, IndexedDB wrapper, pure sync logic

**Files (new):** `frontend/src/lib/offline/types.ts`,
`frontend/src/lib/offline/db.ts`, `frontend/src/lib/offline/sync-logic.ts`,
`frontend/src/lib/offline/sync-logic.test.ts`

- [ ] `types.ts` — export `QueuedMutation` (per spec §3) and
      `SyncStatus = 'idle' | 'offline' | 'syncing' | 'synced' | 'error'`.
- [ ] `db.ts` — raw `indexedDB.open('nawira-offline', 1)` with an
      `onupgradeneeded` creating object store `mutations` (`keyPath: 'id'`)
      plus an index on `resourceKey` (`unique: false`, used by `queue.ts`
      to find-and-replace). Export `getDb()`, `putMutation(m)`,
      `getAllMutations()`, `deleteMutation(id)`, `findByResourceKey(key)`.
      Every export wraps the raw `IDBRequest` callback API in a `Promise`.
      No test file — see spec §5 rationale.
- [ ] `sync-logic.ts` (pure, no imports from `db.ts` or `react`) —
      `backoffDelayMs(attempts: number): number` (1000 * 2^attempts, capped
      30000), `isNetworkError(err: unknown): boolean` (true iff
      `err instanceof ApiError && err.status === 0` — import only the
      `ApiError` class from `@/lib/api`, that import is safe/protected-read
      only, no protected file is modified), and
      `MAX_SYNC_ATTEMPTS = 5`.
- [ ] `sync-logic.test.ts` — table-test `backoffDelayMs` at attempts
      0/1/2/5/10 (confirm the cap holds), and `isNetworkError` against a
      constructed `new ApiError(0, 'x')` (true) and `new ApiError(422, 'x')`
      (false).
- [ ] Verify: `pnpm --filter frontend exec vitest run src/lib/offline/sync-logic.test.ts` — green. `pnpm --filter frontend exec tsc --noEmit`.
- [ ] Commit: `git add frontend/src/lib/offline && git commit -m "feat(offline): add IndexedDB queue primitives and pure sync logic (E4 part 2)"`

---

### Task 3: `OfflineQueue` + `SyncStatusContext`

**Files (new):** `frontend/src/lib/offline/queue.ts`,
`frontend/src/contexts/SyncStatusContext.tsx`

- [ ] `queue.ts` exports a module-level singleton with:
      `enqueue({ resourceKey, endpoint, method, payload }): Promise<void>`
      (finds any existing row for `resourceKey` via `db.ts`, reuses its
      `id` if found else `crypto.randomUUID()`, writes with `attempts: 0`,
      fresh `createdAt`); `drain(): Promise<{ synced: number; failed: number }>`
      (reads all rows oldest-first, for each: `api(endpoint, {method, body:
      payload})` — on success `deleteMutation` + if `endpoint` starts with
      `/api/period-events` or `/api/fertility-signals` dispatch
      `window.dispatchEvent(new Event('nawira:cycle-data-changed'))`; on
      `isNetworkError` failure, bump `attempts`, `putMutation` again, stop
      draining further rows this pass (still offline, no point burning
      through the rest of the queue); on any other error, if
      `attempts + 1 >= MAX_SYNC_ATTEMPTS` delete the row and count it
      `failed`, else bump attempts and keep it pending — return summary
      counts for the context to derive status from). No test file (thin
      glue over `db.ts`, same rationale as `db.ts`).
- [ ] `SyncStatusContext.tsx` — `'use client'`. Holds `pendingCount`,
      `status: SyncStatus`, exposes `useSyncStatus()`. On mount: reads
      `getAllMutations()` once to seed `pendingCount`, then calls
      `drain()`. Subscribes to `window.addEventListener('online', ...)` →
      immediate `drain()`; `window.addEventListener('offline', ...)` → sets
      `status: 'offline'`. While `pendingCount > 0` and online, schedules
      the next `drain()` via `setTimeout(backoffDelayMs(attempts))`,
      tracking a local `attempts` counter that resets to 0 on every
      `online` event or successful drain. After a drain that brings
      `pendingCount` to 0, sets `status: 'synced'` for 3s then `'idle'`
      (mirrors `ToastContext`'s own auto-dismiss timing pattern). Exposes
      `retryNow()` (calls `drain()` immediately, for the indicator's tap
      action on the failed state).
- [ ] Verify: `pnpm --filter frontend exec tsc --noEmit && pnpm --filter frontend exec eslint --max-warnings=0 src/lib/offline/queue.ts src/contexts/SyncStatusContext.tsx`.
- [ ] Commit: `git add frontend/src/lib/offline/queue.ts frontend/src/contexts/SyncStatusContext.tsx && git commit -m "feat(offline): add OfflineQueue drain loop and SyncStatusContext (E4 part 2)"`

---

### Task 4: UI indicator + layout wiring

**Files (new):** `frontend/src/components/app/SyncStatusIndicator.tsx`
**Files (modify):** `frontend/src/app/app/layout.tsx`,
`frontend/src/components/app/AppTopBar.tsx`

- [ ] `SyncStatusIndicator.tsx` — reads `useSyncStatus()`, renders `null`
      when `status === 'idle'`, else a small pill (spinner icon +
      `Synchronisation…` while syncing, amber `Hors ligne`, green check
      `Synchronisé`, red `Échec de synchronisation` — `onClick={retryNow}`
      only in the error state). Match the existing pill/badge visual
      language already used by `NotificationBell`'s unread badge (same
      border/shadow/rounded conventions, `lucide-react` icons already a
      project dependency — `WifiOff`, `RefreshCw`, `Check`, `AlertCircle`).
- [ ] `AppLayout` (`app/app/layout.tsx`) — wrap the existing return value's
      children in `<SyncStatusProvider>` (innermost wrapper, since it only
      needs to be alive while `/app/*` is mounted — `/app/log` and
      `/app/baby/add-lh-test` are both under this layout).
- [ ] `AppTopBar.tsx` — render `<SyncStatusIndicator />` next to
      `NotificationBell`/`UserMenu` (both desktop and mobile branches,
      matching how those two already render unconditionally on both).
- [ ] Verify: `pnpm --filter frontend exec tsc --noEmit && pnpm --filter frontend exec eslint --max-warnings=0 src/components/app/SyncStatusIndicator.tsx src/app/app/layout.tsx src/components/app/AppTopBar.tsx`.
- [ ] Commit: `git add frontend/src/components/app/SyncStatusIndicator.tsx frontend/src/app/app/layout.tsx frontend/src/components/app/AppTopBar.tsx && git commit -m "feat(offline): add sync status indicator to the app topbar (E4 part 2)"`

---

### Task 5: Wire the 3 write call sites

**Files (modify):** `frontend/src/app/app/log/page.tsx`,
`frontend/src/app/app/baby/add-lh-test/page.tsx`

- [ ] `app/log/page.tsx` — add a local `runOrQueue(resourceKey, endpoint,
      method, payload)` helper using `enqueue`/`isNetworkError` from the
      offline lib; rewrite `handleSubmit`'s 3 sequential `await api(...)`
      calls and `handlePeriodRangeSubmit`'s 1 call to go through it; track
      whether anything queued this submission to choose between the
      "Données enregistrées." success toast and a new
      "Hors ligne — sera synchronisé automatiquement." info toast (`toast(
      msg, 'info')` — confirm `ToastContext`'s `info` type renders
      acceptably, it already exists per `ToastContext.tsx:5`).
- [ ] `app/baby/add-lh-test/page.tsx` — same `runOrQueue` treatment for its
      single `PUT /api/fertility-signals/today` call in `handleSave`; keep
      the immediate `router.push('/app/baby')` on both real-success and
      queued paths.
- [ ] Add a `useEffect` in `/app/today`, `/app/calendar`, `/app/cycles`,
      `/app/baby` (`page.tsx` of each) subscribing to
      `window.addEventListener('nawira:cycle-data-changed', ...)` →
      re-invoke that page's existing `load()`/fetch function, cleaned up on
      unmount.
- [ ] Verify: `pnpm --filter frontend exec tsc --noEmit && pnpm --filter frontend run lint`.
- [ ] Commit: `git add frontend/src/app/app/log/page.tsx frontend/src/app/app/baby/add-lh-test/page.tsx frontend/src/app/app/today/page.tsx frontend/src/app/app/calendar/page.tsx frontend/src/app/app/cycles/page.tsx frontend/src/app/app/baby/page.tsx && git commit -m "feat(offline): queue period/journal/fertility writes when offline (E4 part 2)"`

---

### Task 6: Full gate + manual verification

- [ ] `pnpm --filter frontend run format && pnpm --filter frontend run lint && pnpm --filter frontend run typecheck && pnpm --filter frontend exec vitest run && pnpm --filter frontend run build` — all green.
- [ ] Manual browser pass (real logged-in session, real dev server):
  1. Load `/app/log`. DevTools → Network → Offline. Submit the daily-log
     form. Confirm an info toast (not an error) and the topbar shows
     `Hors ligne` then `Synchronisation…` is NOT shown yet (still offline).
  2. Confirm the mutation is visible in DevTools → Application → IndexedDB
     → `nawira-offline` → `mutations`.
  3. Re-enable network. Confirm auto-drain within one backoff tick: topbar
     transitions to `Synchronisation…` then `Synchronisé` (auto-hides),
     `mutations` store empties, and reloading `/app/log` shows the data
     really landed server-side (`GET /api/daily-logs/today` reflects it).
  4. Repeat for the period-range backfill form and `/app/baby/add-lh-test`.
  5. While offline, log a period event, then go online — confirm
     `/app/today`'s prediction card updates without a manual page reload
     (the `nawira:cycle-data-changed` listener firing).
  6. Force a permanent failure (e.g. temporarily add a 5th bogus header
     that trips CSRF, or stop the dev server mid-queue) to confirm the
     `Échec de synchronisation` state appears after 5 attempts and tapping
     it retries.
- [ ] Update `.planning/banani/STATUS.md` and `STATUS.md`/PRD tracking as
      appropriate to mark E4 part 2 done, part 3 (offline reads) still
      pending.
- [ ] No commit if the gate + manual pass are clean and nothing changed
      since Task 5's commit; otherwise a small `fix(offline): ...` commit
      for whatever the manual pass caught.
