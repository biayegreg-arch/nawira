# Logout confirmation modal — Banani → Next.js/Tailwind

## Source
- Banani screen ID: `acguXQuGeGbU/screens/Logout.jsx` (+ shared `LogoutConfirmationModal.jsx`)
- Fetched: 2026-09-07

## Decisions
- Not a route — a modal triggered from `AppSidebar`'s "Déconnexion" item, which today calls `logout()` directly with zero confirmation. This closes that gap.
- Drop the fictional `UserAvatar` — reuse the initials-circle pattern.
- Keep the 3 reassurance bullets (data stays encrypted / auto-reconnect / other devices stay logged in) — genuinely useful, no backend needed, all statements are already true of the existing auth design (JWT refresh, per-device sessions).

## Structure map
- Overlay + centered card: header ("Déconnexion" + close ✕), body (avatar-initial, "Tu es sûre ?", 3 info rows), footer (Annuler / Déconnexion buttons).

## Component breakdown
- **NEW** `frontend/src/components/app/LogoutModal.tsx` — props `{ open, onCancel, onConfirm, loading }`. Pure presentational, no data fetching.
- **MODIFY** `frontend/src/components/app/AppSidebar.tsx` — replace the direct `onClick={() => void logout()}` with `onClick={() => setShowLogoutModal(true)}`, render `<LogoutModal open={showLogoutModal} onCancel={...} onConfirm={...} loading={loggingOut} />`. Uses `loggingOut` already exposed by `useAuth()`.

## Token mapping
Already present (`error`/`error-bg` need adding — Banani's danger button is `#C94B5F` on white; closest existing token is none, so extend `@theme` with `--color-danger: #c94b5f;` + `--color-danger-bg: #fce8ec;` since this is the first real destructive-action button in the app).

## Responsive plan
- Modal is viewport-centered at all sizes; card is `w-full max-w-sm` with side padding so it never touches the screen edges at 375px. No desktop-only content to adapt (Banani's mockup is already just a centered card, not a full desktop layout).

## Interactions / state
- `open` toggled by sidebar state; `Escape` key and overlay click both cancel (a11y).
- `onConfirm` calls the existing `logout()` from `AuthContext` (already handles cookie clearing, cache invalidation, `setUser(null)`); the layout's own auth gate then redirects to `/login` automatically once `user` becomes `null`.
- Confirm button disabled + "Déconnexion…" label while `loggingOut` is true.

## Copy
French inline JSX.

## Implementation checklist
- [ ] `LogoutModal.tsx` + danger tokens in `globals.css`
- [ ] Wire into `AppSidebar.tsx`
- [ ] 375/768/1280 check (mainly: doesn't break the sidebar/page behind it, touch targets ≥48px), typecheck/lint/build

## Open questions for user
None.
