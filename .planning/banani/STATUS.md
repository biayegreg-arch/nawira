# Banani implementation status

Last updated: 2026-09-06

Source flow: **"Design System NAWIRA"** — Banani flow id `acguXQuGeGbU` (https://app.banani.co/flow/acguXQuGeGbU)
Full fetch saved: 15 screens + 46 shared components, JSX/Tailwind, `screenSize: "desktop"`.

## Done

_(none yet)_

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
| `CycleDetail` vs `CycleDetailFull` | sub-route/modal under `/app/calendar` or `/app/insights` | ❌ needs Phase 1 + 3 | **Near-duplicate — clarify with user.** `CycleDetail` = `CycleDetailView` only. `CycleDetailFull` = `CycleDetailView` + `MiniCalendar` + `PredictionCards`. Likely two states of the same screen (collapsed vs expanded) rather than two separate routes — confirm before building both. |
| `AddData` vs `AddFatigue` | `/app/log` | ❌ needs Phase 1 (daily_logs/symptom_logs models) | **Clarify with user.** `AddData` = generic `DataEntryForm`. `AddFatigue` = same shell but `FatigueDetailForm` only — looks like a focused single-symptom quick-entry variant (e.g. reached from a "Comment te sens-tu ?" notification, PRD N02) rather than a separate top-level screen. |
| `Analytics` | `/app/insights` | ❌ needs Phase 1 + 3 + 6 (insights/Cycle Score) | Composes `AnalyticsRecommendations`, `TrendsChart`, `MoodDistributionChart`, `CycleComparisonCard`, `SymptomStatistics`. |
| `FertilityCalendar` | part of `/app/calendar` (Projet Bébé view) or `/app/baby` | ❌ needs Phase 1 + 5 (fertility engine) | Composes `FertilityCalendarInfo`, `FertilityCalendarLegend`. |
| `ProjetBebe` vs `ProjetBebeDiscovery` | `/app/baby` | ❌ needs Phase 1 + 5 | **Near-duplicate — clarify with user.** Sources are almost identical (same 4 components: `FertilityWindowCard`, `ConceptionTipsCard`, `LHTestTracker`, `ConceptionStatistics`); `Discovery` additionally imports `UserAvatar`. Confirm which is canonical before building both. |
| `Assistant` | `/app/assistant` | ❌ needs Phase 8 (AI Gateway + medical guardrails) | Composes `AssistantChatMessages`, `AssistantSidebarTopics`. Highest complexity — build last. |

## Shared layout (prerequisite for every `/app/*` screen)

- `NawiraSidebar` + `TopBar` — the desktop app shell per PRD §28.10. Should become a Next.js route-group layout (e.g. `frontend/src/app/(app)/layout.tsx`) wrapping every `/app/*` route, rather than being re-imported per screen.
- **Mobile nav is NOT covered by this Banani export** — all screens are `screenSize: "desktop"`. Per PRD §6/§28.3, mobile needs bottom nav (`Aujourd'hui | Calendrier | + | Analyses | Assistant`) which has no Banani source yet. Per `banani-design-implementation` skill rules, mobile-first is mandatory regardless — we design the mobile nav ourselves and layer the Banani desktop sidebar on top at `lg:`.

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

- `CycleDetail` vs `CycleDetailFull` — one screen with two states, or genuinely two routes? — raised 2026-09-06, pending user answer
- `AddData` vs `AddFatigue` — is `AddFatigue` a per-symptom quick-entry pattern (template for all symptom types) or a one-off? — raised 2026-09-06, pending user answer
- `ProjetBebe` vs `ProjetBebeDiscovery` — which is canonical; is `Discovery` the pre-subscription teaser (PW02) and the other the post-subscription active view? — raised 2026-09-06, pending user answer
- Exact hex values for Banani's `navy`/`background`/`primary`/`muted-foreground` tokens (theme panel export) — proposed PRD-palette mapping above needs confirmation — raised 2026-09-06, pending user answer
- Mobile nav has no Banani source — confirm we design it ourselves (bottom nav per PRD §6) — raised 2026-09-06, pending user answer
