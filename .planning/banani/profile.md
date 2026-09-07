# Profile — Banani → Next.js/Tailwind

## Source
- Banani screen ID: `acguXQuGeGbU/screens/Profile.jsx` (+ shared `ProfileHeaderCard.jsx`, `ProfileInformation.jsx`)
- Fetched: 2026-09-07

## Decisions (confirmed with user)
- **Read-only this pass** — no edit forms/PATCH endpoints for birth date, goal, cycle length, concerns. Matches the Calendar screen's precedent.
- Drop the in-page "Informations / Paramètres" tabs — they're just links to two different real routes (`/app/profile`, `/app/settings`), not a real tab switch.
- Drop "Nom complet" and "Pays" rows — `User`/`Profile` have no name or country field.
- Drop the fictional `UserAvatar` (AI-generated placeholder, same reasoning as the landing page) — reuse the initials-circle avatar pattern already in `AppTopBar`.
- Drop "Régularité du cycle" (Banani: static "Très régulier" badge) — no defined business logic for a standalone regularity label outside the prediction-confidence tiers; inventing one would be a silent new feature, not a translation.
- "Objectifs" — Banani shows multiple chips; our schema has ONE `goal` enum. Show the single chip, no "+ Ajouter".
- New backend needed: **`GET /api/profile`** (doesn't exist today — only `PATCH` for `notificationLevel`). Added in the same route file, `requireAuth`, no CSRF (GET).

## Structure map
- Header card (`ProfileHeaderCard`): initials avatar, email, "Membre depuis N mois" badge, 3 stat tiles (mois actifs / jours tracés / cycles complets) — all real, derived server-side.
- Info sections (`ProfileInformation`, 3 cards): Informations personnelles (email, date de naissance + âge calculé), Informations sur le cycle (durée moyenne cycle/règles déclarées), Santé et bien-être (préoccupations suivies — mapped via the same `CONCERNS` label map as onboarding; objectif — single chip via the same `GOALS` label map).
- Mobile-only account links block at the bottom (Paramètres / Centre d'aide / Déconnexion) — mobile has no sidebar, so this is the only way to reach those routes from `/app/profile`.

## Component breakdown
- **NEW** `frontend/src/app/api/profile/route.ts` — add `GET` handler alongside the existing `PATCH`. Response:
  ```ts
  {
    profile: {
      birthDate: string; goal: string; usualCycleLength: number | null;
      usualPeriodLength: number | null; trackedConcerns: string[];
      notificationLevel: string; createdAt: string;
    };
    stats: { monthsActive: number; daysTracked: number; cyclesCompleted: number };
  }
  ```
  `monthsActive` = whole months since `Profile.createdAt`. `daysTracked` = count of `PeriodEvent` rows (proxy until `DailyLog` ships in E4 — noted in a comment). `cyclesCompleted` = count of `Cycle` rows with `endDate IS NOT NULL`. 404 `PROFILE_NOT_FOUND` if missing (defensive — `/app/*` layout already gates on `hasProfile`).
- **NEW** `frontend/src/components/profile/ProfileHeaderCard.tsx` — props `{ email, createdAt, stats }`.
- **NEW** `frontend/src/components/profile/ProfileInfoSection.tsx` — small reusable card shell (icon + title + children), used by all 3 info cards to avoid repeating the card wrapper 3 times.
- **NEW** `frontend/src/app/app/profile/page.tsx` — fetches `GET /api/profile`, renders header + 3 info cards + mobile account-links block.
- **REUSE** `greetingName` (`@/lib/utils`) for the avatar initial.
- **CONST** concern/goal label maps — duplicated from `onboarding/concerns` and `onboarding/goal` (both are page-local consts, nothing to import) into `frontend/src/lib/profile-labels.ts` so Profile doesn't reach into onboarding page files.

## Token mapping
Already fully present in `globals.css` (`primary`, `primary-soft`, `navy`, `muted-foreground`, `border`, `background`, `green`/`green-soft` for the "Membre depuis" badge, `amber`/`amber-soft`, `rose`/`rose-soft` for concern chips).

## Responsive plan
- **375px**: single column, header card stacks avatar+email above the 3 stat tiles (3-col grid stays — tiles are small enough), info cards full width, mobile account-links block visible.
- **768px**: same structure, wider gutters (`px-6`).
- **1024px+**: `max-w-3xl` container (matches Banani), sidebar visible (shell already responsive), mobile account-links block hidden (`lg:hidden`).

## Interactions / state
- Loading: skeleton block (same pattern as `/app/today`).
- Error: red banner, same pattern as other screens.
- No mutations on this screen — no CSRF, no optimistic updates.

## Copy
All French, inline JSX (matches established codebase convention — no `constants.ts` dictionary).

## Implementation checklist
- [ ] `GET /api/profile` + test
- [ ] `ProfileHeaderCard`, `ProfileInfoSection`, `profile-labels.ts`
- [ ] `app/app/profile/page.tsx`
- [ ] 375/768/1280 check, typecheck/lint/build

## Open questions for user
None outstanding — read-only scope and dropped fields confirmed above.
