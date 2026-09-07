# Banani implementation status

Last updated: 2026-09-07

Source flow: **"Design System NAWIRA"** — Banani flow id `acguXQuGeGbU` (https://app.banani.co/flow/acguXQuGeGbU)
Full fetch saved: 15 screens + 46 shared components, JSX/Tailwind, `screenSize: "desktop"`. Of the 15 fetched screens, 3 were duplicates of another screen and were dropped as unnecessary (user decision, 2026-09-06) — see "Duplicate screens dropped" below. 12 screens remain in scope.

## Done

- [x] `LandingPage` — `frontend/src/app/page.tsx` + `frontend/src/components/landing/*` — plan: this file (see delta notes below) — 2026-09-06
- [x] Signup (no Banani source) — `frontend/src/app/signup/page.tsx` — restyled from `examples/frontend-pages/signup.tsx` with NAWIRA branding — 2026-09-06
- [x] Login (no Banani source) — `frontend/src/app/login/page.tsx` — restyled from `examples/frontend-pages/login.tsx` — 2026-09-06
- [x] Verify-email (no Banani source) — `frontend/src/app/verify-email/page.tsx` — restyled from `examples/frontend-pages/verify-email.tsx` — 2026-09-06
- [x] Shared `/app/*` shell — `frontend/src/app/app/layout.tsx` (auth+profile gate), `frontend/src/components/app/AppSidebar.tsx`, `frontend/src/components/app/AppTopBar.tsx` — plan: `.planning/banani/app-shell.md` — 2026-09-07
- [x] `DashboardAujourdhui` — `frontend/src/app/app/today/page.tsx` — plan: `.planning/banani/dashboard-aujourdhui.md` — 2026-09-07
- [x] `Calendar` — `frontend/src/app/app/calendar/page.tsx` — plan: `.planning/banani/calendar.md` — 2026-09-07

New shared primitives: `frontend/src/components/ui/Button.tsx`, `frontend/src/components/ui/Field.tsx`, `frontend/src/components/auth/AuthCard.tsx`. Design tokens added to `frontend/src/app/globals.css` (`@theme` block — primary/navy confirmed exact match with PRD §0; rose/green/amber/purple are Banani's actual accent hexes, renamed to avoid colliding with Tailwind's built-in default palette names of the same words).

### Delta vs Banani source (decided with user before implementation)

- Fake social-proof stats ("50 000+ femmes", "4,8/5", "95%", fabricated testimonial from "Fatou") — **removed entirely**, replaced with 3 honest trust points + a transparent "nouveau produit" note.
- Hero/Social-proof photos — Banani used AI-generated `<Image prompt="...">` placeholders (no such component exists in Next.js). Replaced with a real, verified, freely-usable Unsplash photo (`photo-1531123897727-8f129e1688ce`) matching the PRD's imagery brief (confident, contemporary African woman). Needs replacing with real brand photography before public launch.
- "Voir la démonstration" button — removed (no demo exists yet).
- Hero's absolutely-positioned italic handwritten callout ("Une femme informée...") — dropped for this pass (desktop-only positioning, not mobile-first compatible as authored; can be re-added with a responsive treatment later).
- Features section's fake app-mockup preview (mobile+desktop dashboard screenshot mockup) — dropped for this pass (large chunk, `/app/today` doesn't exist yet to screenshot for real). Candidate to re-add once the real dashboard ships.
- Footer social icons (Facebook/Instagram/YouTube/LinkedIn) — removed; `lucide-react` v1 no longer ships brand icons, and no real social accounts are configured yet. Nav/footer links pointing to non-existent pages (Tarifs, FAQ, Blog, Carrières, À propos, Confidentialité, Conditions d'utilisation) trimmed to only anchors/pages that actually exist.
- Google OAuth button — omitted from Signup/Login (not configured in this environment; would 404).
- Login/Verify-email redirect to `/app/today` (PRD §28.2 target) — **this route doesn't exist yet** (Phase 3 — moteur de cycle). Expected temporary 404 until that phase ships; kept as the correct target rather than a throwaway route name.
- Password minLength bumped from the example's 8 to 10, matching `AUTH_PASSWORD_MIN_LENGTH=10` default.
- Footer's "Entreprise" column (À propos/Blog/Carrières/Contact) — dropped entirely; every item pointed to a non-existent page, leaving nothing to keep in that category.
- Footer bottom-bar language selector (FR dropdown) — dropped; app is French-only, no i18n switcher exists.
- LandingCTA's supporting paragraph — reworded to drop Banani's implied "des milliers de femmes qui ont déjà fait confiance" trust claim, consistent with the fake-social-proof removal elsewhere on the page.

### Verified

- `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test` (570/570) and `pnpm build` all green.
- Rendered check via headless Chrome at 375px / 768px / 1280px — no horizontal scroll, no overlap, colors/tokens render correctly (after clearing a stale Turbopack cache that had briefly masked the new `@theme` tokens).
- Real signup → verify-email flow driven end-to-end in a browser against the live dev server (real Neon DB, real Resend-configured env) — 201 on signup, correct redirect with prefilled email, code peeked from DB the same way `scripts/smoke-auth.ts` does.
- **2026-09-06 audit** (re-fetched `LandingPage.jsx` from Banani via MCP and diffed line-by-line against the shipped components): every observed deviation traces back to a decision already logged above; three minor undocumented ones backfilled into the delta list this pass (Entreprise footer column, language selector, CTA copy). No unintended drift found.
- **API-wiring audit (2026-09-06):** signup/login/verify-email request bodies and success/error shapes checked against their route handlers — all match. Found and fixed a real gap: all three pages rendered the backend's raw `ApiError.message` (always English — e.g. "Invalid email or password.") in a French-only UI. Added `err.code` → French-string maps in each page, matching the pattern already used in `src/app/settings/page.tsx` and the convention documented in CLAUDE.md ("Frontend switches on `ApiError.code`, not translated messages"). Also confirmed the `if (res.csrfToken) storeCsrfToken(...)` calls in login/verify-email (and in `api.ts`'s own refresh handler) are inert dead code — no backend route actually echoes `csrfToken` in its JSON body; the token only ever travels via the non-httpOnly cookie `setCsrfCookie()` sets, which `api.ts`'s `getCsrfToken()` already reads directly. Harmless, left as-is (pre-existing pattern from the starter's example pages).

### Delta vs Banani source — `DashboardAujourdhui` / `Calendar` (2026-09-07)

- `CycleCard`'s 4-phase (menstrual/follicular/ovulation/luteal) fertility ring — **rebuilt from scratch** as `frontend/src/components/today/CycleRing.tsx`, a single neutral progress arc ("Jour N sur ~L jours"). Phase segments encode fertility-window claims, out of scope until E5.
- `PredictionCards`' ovulation + fenêtre fertile cards — dropped; kept only "Prochaines règles" as `frontend/src/components/today/PredictionCard.tsx`.
- `MoodSelector`, `TrendsChart`, `KeyDataCards`, `ProjetBebeCard`, `DailyTip` — all dropped (out of scope; `KeyDataCards`/`DailyTip` per explicit user decision, the rest per already-established Phase 3 scope).
- Period-logging CTA (`PeriodLogCta.tsx`) — not in the Banani source at all; added because Phase 3's minimal-logging design requires a "mes règles ont commencé" action on Home.
- `FullMonthCalendar`'s 2 hardcoded months — replaced with real prev/next month navigation and live day-types (`observed`/`predicted`/`today`) derived from the API via `frontend/src/lib/calendar-day-types.ts`.
- Legend reduced from Banani's fuller set to Règles/Prédit/Aujourd'hui; kept only the first "À propos de ce calendrier" info note (dropped two implying edit/journal features).
- `AppTopBar`'s search bar + notification bell — kept as non-functional decoration on desktop (no backend for either yet); simplified to a greeting line on mobile.
- Greeting name — derived from the email local-part (`User` has no name field yet), capitalized.
- Sidebar links point to real future routes (`/app/log`, `/app/insights`, `/app/baby`, `/app/assistant`, `/app/profile`, `/app/settings`, `/app/billing`, `/app/help`) even though most don't exist yet — matches this project's own pre-existing `/app/today` precedent.

### Verified — `DashboardAujourdhui` / `Calendar` (2026-09-07)

- `pnpm typecheck`, `pnpm lint`, and `pnpm build` all green.
- Caught and fixed a routing bug during verification: the shared layout was first built under a route **group** `(app)/`, which Next.js excludes from the URL — pages resolved to `/today`/`/calendar` instead of `/app/today`/`/app/calendar`. Renamed to a literal `frontend/src/app/app/` folder; rebuilt and confirmed the route list now shows `/app/today` and `/app/calendar`.
- Rendered check via a real logged-in session (seeded `user@example.com`, real onboarding + period-logging API calls) at 375px / 768px / 1280px on both screens: no horizontal scroll (`scrollWidth === clientWidth` at all six checks), no overlapping elements, mobile bottom nav / desktop sidebar+topbar both render correctly, cards and calendar legend match the trimmed design.

## In progress

_(none)_

## Pending — screens (ordered by recommended implementation phase)

| Screen (Banani `screenName`) | Target route (PRD §28.2) | Backend readiness | Notes |
|---|---|---|---|
| `LandingPage` | `/` | ✅ none needed (static) | Replaces the starter's placeholder `frontend/src/app/page.tsx`. Composes `LandingNav`, `LandingHero`, `LandingFeatures`, `LandingLifecycle`, `LandingSocialProof`, `LandingCTA`, `LandingFooter`. |
| `HelpCenter` | `/app/help` (new, not in original PRD route table) | ✅ none needed (static content) | Composes `HelpArticlesList`, `HelpCenterSearch`, `HelpSupportContact`. Content needs real copy (educational, medically reviewed per PRD §33). |
| `Settings` | `/app/settings` (izikit already ships a generic `/settings`) | ✅ mostly reuse — `/api/auth/change-password`, `/api/notifications/prefs` already exist | **Needs comparison** with existing `frontend/src/app/settings/page.tsx` (password + Google-link flows already work, just unstyled) before deciding reuse vs rebuild. `AccountSettings` component likely maps 1:1. |
| `Profile` | `/app/profile` | ✅ mostly reuse — `GET /api/auth/me` gives base user fields | `ProfileHeaderCard`, `ProfileInformation`. Needs `Profile` domain fields (goal, usual_cycle_length, usual_period_length) from PRD §14 — depends on Phase 1 data model (Prisma). |
| `Logout` | modal, not a route | ✅ reuse — `logout()` in `AuthContext` + `POST /api/auth/logout` already fully wired | `LogoutConfirmationModal` — just needs the confirm-dialog UI wired to the existing working logout call. Trivial. |
| `Subscription` | `/app/billing` | ⚠️ partial — Bictorys/webhooks/circuit-breaker exist, but Prisma has `Order`/`Withdrawal`, not a `Subscription` model (PRD §14) | `CurrentPlanCard`, `PremiumPlansGrid`, `PaymentMethods`, `BillingHistory`. Needs Phase 1 data model + entitlements wiring (roadmap Phase 7). |
| `CycleDetailFull` | sub-route/modal under `/app/calendar` or `/app/insights` | ❌ needs Phase 1 + 3 | Composes `CycleDetailView` + `MiniCalendar` + `PredictionCards`. (`CycleDetail`, the lighter variant with just `CycleDetailView`, was dropped as redundant — see below.) |
| `AddData` | `/app/log` | ❌ needs Phase 1 (daily_logs/symptom_logs models) | Generic `DataEntryForm` — matches PRD LOG01's single consolidated quick-entry screen. (`AddFatigue`, a single-symptom variant, was dropped as redundant — see below.) |
| `Analytics` | `/app/insights` | ❌ needs Phase 1 + 3 + 6 (insights/Cycle Score) | Composes `AnalyticsRecommendations`, `TrendsChart`, `MoodDistributionChart`, `CycleComparisonCard`, `SymptomStatistics`. |
| `FertilityCalendar` | part of `/app/calendar` (Projet Bébé view) or `/app/baby` | ❌ needs Phase 1 + 5 (fertility engine) | Composes `FertilityCalendarInfo`, `FertilityCalendarLegend`. |
| `ProjetBebe` | `/app/baby` | ❌ needs Phase 1 + 5 | Composes `FertilityWindowCard`, `ConceptionTipsCard`, `LHTestTracker`, `ConceptionStatistics`. (`ProjetBebeDiscovery`, a near-identical duplicate, was dropped as redundant — see below.) |
| `Assistant` | `/app/assistant` | ❌ needs Phase 8 (AI Gateway + medical guardrails) | Composes `AssistantChatMessages`, `AssistantSidebarTopics`. Highest complexity — build last. |

## Duplicate screens dropped (user decision, 2026-09-06)

Of the 15 Banani screens, 3 were near-duplicates of another screen in the set with no PRD-identified need for two separate routes. Dropped from scope entirely — not just deferred:

| Dropped | Kept instead | Why |
|---|---|---|
| `CycleDetail` | `CycleDetailFull` | `CycleDetailFull` is a strict superset (adds `MiniCalendar` + `PredictionCards`) and better matches the PRD's need to show predictions/navigation on the detail view. |
| `AddFatigue` | `AddData` | PRD LOG01 specifies one consolidated quick-entry screen (saignement/douleur/humeur/énergie/sommeil/symptômes/glaire/température/LH/note together), not a per-symptom screen. `AddFatigue`'s single-symptom pattern isn't called for anywhere in the PRD; revisit only if a future notification deep-link needs a focused single-field entry (as a modal, not a route). |
| `ProjetBebeDiscovery` | `ProjetBebe` | The two sources are functionally identical (same 4 components); `Discovery` only added a `UserAvatar` import with no other distinguishing content. `ProjetBebe` is kept as the simpler name matching the `/app/baby` route. |

## Shared layout (prerequisite for every `/app/*` screen)

- **Done 2026-09-07.** `NawiraSidebar` + `TopBar` rebuilt as `frontend/src/components/app/AppSidebar.tsx` + `frontend/src/components/app/AppTopBar.tsx`, wired into `frontend/src/app/app/layout.tsx` — a real literal `app/` route segment (not a route group — a `(app)/` route group was tried first and dropped because Next.js excludes group folders from the URL, which silently produced `/today`/`/calendar` instead of `/app/today`/`/app/calendar`). The layout gates on `useUser()` (redirect to `/login`) and `hasProfile` (redirect to `/onboarding/welcome`), matching `onboarding/layout.tsx`'s existing auth-gate pattern. Desktop shows `AppSidebar` + `AppTopBar`; mobile hides the sidebar and uses `MobileBottomNav` instead.
- **Mobile bottom nav — done.** `frontend/src/components/nav/MobileBottomNav.tsx`, built 2026-09-06 from a real Banani source (`DashboardMobile.jsx` — "NAWIRA — Aujourd'hui (Mobile)", the bottom-nav section only). 5 items: Accueil (`/app/today`), Calendrier (`/app/calendar`), Saisir (`/app/log`), Analyses (`/app/insights`), Profil (`/app/profile`). **Resolved 2026-09-06** (user: "utilise la meilleure option"): kept "Profil" — Banani's `Assistant` (PRD §7 AI chat, `/app/assistant`) is a separate pending screen in its own right, so there's no actual conflict; the bottom nav's 5th item and the standalone Assistant feature are different surfaces. **Wired into the layout as of 2026-09-07.**
- This same Banani fetch also delivered the **authoritative theme file** (`/style.css` — a `@theme` block with the full NAWIRA palette: `primary` scale 50/100/300/500/700/800, `pink`/`pink-300/100/50`, `fertility`/`fertility-100`, `gold`/`gold-light`, semantic `success/warning/error/info`, `sidebar` colors, radius scale, and **font `DM Sans`** for both body and headings). **Resolved 2026-09-06** (user: "utilise la meilleure option"): adopted Banani's authoritative values on both already-shipped pages — (1) `--color-background` changed from `#FFF7F3` (PRD crème) to Banani's `#FDFBFD`, now identical to `--color-surface` (Banani's real design uses one flat page background, not two); (2) swapped `Inter` → `DM Sans` in `layout.tsx` + `globals.css` `--font-body`/`--font-headings`. Rationale: Banani is the concrete, current source of truth per the design-implementation skill, and this was still early enough (4 pages) to reconcile cheaply. Re-verified: typecheck/lint clean, re-screenshotted 375/768/1280px — no regression, uniform background renders correctly, DM Sans loads via `next/font/google`.

## Gap vs PRD

- **No onboarding screens** (OB01–OB11, PRD §5) exist in this Banani export. Must be designed later or built without visual reference.
- **No design token/theme file** was exported — colors referenced by class name only (`text-navy`, `bg-background`, `text-primary`, `text-muted-foreground`, `border-primary`). Proposed mapping onto the PRD's official palette (§0), pending confirmation:

  | Banani token | Proposed value (PRD §0) |
  |---|---|
  | `primary` | `#6C43C1` (violet principal) |
  | (secondary/light accent) | `#A78BE8` (violet clair) |
  | (soft accent) | `#F4CDD4` (rose poudré) |
  | `background` | `#FFF7F3` (crème) |
  | `navy` | `#1F2937` (gris/bleu nuit) |

## Open design questions

- ~~Exact hex values for Banani's tokens~~ — **resolved 2026-09-06**: the mobile-nav fetch included the authoritative `/style.css` theme file. Full values now in `frontend/src/app/globals.css`; two reconciliation items remain, see "Shared layout" section above (`background` hex, and Inter vs `DM Sans` font).
- ~~Mobile nav has no Banani source~~ — **resolved 2026-09-06**: real source fetched (`DashboardMobile.jsx`), built as `frontend/src/components/nav/MobileBottomNav.tsx`. One label discrepancy vs PRD §6 flagged above ("Profil" vs "Assistant").
