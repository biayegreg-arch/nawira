# Admin (E11) — Banani → Next.js

## Source
- Banani screen ID: `acguXQuGeGbU/screens/Admin.jsx` ("NAWIRA — Admin")
- Fetched: 2026-09-19
- Shared: `/style.css` (theme tokens, already adopted project-wide), `NawiraSidebar.jsx`/`TopBar.jsx` (consumer-app shell — NOT reused here, see decisions)

## Decisions confirmed with user (2026-09-19)

1. **Drop all fictional content, no fabricated backend.** KPI cards (utilisatrices actives/abonnées Plus/MRR/rétention), the MRR/revenue panel, the moderation & signalements panel, and the platform-settings toggles all have zero backing data anywhere in the schema (no subscription model, no forum/report model, no platform-config model) — dropped entirely rather than inventing numbers, matching every other screen's established "no fake content" discipline (see `.planning/banani/STATUS.md`'s Subscription/HelpCenter deltas).
2. **Dedicated admin shell, not the consumer app's.** New `AdminSidebar`/`AdminTopBar` (nav: Users/Orders/Withdrawals/Audit log/Outbox/Email queue/Rate limits — the 7 real `/api/admin/*` read surfaces), gated via `GET /api/admin/me`, modeled on `examples/frontend-pages/admin/layout.tsx`.
3. **This pass ships `/admin` (overview) + `/admin/users` (full CRUD-lite) only.** Orders/Withdrawals/Audit-log/Outbox/Email-queue/Rate-limits become nav links today (disabled/"à venir" state) — real screens in a future pass, no Banani source exists for any of them yet.

## Structure map

- **`/admin` (overview)**: real admin greeting (email + role from `GET /api/admin/me`), a capability chips row (from the same call's real `can: string[]` array — genuinely real data, not fabricated), 7 section-link cards styled with Banani's KPI-card visual language (icon/color/label) but linking to `/admin/{users,orders,withdrawals,audit-log,outbox,email-queue,rate-limits}` — only Users is a live link this pass, the other 6 render as disabled cards with "Bientôt disponible".
- **`/admin/users`**: real, complete admin-users screen — search box (`?q=`), cursor-paginated table (`GET /api/admin/users`), row click → detail panel (`GET /api/admin/users/[id]`), role change (SUPERADMIN-only, `PATCH .../role`, blocked with `LAST_SUPERADMIN` handling), status suspend/restore (`PATCH .../status`, SUPERADMIN-only for restore and for suspending a SUPERADMIN target).

## Component breakdown

- **NEW** `AdminSidebar.tsx` — desktop vertical nav, 7 items + admin identity footer (email/role). `src/components/admin/`.
- **NEW** `AdminTopBar.tsx` — page title/breadcrumb only (no consumer-app search bar/bell — those are user-facing app features, not admin ones).
- **NEW** `AdminMobileNav.tsx` — mobile: a simple top dropdown/sheet nav (7 links), since a back-office is desktop-primary but must not break at 375px per the skill's mobile-first rule.
- **NEW** `src/app/admin/layout.tsx` — the auth gate (`GET /api/admin/me`, redirect non-admins to `/`), wraps children in the admin shell. Modeled on `examples/frontend-pages/admin/layout.tsx` + this project's own `onboarding/layout.tsx`/`app/layout.tsx` gate pattern.
- **NEW** `src/app/admin/page.tsx` — overview.
- **NEW** `SectionLinkCard.tsx` — the 7 nav cards (icon/color/label/href/disabled).
- **NEW** `src/app/admin/users/page.tsx` — users list + search + pagination.
- **NEW** `UserRow.tsx` / `UserDetailPanel.tsx` — table row + a slide-over/modal detail view with role/status controls.
- **NEW** `InitialsAvatar.tsx` — plain 2-letter avatar (from email), replacing Banani's fake demographic `UserAvatar`. Generic enough to reuse anywhere a user avatar is needed without a real photo.
- **REUSE** `Button.tsx`, `Field.tsx` (existing `src/components/ui/`).
- **PRIMITIVE** `Badge.tsx` — new, for role (`USER`/`ADMIN`/`SUPERADMIN`) and status (`ACTIVE`/`SUSPENDED`/`DELETED`) pills — first real need for a generic badge in this codebase (checked: none exists yet).

## Token mapping (Banani → project)

Already-adopted tokens (`frontend/src/app/globals.css` `@theme` block) cover everything this screen needs: `--color-primary` (#6C43C1), `--color-navy`, `--color-muted-foreground`, `--color-card`, `--color-border`, `--color-success`/`success-bg`, `--color-warning`/`warning-bg`, `--color-error`/`error-bg`. No new tokens needed — this screen introduces no new colors beyond the already-shipped semantic success/warning/error trio (used for status badges).

| Banani inline style | Project token/class |
|---|---|
| `background: '#6C43C1'` (primary buttons/active states) | `bg-primary` |
| `background: '#EEE7FA', color: '#6C43C1'` (Plus badge) | not reused — no plan/subscription data in admin scope |
| `background: '#E2F3EA', color: '#4F9D78'` (active/success) | `bg-success-bg text-success` |
| `background: '#FBF1D8', color: '#D9A441'` (trial/warning) | not reused as-is; repurposed for `SUSPENDED` badge → `bg-warning-bg text-warning` |
| `background: '#FCE8EC', color: '#C94B5F'` (error) | `bg-error-bg text-error` — used for `DELETED` status badge |
| sidebar gradient `linear-gradient(180deg,#5B35A8,#4A2A95)` | reused verbatim via an inline `@theme`-safe utility class (already how the consumer `AppSidebar` does it, per `.planning/banani/app-shell.md` precedent) — confirm exact class at implementation time |

## Tailwind translation notes

- `display:grid; gridTemplateColumns:'1fr 1fr 1fr 1fr'` (KPI row) → repurposed for the 7 section-link cards: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5` (dropped the fixed 4-col desktop-only grid).
- `gridTemplateColumns:'1fr 420px'` (users+revenue split) → not reused (revenue panel dropped); users table becomes full-width on `/admin/users`.
- Table `padding`/`border` values → `px-6 py-3`/`border-border`, matching existing project table conventions (none exist yet in `/app/*`, so this establishes the admin table convention — checked, no precedent to diverge from).

## Responsive plan (mandatory — Banani screen is desktop-only, `screenSize: "desktop"`)

- **Base (375px)**: `AdminSidebar` hidden; `AdminMobileNav` (a `<select>`-driven or sheet-style link list) replaces it, matching `MobileBottomNav`'s existing mobile-substitution precedent for `/app/*`. Overview cards stack 1-column. Users table becomes a stacked card list (email/role/status/date), not a horizontally-scrolling table — no horizontal scroll allowed per the skill's iron rule.
- **sm (640px+)**: overview cards 2-column.
- **md (768px+)**: users list can switch to a real `<table>` if columns fit; sidebar still hidden (back-office desktop-first content, but nav must still work at tablet width).
- **lg (1024px+)**: `AdminSidebar` appears (fixed 256px, matches Banani's `w-64`), overview cards 4-column, users table full desktop layout — this is where Banani's design is faithfully reproduced.
- **xl (1280px+)**: max-width container matching the rest of `/app/*`'s content padding conventions.

## Interactions / state

- Loading: skeleton rows (users table) / a centered "Chargement…" (overview, matches existing `/app/*` loading conventions — checked `app/today/page.tsx` for precedent).
- Empty: `GET /api/admin/users` returns `{ items: [], nextCursor: null }` on no match — real empty state ("Aucune utilisatrice trouvée"), not a 404 (per CLAUDE.md D-LIST-05).
- Error: `ApiError` → toast via the existing `ToastProvider` (already wraps the whole app per `layout.tsx`), matching every other mutating action in this codebase.
- Role/status change: confirm dialog before a destructive-feeling action (suspend, especially) — SUPERADMIN-only UI branches hidden entirely for plain ADMIN actors (not just disabled — `can` array from `/api/admin/me` tells the client which capabilities it has).
- Focus/keyboard: table rows and cards are real `<button>`/`<Link>` elements (not `<div onClick>`), so keyboard/focus-ring works by default.

## Copy / i18n

All French, no new `constants.ts` needed for admin strings this pass (small enough vocabulary to inline, matching e.g. `AppSidebar.tsx`'s own inline label pattern rather than a data file) — will follow the codebase's actual established convention at implementation time (check `constants.ts` usage frequency before deciding).

## Implementation checklist

- [ ] `AdminSidebar`/`AdminTopBar`/`AdminMobileNav` + `src/app/admin/layout.tsx` (auth gate)
- [ ] `Badge.tsx` primitive + `InitialsAvatar.tsx` primitive
- [ ] `/admin` overview page (real `/api/admin/me` data + 7 section cards, 1 live)
- [ ] `/admin/users` page: search + paginated table/list + detail panel + role change (SUPERADMIN) + status change (role-aware gate)
- [ ] 375px / 768px / 1280px checks, no horizontal scroll, ≥48px touch targets on mobile card actions
- [ ] Wire to real data throughout — zero fabricated numbers
- [ ] `pnpm typecheck && pnpm lint && pnpm build`, real browser check against a seeded ADMIN and SUPERADMIN session (need to confirm a superadmin test account exists via `pnpm db:make-superadmin`)

## Open questions for user

- None blocking — all 3 batched questions already answered. One implementation-time judgment call flagged in advance: exact sidebar gradient class name will be confirmed against `AppSidebar.tsx`'s existing implementation rather than reinvented.

## Delta — 2026-09-20 revision (overview page rebuilt for visual parity)

User compared the shipped `/admin` overview against Banani's `Admin.jsx` side by side
(screenshots) and flagged a real gap: the 2026-09-19 pass correctly avoided fabricating
data, but went further than that and collapsed Banani's whole KPI/table/chart/panel
*structure* into a generic 7-card link grid — losing the dashboard's actual shape, not
just its fake numbers. Re-fetched the same Banani screen via the MCP (unchanged since
2026-09-19) and re-ran the same 2 decision points as `AskUserQuestion`s; both were
reconfirmed identically:

1. **Placeholder honnête** (not fake data, not a full backend build): render Banani's
   exact card/panel shapes and positions; substitute honest "Bientôt disponible" content
   only where no real data source exists. Real data wherever it does exist.
2. **Keep the dedicated Admin shell** (`AdminSidebar`/`AdminTopBar`) rather than
   literally matching Banani's reused consumer-app sidebar — Banani only designed this
   one screen, not the other 8 admin sections that shell navigates to.

### What changed

- **`/admin` (`frontend/src/app/admin/page.tsx`) rebuilt from scratch** to reproduce
  Banani's actual layout: 4 KPI cards, a real inline "Gestion des utilisatrices" preview
  table (search + 6 most recent users, "Voir tout →" to the full `/admin/users` page),
  a 2-panel revenue/MRR column, and a bottom moderation + platform-settings row —
  instead of the previous 7-link-card grid (`SectionLinkCard.tsx`, now deleted — it had
  no other caller).
- **2 of the 4 KPIs are real**, backed by a new `GET /api/admin/stats` route
  (`activeUsers`: `User.count({status:'ACTIVE'})`, `paidProfiles`:
  `Profile.count({plan: {in:['PLUS','BABY']}})`) — the only two numbers in Banani's KPI
  row that this schema can answer honestly. MRR and retention-rate cards show "Bientôt
  disponible" in the value slot, same card shell/icon/position as Banani.
- **No fabricated deltas.** Banani's KPI cards each carry a `+X%` badge; there is no
  historical snapshot table to diff against for ANY of the 4 metrics (real or
  placeholder), so no card shows one — an empty slot rather than an invented number.
- **New reusable `AdminComingSoonPanel`** (`frontend/src/components/admin/`) — one
  component for all 4 no-backend panels (MRR chart, Abonnements & revenus, Modération,
  Paramètres plateforme), rather than 4 bespoke placeholders. Deliberately
  non-interactive: Banani's platform-settings toggles and "Ignorer/Agir" moderation
  buttons are NOT reproduced as clickable no-ops — a fake control that does nothing on
  click is worse than an honest static placeholder.
- **Header trimmed to one real action.** "Exporter rapport" (no export endpoint exists)
  dropped rather than shipped as a dead button. "Paramètres globaux" repurposed as a
  real link to `/admin/pricing` (the closest existing global-settings surface),
  shown only when `can.includes('pricing:write')` (SUPERADMIN).
- **`GET /api/admin/users` gained a `total` field** (`prisma.user.count()` run in
  parallel with the list query, filtered by q/status/role but NOT by the pagination
  cursor) so the preview table's "Affichage 1–6 sur {total}" is a real number, not
  Banani's fixed "12 847". `AdminUserListResponse` type updated to match.
- **Bonus correctness fix found while touching that route**: the old `where` shape
  spread `cursorWhere(cursor)` directly over the q-search filter — both produce an `OR`
  key, so the cursor's `OR` silently overwrote the search's `OR` whenever a search was
  paginated past its first page (i.e. clicking "Charger plus" after typing a search on
  `/admin/users` would silently drop the search filter). Fixed by nesting both under
  `AND` instead of a flat spread; added a regression test
  (`route.test.ts`: "GET combines a search query with cursor pagination...").
- Real admin identity (email + role badge) kept, but trimmed from a full capability-chip
  wall to one inline line in the header subtitle — Banani's header doesn't show
  capability debugging info, and the chip wall wasn't part of the visual gap being
  fixed.

### Verified — 2026-09-20

- `pnpm typecheck`, `pnpm lint`, `pnpm format` all clean.
- `pnpm test`: **944/944** passing (up from 895 — 29 in the extended
  `admin/users/route.test.ts` incl. 2 new `total`/AND-fix tests, 3 new
  `admin/stats/route.test.ts`), zero regressions.
- `pnpm build` succeeds; `/admin` and `/api/admin/stats` both resolve in the route list.
- **Not verified this pass**: no browser-automation tool was available in this session
  (the 2026-09-19 pass had Playwright access; this one didn't) — the 375/768/1280px
  visual/responsive check and a real logged-in click-through were NOT performed by the
  agent. Flagged to the user to confirm visually before considering this screen fully
  closed out.
