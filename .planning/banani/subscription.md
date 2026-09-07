# Subscription (Abonnement) — Banani → Next.js

## Source
- Banani screen ID: `acguXQuGeGbU/screens/Subscription.jsx` ("NAWIRA — Abonnement")
- Fetched: 2026-09-08
- Shared components: `CurrentPlanCard.jsx`, `PremiumPlansGrid.jsx`, `PaymentMethods.jsx`,
  `BillingHistory.jsx`, `NawiraSidebar.jsx`, `TopBar.jsx` (both already built).

## Scope decisions (confirmed with user via AskUserQuestion before coding)

1. **Real PRD pricing, not Banani's fictional Euro prices.** Banani shows "NAWIRA Plus 4,99€" /
   "NAWIRA Pro 9,99€". The PRD (§3) defines the actual business model: Free (0), NAWIRA Plus
   (1 000 FCFA/mois), Projet Bébé (2 500 FCFA/mois) — matching `Profile.plan`'s real
   `FREE | PLUS | BABY` enum. Built against the PRD numbers.
2. **Real page, payment CTAs disabled.** No `Subscription` model, no recurring-billing
   integration, no trial/webhook logic exists (Phase 7, unbuilt — confirmed in
   `docs/superpowers/specs/2026-09-07-phase5-fertility-window-design.md` and
   `2026-09-06-phase1-data-model-design.md`). Building the real payment flow is a multi-day epic
   with real money at stake — out of scope for this pass. The page shows real plan data and a real
   current-plan state, but every "Essayer"/"Passer à" button is disabled with a "Bientôt
   disponible" label instead of linking to a purchase flow that doesn't exist.

## Structure map

- Header — unchanged from Banani (💳 Abonnement + subtitle).
- **`CurrentPlanCard`** — shows the user's real `Profile.plan` (via `GET /api/profile`, which
  didn't previously expose `plan` — added it). Since `plan` is never set anywhere in the codebase
  today (confirmed: no route writes it), every user is currently `FREE`. Rather than list fake
  gated capabilities, the card is explicit: this is a launch-phase note that all built features are
  unlocked for everyone regardless of plan, because entitlement enforcement doesn't exist yet —
  matches the existing `/app/billing` placeholder's own honest copy.
- **`PremiumPlansGrid`** — real 3-tier comparison (Free/Plus/Projet Bébé) using the PRD §3 pricing
  and §3.1 entitlement matrix content, framed as the target model ("à venir"), not as functionality
  available today. CTA buttons disabled, labeled "Bientôt disponible".
- **`PaymentMethods` / `BillingHistory` — DROPPED ENTIRELY.** Banani's mockups show a fake saved
  Visa card ("•••• 4242"), a fake billing address ("Aminata Sow, Dakar"), and fake invoice rows
  ("Plan NAWIRA Plus — Gratuit — Actif"). Unlike prior "no fake content" cases where a real backend
  existed and only the mockup's descriptive copy was fictional, here there is **zero backing data
  of any kind** — no `PaymentMethod`/`Invoice`/`BillingAddress` model. Displaying a fake card number
  or fake address for the logged-in user is a materially worse kind of fabrication (financial/PII
  data), not a stylistic simplification — dropped, not simplified.
- FAQ — kept, but reworded: dropped the "Pro" plan reference (doesn't exist; the real 2nd paid tier
  is "Projet Bébé") and softened the trial/plan-change answers to not claim a live purchase flow.

## Component breakdown

- **NEW** `src/components/billing/CurrentPlanCard.tsx` — real `plan` prop, honest launch-phase copy.
- **NEW** `src/components/billing/plans-data.ts` — the 3 real PRD plan definitions (name, price
  in FCFA, promise, features from §3.1).
- **NEW** `src/components/billing/PremiumPlansGrid.tsx` — renders `plans-data.ts`, disabled CTAs.
- **REWRITE** `src/app/app/billing/page.tsx` — replaces the `ComingSoonPage` placeholder.

## Token mapping

Reuses existing project tokens (`primary`/`primary-soft`, `green`/`green-soft`, `rose`/`rose-soft`,
`amber`/`amber-soft`) — no new tokens needed.

## Responsive plan

- **Base (375px)**: single column throughout, plans grid stacks to 1 column.
- **lg (1024px+)**: plans grid becomes 3 columns (Free/Plus/Baby) matching Banani's spirit (Banani
  only showed 2 paid plans since it omitted Free from the grid — this version shows all 3 for a
  complete real comparison, since Free is a real selectable state too).

## Implementation checklist
- [x] `GET /api/profile` now returns `plan`
- [ ] `CurrentPlanCard` + honest launch-phase note
- [ ] `plans-data.ts` + `PremiumPlansGrid` (real pricing, disabled CTAs)
- [ ] `/app/billing/page.tsx` rewrite
- [ ] FAQ reworded (no fake "Pro" plan, no live-trial claim)
- [ ] 375/768/1280px check
- [ ] pnpm typecheck/lint/test/build
