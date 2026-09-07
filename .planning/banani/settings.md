# Settings — Banani → Next.js/Tailwind

## Source
- Banani screen ID: `acguXQuGeGbU/screens/Settings.jsx` (+ shared `AccountSettings.jsx`)
- Fetched: 2026-09-07

## Decisions (confirmed with user)
Trim confirmed: keep only what has real backend. Everything else dropped entirely (not "coming soon" badges).

- **Kept, real backend, reused as-is**: password change/set (`PUT /api/auth/change-password`, `POST /api/auth/set-password`), Google account link (`GET /api/auth/oauth/google/start?next=/app/settings`) — this logic already exists in `frontend/src/app/settings/page.tsx` (the starter's generic settings page). Re-skin into the NAWIRA shell rather than rewrite the logic.
- **Kept, real backend, new UI**: notification level (`NORMAL`/`DISCREET`/`NONE` via `PATCH /api/profile`) — reuses the exact `OptionCard` + copy pattern from `onboarding/notifications/page.tsx`.
- **Dropped entirely** (no backend, and each would be a real feature to design, not a UI trim): 2FA, active sessions list, data-sharing toggle, analytics-visibility toggle, encrypted-storage toggle, language switcher (app is French-only, same reasoning as the landing page footer), timezone (no per-user timezone field), data export, account deletion.

## Structure map
- Header (title + subtitle).
- Section 1: Mot de passe (existing form, re-skinned to NAWIRA card style).
- Section 2: Comptes liés (existing Google-link block, re-skinned).
- Section 3: Notifications (new — 3 `OptionCard`s, `PATCH /api/profile`).

## Component breakdown
- **MODIFY** `frontend/src/app/settings/page.tsx` stays exactly as-is (izikit's generic starter page — untouched, still reachable at `/settings` for back-compat / any other flow that might link there).
- **NEW** `frontend/src/app/app/settings/page.tsx` — the NAWIRA-shell version at `/app/settings`, composing the 3 sections above. Password + Google-link logic is copied and re-skinned (same API calls, same error-code map), not abstracted into a shared component — the two pages serve different shells and duplicating ~60 lines of form logic is cheaper than a forced shared component per YAGNI.
- **REUSE** `OptionCard` (`@/components/onboarding/OptionCard`) for the notification-level picker.
- **REUSE** `GET /api/profile` (added for the Profile screen) to read the current `notificationLevel` on load.

## Token mapping
Already present in `globals.css`.

## Responsive plan
- **375px**: single column, full-width buttons/inputs, sections stacked.
- **768/1024px+**: `max-w-3xl` container matching Banani, sidebar shell handles the rest.

## Interactions / state
- Password form: same validation/error-code map as the existing `/settings` page (`INVALID_CREDENTIALS`, `PASSWORD_BANNED`, `PASSWORD_TOO_SHORT`, `PASSWORD_PWNED`, `PASSWORD_ALREADY_SET`, `VALIDATION_FAILED`).
- Notification picker: optimistic select + `PATCH`, toast on success/error, no page reload needed.
- Loading/error states: same pattern as other `/app/*` screens.

## Copy
French inline JSX, matching established convention.

## Implementation checklist
- [ ] `app/app/settings/page.tsx` (password + Google link re-skinned, notifications section new)
- [ ] 375/768/1280 check, typecheck/lint/build

## Open questions for user
None outstanding — trim confirmed above.
