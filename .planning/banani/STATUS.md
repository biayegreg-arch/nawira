# Banani implementation status

Last updated: 2026-09-06

Source flow: **"Design System NAWIRA"** — Banani flow id `acguXQuGeGbU` (https://app.banani.co/flow/acguXQuGeGbU)
Full fetch saved: 15 screens + 46 shared components, JSX/Tailwind, `screenSize: "desktop"`. Of the 15 fetched screens, 3 were duplicates of another screen and were dropped as unnecessary (user decision, 2026-09-06) — see "Duplicate screens dropped" below. 12 screens remain in scope.

## Done

- [x] `LandingPage` — `frontend/src/app/page.tsx` + `frontend/src/components/landing/*` — plan: this file (see delta notes below) — 2026-09-06
- [x] Signup (no Banani source) — `frontend/src/app/signup/page.tsx` — restyled from `examples/frontend-pages/signup.tsx` with NAWIRA branding — 2026-09-06
- [x] Login (no Banani source) — `frontend/src/app/login/page.tsx` — restyled from `examples/frontend-pages/login.tsx` — 2026-09-06
- [x] Verify-email (no Banani source) — `frontend/src/app/verify-email/page.tsx` — restyled from `examples/frontend-pages/verify-email.tsx` — 2026-09-06

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

### Verified

- `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test` (570/570) and `pnpm build` all green.
- Rendered check via headless Chrome at 375px / 768px / 1280px — no horizontal scroll, no overlap, colors/tokens render correctly (after clearing a stale Turbopack cache that had briefly masked the new `@theme` tokens).
- Real signup → verify-email flow driven end-to-end in a browser against the live dev server (real Neon DB, real Resend-configured env) — 201 on signup, correct redirect with prefilled email, code peeked from DB the same way `scripts/smoke-auth.ts` does.

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
| `DashboardAujourdhui` | `/app/today` | ❌ needs Phase 1-3 (Cycle model + prediction engine) | Home screen (PRD HOME01). Depends on `Cycle`/`Prediction` models existing. |
| `Calendar` | `/app/calendar` | ❌ needs Phase 1 + 3 | Composes `FullMonthCalendar`, `MiniCalendar`. |
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

- `NawiraSidebar` + `TopBar` — the desktop app shell per PRD §28.10. Should become a Next.js route-group layout (e.g. `frontend/src/app/(app)/layout.tsx`) wrapping every `/app/*` route, rather than being re-imported per screen.
- **Mobile bottom nav — done.** `frontend/src/components/nav/MobileBottomNav.tsx`, built 2026-09-06 from a real Banani source (`DashboardMobile.jsx` — "NAWIRA — Aujourd'hui (Mobile)", the bottom-nav section only; the rest of that screen — cycle ring, predictions, mood selector, key data — is the mobile version of `DashboardAujourdhui` and stays pending on Phase 1-3 like its desktop counterpart). 5 items: Accueil (`/app/today`), Calendrier (`/app/calendar`), Saisir (`/app/log`), Analyses (`/app/insights`), Profil (`/app/profile`). **Note:** Banani's label for the 5th item is "Profil", not "Assistant" as PRD §6 states — followed Banani (the concrete, most recent design decision) over the older PRD wording; flag if that's not intended. Active-state styling uses the existing `text-primary`/`text-muted-light` tokens, not the new hexes below. Not yet wired into a layout (no `/app/*` routes exist yet) — ready to drop into the future `(app)` layout.
- This same Banani fetch also delivered the **authoritative theme file** (`/style.css` — a `@theme` block with the full NAWIRA palette: `primary` scale 50/100/300/500/700/800, `pink`/`pink-300/100/50`, `fertility`/`fertility-100`, `gold`/`gold-light`, semantic `success/warning/error/info`, `sidebar` colors, radius scale, and **font `DM Sans`** for both body and headings). Two things to reconcile later: (1) our `--color-background` is `#FFF7F3` (PRD crème) vs Banani's authoritative `#FDFBFD` (very pale lavender) — kept ours per user instruction to preserve the colors already used on shipped pages; (2) we're using Inter (already wired in `layout.tsx`) instead of Banani's actual `DM Sans` — not changed yet, flagging for a decision before more screens ship.

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
