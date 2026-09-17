# E4 (part 2) — Offline Mutation Sync Design

## 1. Scope

Completes PRD Epic E4 ("Journal & offline") for the **write** half of §28.5
Offline: journal, règles, et signaux Projet Bébé restent saisissables sans
réseau. The **read** half (consultation du calendrier/historique déjà
synchronisé hors-ligne) is explicitly deferred to a separate "E4 part 3"
pass — confirmed with the user (AskUserQuestion, 2026-09-17) — so this spec
adds zero offline data reads.

Builds on E4 part 1 (`docs/superpowers/specs/2026-09-17-e4-pwa-shell-design.md`,
shipped), which deliberately left the entire mutation path untouched: the
service worker (`frontend/public/sw.js`) passes through every `/api/*`
request and every non-`GET` request unmodified. This spec does not touch
`sw.js` — the offline queue lives entirely in foreground page JS (rationale
in §4).

**In scope:**
- A hand-written IndexedDB-backed mutation queue (`frontend/src/lib/offline/`)
  covering exactly 3 endpoints: `PUT /api/daily-logs/today`,
  `POST /api/period-events`, `PUT /api/fertility-signals/today`.
- Each queued mutation carries a client UUID, `createdAt`, attempt count,
  and a `resourceKey` used to dedupe (PRD's "UUID, version, updated_at,
  sync_state" — see §5 for how this maps without over-building).
- Exponential-backoff retry, triggered by the browser `online` event, app
  mount, and a capped backoff timer while items are pending.
- A global sync-status indicator in `AppTopBar`: `Hors ligne` /
  `Synchronisation…` / `Synchronisé` / `Échec de synchronisation`.
- Wiring into the two real call sites that write these 3 endpoints:
  `frontend/src/app/app/log/page.tsx` (`handleSubmit`,
  `handlePeriodRangeSubmit`) and `frontend/src/app/app/baby/add-lh-test/page.tsx`
  (`handleSave`).
- Server: `updatedAt` added to `PeriodEvent`/`DailyLog`/`FertilitySignal`
  (provenance, matches PRD data model intent), and a `version` counter on
  `Prediction`, incremented every recompute — the concrete
  `prediction_version` PRD §13.1 asks for. A `nawira:cycle-data-changed`
  browser event fires after any successful sync of a period/fertility
  mutation so already-mounted pages (`/app/today`, `/app/calendar`,
  `/app/cycles`, `/app/baby`) refetch instead of showing stale predictions.

**Out of scope (explicit deviations, decided before writing this spec):**
- **No offline reads.** Viewing the calendar/history while offline still
  shows the existing loading/error states — deferred to E4 part 3.
- **No genuine multi-writer conflict resolution.** PRD §13.1 asks for
  "conflit simple : dernière modification utilisateur avec horodatage
  serveur/client normalisé." All 3 target endpoints are already per-day
  `upsert`s (confirmed by reading each route handler), and PRD §28.5 itself
  places "synchronisation multi-appareils" in the online-only bucket — so
  the only real conflict this app can produce is the **same device**
  queuing two edits to the same day before either syncs. That case is
  handled by **queue-level dedup**: enqueueing a mutation for a
  `resourceKey` already pending replaces it rather than stacking both —
  "dernière modification utilisateur" falls out of this for free, with no
  server-timestamp-comparison protocol needed. Building real
  last-write-wins-by-server-timestamp conflict UI for a single-device v1
  would be speculative complexity with no reachable trigger today.
- **No Background Sync API.** `navigator.serviceWorker.ready.sync` real
  background sync only fires while the SW is alive and has patchy browser
  support (no Safari/iOS — a real deployment target here per the PRD's
  Africa-first market). The queue instead drains from foreground JS on
  `online`/mount/backoff-timer, which is universally supported and — per
  the CSRF finding below — the only option that can reuse the existing,
  protected `lib/api.ts` unmodified.
- **No IndexedDB library** (`idb`/`idb-keyval`). Same rationale as part 1's
  "no Workbox": one object store, ~4 operations (put/getAll/delete/clear) —
  hand-rolling the raw `indexedDB` calls is simpler than adding a
  dependency and keeps `lib/api.ts` (protected) completely unmodified.
- **No offline batching/atomicity across the 3 endpoints.** `handleSubmit`
  in `/app/log` already fires 3 independent HTTP calls today (daily-log,
  optional period-event, fertility-signal) — this spec queues each as an
  independent mutation rather than inventing a new combined endpoint. If
  the network drops mid-`handleSubmit`, some of the 3 may sync immediately
  and others queue; this matches the granularity the backend already
  exposes and avoids a new API surface for this pass.
- **No changes to `frontend/public/sw.js`.** It keeps its part-1 contract
  (never touches `/api/*` or non-`GET`). Confirmed reachable: the SW
  cannot read `document.cookie`/`localStorage` (no `window`/`document` in
  SW global scope), so it cannot resolve the CSRF token `lib/api.ts` needs
  — a queue drain running inside a `sync` event handler would 403 on every
  replay. Foreground-JS draining sidesteps this entirely.

## 2. Data model changes

```prisma
model PeriodEvent {
  // ...unchanged fields...
  updatedAt DateTime @default(now()) @updatedAt
}
model DailyLog {
  // ...unchanged fields...
  updatedAt DateTime @default(now()) @updatedAt
}
model FertilitySignal {
  // ...unchanged fields...
  updatedAt DateTime @default(now()) @updatedAt
}
model Prediction {
  // ...unchanged fields...
  version Int @default(0)
}
```

`recomputeCyclesAndPrediction` (`frontend/src/lib/server/cycles/recompute.ts`)
increments `version` (`{ increment: 1 }`) on the `update` branch of its
`tx.prediction.upsert` call; `create` leaves it at the schema default `0`.
`GET /api/predictions/current` adds `version: number` to its response.
Nothing server-side currently reads `updatedAt` — it exists for provenance
and to keep the door open for real cross-device conflict handling later
without another migration.

## 3. Client architecture

```
frontend/src/lib/offline/
  types.ts        — QueuedMutation, SyncStatus shapes
  db.ts           — raw IndexedDB wrapper (open/put/getAll/delete), untested
  sync-logic.ts   — PURE functions: dedup-key derivation, backoff-delay
                    calculation, network-vs-http error classification —
                    unit tested (no IndexedDB needed)
  queue.ts        — OfflineQueue singleton: enqueue()/drain(), wires
                    sync-logic.ts + db.ts together, untested (thin glue)
frontend/src/contexts/SyncStatusContext.tsx
  — SyncStatusProvider (mounted in frontend/src/app/app/layout.tsx),
    useSyncStatus() hook. Owns the OfflineQueue instance, listens for
    `online`/`offline` window events, drains on mount + reconnect + a
    capped exponential backoff timer while pendingCount > 0.
frontend/src/components/app/SyncStatusIndicator.tsx
  — small pill in AppTopBar, only rendered when status !== 'idle'.
```

**Why IndexedDB I/O and the queue's glue layer stay untested**: mirrors the
precedent already set and documented in the E4 part-1 plan (service worker
and its 2 client components got zero automated tests, verified manually
instead) — this codebase's Vitest setup is Node-only with no jsdom/DOM
polyfill, so IndexedDB isn't reachable from a unit test without adding a
polyfill dependency (`fake-indexeddb`) purely for test scaffolding. Instead,
every actual **decision** (which mutation wins on dedup, how long to wait
before retrying, whether a given failure means "queue it" or "surface a
real error") is factored into plain, dependency-free functions in
`sync-logic.ts` that a normal Vitest run does test. `db.ts`/`queue.ts`
verification is the manual browser pass in the plan's final task.

**Error classification (the key insight that makes this simple):**
`lib/api.ts` (protected, read-only) always throws `ApiError`, including on
network failure — with `status === 0` and `code === ''`
(`frontend/src/lib/api.ts:208`). A genuine HTTP error (validation 4xx,
server 5xx) always carries a real, non-zero `status`. So the call sites'
existing `try { await api(...) } catch (err)` blocks need exactly one new
branch: `err instanceof ApiError && err.status === 0` → offline/network
failure → enqueue and treat as an optimistic success (PRD: "saisie locale
considérée réussie avant réseau"). Any other error → unchanged existing
behavior (toast the real error) — a queue that silently swallowed a
`VALIDATION_FAILED` and replayed it forever would hide real bugs from the
user.

**`QueuedMutation` shape:**
```ts
interface QueuedMutation {
  id: string; // crypto.randomUUID()
  resourceKey: string; // e.g. "daily-log:2026-09-17" — dedup key
  endpoint: string;
  method: 'POST' | 'PUT';
  payload: unknown;
  createdAt: string; // ISO, client clock
  attempts: number;
}
```
`resourceKey` schemes: `daily-log:<date>`, `period-event:<date>` (today CTA),
`period-event-range:<startDate>:<endDate>` (backfill form),
`fertility-signal:<date>`. Enqueueing a `resourceKey` that already has a
pending row **replaces** it (same id reused, `attempts` reset to 0,
`payload`/`createdAt` overwritten) — this is the entire conflict-resolution
story per the out-of-scope note above.

**Backoff schedule** (`sync-logic.ts`, pure + tested):
`delayMs = min(30_000, 1_000 * 2 ** attempts)` — 1s, 2s, 4s, 8s, 16s, capped
at 30s. Reset to attempt 0 on every `online` event (a fresh network state
deserves an immediate retry, not a stale backoff).

## 4. UI wiring

`SyncStatusIndicator` states map directly to PRD §28.5's required 4
strings. `status` derivation (in `SyncStatusContext`):
- `pendingCount === 0 && navigator.onLine` → not rendered (fully synced,
  nothing to show — avoids a permanent "Synchronisé" badge cluttering the
  topbar when there's never been anything to sync).
- `!navigator.onLine` → `Hors ligne` (amber).
- `navigator.onLine && pendingCount > 0 && currentlyDraining` →
  `Synchronisation…` (spinner).
- Just transitioned from pending>0 to pending===0 → `Synchronisé` (green
  check, auto-hides after 3s, same pattern as `ToastContext`'s
  auto-dismiss).
- A mutation exhausted `MAX_ATTEMPTS` (5) without syncing → `Échec de
  synchronisation` (red, persists, tappable — calls `drain()` again
  immediately on tap rather than waiting for the next backoff tick).

`frontend/src/app/app/log/page.tsx` changes:
- `handleSubmit`: each of the 3 `await api(...)` calls gets wrapped with a
  small local helper `runOrQueue(resourceKey, endpoint, method, payload)`
  that enqueues on `status === 0` instead of throwing. The success toast
  becomes conditional: `"Données enregistrées."` if every call actually
  reached the server, `"Hors ligne — sera synchronisé automatiquement."`
  (info-style toast, not error) if anything queued. `await load()` still
  runs after — the 3 endpoints' GETs correctly reflect only what really
  landed server-side; the newly-queued data simply isn't visible again
  until it syncs (matches "local write succeeds, view reflects server
  truth" rather than inventing an optimistic-merge cache, which PRD's
  read-cache is explicitly deferred).
- `handlePeriodRangeSubmit`: same `runOrQueue` treatment, one call.

`frontend/src/app/app/baby/add-lh-test/page.tsx` `handleSave`: same
`runOrQueue` treatment; still `router.push('/app/baby')` immediately after
either a real save or a successful enqueue (PRD's "local write counts as
success" applies here too — the LH result already reflects in `selected`
state client-side before the navigation).

`nawira:cycle-data-changed` — a plain `window.dispatchEvent(new Event(...))`
fired by `OfflineQueue` after any `period-event`/`period-event-range`/
`fertility-signal` mutation syncs successfully (not `daily-log` — that
doesn't affect predictions). `/app/today`, `/app/calendar`, `/app/cycles`,
`/app/baby` each add one `useEffect` subscribing to it and calling their
existing `load()`. This is the practical form "prediction_version
invalidation" takes here — simpler than diffing `version` numbers
client-side, since the queue already knows exactly when a relevant sync
just landed. `version` is still returned by the API (§2) as the literal,
inspectable PRD field even though this pass's own invalidation trigger
doesn't need to read it.

## 5. Testing

- `sync-logic.test.ts` — dedup-key derivation, backoff delay at each
  attempt count (0 through cap), and the `isNetworkError(err)` classifier
  against both an `ApiError(0, ...)` and an `ApiError(422, ...)`.
- `frontend/prisma/schema.prisma` change — no dedicated test; covered by
  existing route tests continuing to pass after `prisma generate`.
- No component tests for `SyncStatusIndicator`/`SyncStatusContext` (same
  Node-only Vitest rationale as part 1) — manual browser verification:
  toggle DevTools "Offline", submit the daily-log form, confirm the
  optimistic success toast + `Hors ligne` badge, re-enable network, confirm
  auto-drain + `Synchronisé` badge + the previously-queued data now visible
  via `GET`.

## 6. Migration

`pnpm db:migrate:dev --name nawira_offline_sync` (from `frontend/`) — a
real versioned migration, matching every prior schema change in this repo
(`prisma/migrations/1_oauth_accounts` … `9_nawira_assistant`), not a bare
`db:push`.
