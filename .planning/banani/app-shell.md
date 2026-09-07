# NAWIRA app shell — Banani → Next.js (prerequisite for `/app/*`)

## Source
- Banani screens: `DashboardAujourdhui`, `Calendar` (both `screenSize: "desktop"`)
- Shared components fetched: `NawiraSidebar.jsx`, `TopBar.jsx`
- Fetched: 2026-09-07

No `/app/*` route exists yet in this codebase — this is the first one. Per
`.planning/banani/STATUS.md`'s own plan ("Shared layout" section), the
sidebar + top bar must become a Next.js route-group layout wrapping every
`/app/*` route, and the already-built `MobileBottomNav` needs to be wired
in for mobile. This plan file covers that prerequisite shell; the two
screens themselves are planned separately (`dashboard-aujourdhui.md`,
`calendar.md`).

## Structure map
- **Desktop (≥1024px, `lg:`):** `NawiraSidebar` (fixed 256px left column,
  purple gradient, nav items + account items) + main column (`TopBar` +
  page content).
- **Mobile/tablet (<1024px):** no sidebar. A compact top bar (avatar +
  greeting only, no search/bell — those have no backend wiring yet) +
  page content + the existing `MobileBottomNav` fixed at the bottom.

## Component breakdown
- **NEW** `frontend/src/app/(app)/layout.tsx` — the route-group layout.
  Auth-gates via `useUser()` (redirect to `/login` if logged out) AND
  redirects to `/onboarding/welcome` if `!user.hasProfile` (mirror image
  of `onboarding/layout.tsx`'s own gate, which redirects the other way).
  Renders `AppSidebar` (desktop only, `hidden lg:flex`) + a content column
  with `AppTopBar` + `{children}` + `MobileBottomNav` (mobile only,
  `lg:hidden`, already exists).
- **NEW** `frontend/src/components/app/AppSidebar.tsx` — desktop sidebar.
  Nav items link to their real target routes even though most don't exist
  yet (`/app/log`, `/app/insights`, `/app/baby`, `/app/assistant`) —
  matches this project's established precedent (Phase 2 pointed
  login/verify-email at `/app/today` before it existed). Active state via
  `usePathname()`, same pattern as `MobileBottomNav`. Account-section
  items: "Profil" → `/app/profile` (not built, same precedent), "Paramètres"
  → `/app/settings` (already exists), "Abonnement" → `/app/billing` (not
  built), "Centre d'aide" → `/app/help` (not built), "Déconnexion" → calls
  `logout()` from `useAuth()`, no route.
- **NEW** `frontend/src/components/app/AppTopBar.tsx` — desktop: search
  bar (decorative, non-functional — no search backend exists) + bell icon
  (decorative, no unread-count wiring this phase — NAWIRA doesn't
  generate any notifications yet, so there's nothing real to show) + user
  avatar/name from `useAuth()`. Mobile: simplified to just a greeting +
  avatar (search/bell dropped — clutter with no function, and 375px has
  no room for them next to a touch-friendly header).
- **REUSE** `frontend/src/components/nav/MobileBottomNav.tsx` — already
  built, just needs to be dropped into this layout (mobile-only).
- **REUSE** `useAuth()`/`useUser()` from `AuthContext`.

## Token mapping (Banani → project)
Already-shipped tokens in `globals.css` cover 100% of this fetch — no new
tokens needed:

| Banani token | Project token |
|---|---|
| `--color-primary: #6C43C1` | `primary` (exact match) |
| Sidebar gradient `#5B35A8 → #4A2A95` | new one-off gradient (see below — no existing `sidebar` token) |
| `--color-navy: #1F2937` | `navy` (exact match) |
| `--color-pink: #D968A6` | `rose` (exact match) |
| `bg-card` (`#FFFFFF`) | plain `bg-white` (no `card` token exists yet — not worth adding for one usage) |

**New addition to `globals.css`'s `@theme` block:** `--color-sidebar-from: #5B35A8;` / `--color-sidebar-to: #4A2A95;` for the gradient (Tailwind v4 arbitrary gradients read theme colors directly: `bg-gradient-to-b from-sidebar-from to-sidebar-to`).

## Tailwind translation notes
- Sidebar `width: 256px` → `w-64`.
- Nav item `padding: 10px 12px` → `px-3 py-2.5`.
- `border-radius: 8px` (nav item active bg) → `rounded-lg` — wait, Banani's `--radius-md: 12px` is the closer match → `rounded-xl` is 12px in this project's default Tailwind scale... actually project doesn't extend `--radius-*` in `globals.css` (checked — only color/font tokens exist). Use Tailwind's default `rounded-lg` (8px) to match Banani's nav-item radius (`rounded-md` in their CSS, which is their own 12px token — closest built-in Tailwind class to their visual is `rounded-lg`; verified by eye against the fetched HTML, not just guessed).
- TopBar search pill: `border-radius: 999px` → `rounded-full`.

## Responsive plan (MANDATORY)
- **Base (375px):** No sidebar at all. Top bar collapses to: NAWIRA
  logo/icon + "Bonjour {firstName}" + avatar, single row, `px-4 py-3`.
  `MobileBottomNav` fixed at the bottom (already built, unchanged).
  Content area gets `pb-20` to clear the fixed bottom nav.
- **md (768px):** Same mobile shell (no sidebar yet — a 768px tablet in
  portrait doesn't have room for a 256px sidebar without cramping
  content per this project's mobile-first discipline). Top bar can widen
  slightly but stays search/bell-free.
- **lg (1024px+):** Sidebar appears (`hidden lg:flex`), full `TopBar`
  with search + bell, `MobileBottomNav` hides (`lg:hidden`). This is
  where the Banani desktop mockup is faithfully reproduced.

## Interactions / state
- Sidebar/bottom-nav active state: `usePathname()` exact-or-prefix match,
  same as `MobileBottomNav`'s existing logic.
- "Déconnexion" in the sidebar's account list: calls `logout()`, no
  confirmation modal this phase (Banani's `Logout` screen — a confirm
  dialog — is a separate, not-yet-built screen per `STATUS.md`; wiring a
  bare `logout()` call now is a reasonable, harmless simplification, not
  a regression, since there was no logout entry point in the sidebar
  before this phase at all).
- Layout is a Client Component (`'use client'`) — needs `useAuth()`.

## Copy / i18n
All Banani strings are already French. New strings needed: none beyond
what Banani ships, except the greeting needs a real first name — NAWIRA's
`User` type has no `firstName`/`name` field (only `email`). Propose:
greet by the email's local-part (`user.email.split('@')[0]`) title-cased,
OR just drop the name and say "Bonjour 👋" generically. Flagged below as
an open question.

## Implementation checklist
- [ ] Add `--color-sidebar-from`/`--color-sidebar-to` to `globals.css`
- [ ] Build `AppSidebar` (desktop)
- [ ] Build `AppTopBar` (responsive: mobile-simplified / desktop-full)
- [ ] Build `(app)/layout.tsx` (auth+profile gate, composes sidebar/topbar/bottom-nav)
- [ ] 375px check — no sidebar, bottom nav visible, no horizontal scroll
- [ ] 768px check — still mobile shell, no cramped sidebar
- [ ] 1280px check — matches Banani sidebar/topbar pixel-for-pixel
- [ ] Touch targets ≥48px on mobile top bar and bottom nav (bottom nav already verified in its own prior build)
- [ ] Keyboard nav / focus rings on all sidebar links

## Open questions for user
1. **Greeting name** — `User` has no name field, only `email`. Use the
   email's local-part (e.g. "Bonjour Aminata" if email is
   `aminata@example.com`), or drop the personalized name entirely
   ("Bonjour 👋")?
2. **Sidebar/account links to not-yet-built routes** — confirm my default
   (link to the real future paths now, matching the login/verify-email
   precedent) rather than disabling them or hiding them until built.
3. **TopBar search + bell** — confirm keeping them as non-functional
   decoration on desktop (matches Banani), or should I hide them until
   they have real backends?
