# Banani implementation status

Last updated: 2026-09-08 (full-app audit — 2 dead links fixed on the landing page, notification bell built to close a fully-built-but-unused backend gap; see delta below)

Source flow: **"Design System NAWIRA"** — Banani flow id `acguXQuGeGbU` (https://app.banani.co/flow/acguXQuGeGbU)
Full fetch saved: 15 screens + 46 shared components, JSX/Tailwind, `screenSize: "desktop"`. Of the 15 fetched screens, 3 were duplicates of another screen and were dropped as unnecessary (user decision, 2026-09-06) — see "Duplicate screens dropped" below. 12 screens remain in scope. A later, separate fetch (2026-09-07) added 7 more screens the user created directly for the Projet Bébé flow: `ProjetBebe` (re-fetch), `ProjetBebeRessources`, `ProjetBebeCalendarV2`, `AddLHTest`, `ConceptionAdvice`, plus 2 duplicates (`ProjetBebe_next1`, `ProjetBebeDiscovery`) dropped per the same duplicate-screen policy.

## Done

- [x] `LandingPage` — `frontend/src/app/page.tsx` + `frontend/src/components/landing/*` — plan: this file (see delta notes below) — 2026-09-06
- [x] Signup (no Banani source) — `frontend/src/app/signup/page.tsx` — restyled from `examples/frontend-pages/signup.tsx` with NAWIRA branding — 2026-09-06
- [x] Login (no Banani source) — `frontend/src/app/login/page.tsx` — restyled from `examples/frontend-pages/login.tsx` — 2026-09-06
- [x] Verify-email (no Banani source) — `frontend/src/app/verify-email/page.tsx` — restyled from `examples/frontend-pages/verify-email.tsx` — 2026-09-06
- [x] Shared `/app/*` shell — `frontend/src/app/app/layout.tsx` (auth+profile gate), `frontend/src/components/app/AppSidebar.tsx`, `frontend/src/components/app/AppTopBar.tsx` — plan: `.planning/banani/app-shell.md` — 2026-09-07
- [x] `DashboardAujourdhui` — **rebuilt against its real Banani source** (added `MoodSelector`, `PredictionCards` [3 real predictions], `DailyTip`, `ProjetBebeCard`, fertile-aware `CycleRing` segment) — `frontend/src/app/app/today/page.tsx` — plan: this file (see delta below) — 2026-09-07
- [x] `Calendar` — **rebuilt against its real Banani source** (added fertile/ovulation day-types + legend entries, today-tap → `/app/log`) — `frontend/src/app/app/calendar/page.tsx` — plan: this file (see delta below) — 2026-09-07
- [x] `Profile` — `frontend/src/app/app/profile/page.tsx` — plan: `.planning/banani/profile.md` — 2026-09-07
- [x] `Settings` — `frontend/src/app/app/settings/page.tsx` (izikit's generic `/settings` untouched) — plan: `.planning/banani/settings.md` — 2026-09-07
- [x] `Logout` (modal, not a route) — `frontend/src/components/app/LogoutModal.tsx` + `LogoutButton.tsx`, wired into `AppSidebar` and `/app/profile`'s mobile account block — plan: `.planning/banani/logout-modal.md` — 2026-09-07
- [x] `HelpCenter` — `frontend/src/app/app/help/page.tsx` — plan: `.planning/banani/help-center.md` — 2026-09-07
- [x] `CycleDetailFull` — **replaced** by `frontend/src/app/app/cycles/page.tsx` ("Historique des cycles") — plan: `.planning/banani/cycles-history.md` — 2026-09-07
- [x] `AddData` — **rebuilt against its real Banani source** `AddDataPage.jsx` (superseding the earlier no-source version) — `frontend/src/app/app/log/page.tsx` + `frontend/src/components/log/*` — plan: `.planning/banani/add-data.md` — 2026-09-07
- [x] `ProjetBebe` — **rebuilt against its real Banani source, then expanded into 5 real routes** after the user pasted a screenshot of the real desktop screen (proving the prior no-source build had drifted) and then created 6 new Banani screens for the surrounding flow — `frontend/src/app/app/baby/{page.tsx,calendar,resources,tips,add-lh-test}` + `frontend/src/components/baby/*` — plan: `.planning/banani/projet-bebe.md` — 2026-09-07
- [x] `/app/insights`, `/app/assistant` — honest "Bientôt disponible" placeholders (no Banani source; unbuilt future epics E6/E8) — `frontend/src/components/app/ComingSoonPage.tsx` + 2 thin page wrappers — 2026-09-07
- [x] `Subscription` — **built against its real Banani source, with real PRD pricing/plans replacing Banani's fictional Euro pricing** — `frontend/src/app/app/billing/page.tsx` (replaces the `ComingSoonPage` placeholder) + `frontend/src/components/billing/*` — plan: `.planning/banani/subscription.md` — 2026-09-08
- [x] `Assistant` — **built against the real Phase 7 chat API**, replacing the `ComingSoonPage` placeholder — `frontend/src/app/app/assistant/page.tsx` + `frontend/src/components/assistant/{MessageBubble,ChatPanel,TopicsPanel}.tsx` + `frontend/src/lib/assistant-chat.ts` — plan: `.planning/banani/assistant.md` — commit `6d9d432` — 2026-09-09
- [x] `Analytics` — **built against the real Phase 6 insights API, with real data throughout** (no fabricated numbers) — replaced the `ComingSoonPage` placeholder, extended the backend with a new `MOOD_DISTRIBUTION` insight type — `frontend/src/app/app/insights/page.tsx` + `frontend/src/components/insights/{CycleScoreCard,SymptomStatistics,MoodDistributionChart,CycleComparisonCard,AnalyticsRecommendations}.tsx` + `frontend/src/lib/server/insights/compute-insights.ts` — plan: `.planning/banani/insights.md` — commit `fbeaed8` — 2026-09-09

New shared primitives: `frontend/src/components/ui/Button.tsx`, `frontend/src/components/ui/Field.tsx`, `frontend/src/components/auth/AuthCard.tsx`. Design tokens added to `frontend/src/app/globals.css` (`@theme` block — primary/navy confirmed exact match with PRD §0; rose/green/amber/purple are Banani's actual accent hexes, renamed to avoid colliding with Tailwind's built-in default palette names of the same words).

### Delta vs Banani source (decided with user before implementation)

- Fake social-proof stats ("50 000+ femmes", "4,8/5", "95%", fabricated testimonial from "Fatou") — **removed entirely**, replaced with 3 honest trust points + a transparent "nouveau produit" note.
- Hero/Social-proof photos — Banani used AI-generated `<Image prompt="...">` placeholders (no such component exists in Next.js). Replaced with a real, verified, freely-usable Unsplash photo (`photo-1531123897727-8f129e1688ce`) matching the PRD's imagery brief (confident, contemporary African woman). Needs replacing with real brand photography before public launch.
- "Voir la démonstration" button — removed (no demo exists yet).
- Hero's absolutely-positioned italic handwritten callout ("Une femme informée...") — dropped for this pass (desktop-only positioning, not mobile-first compatible as authored; can be re-added with a responsive treatment later).
- Features section's fake app-mockup preview (mobile+desktop dashboard screenshot mockup) — dropped for this pass (large chunk, `/app/today` doesn't exist yet to screenshot for real). **Re-added 2026-09-10** now that the real dashboard exists — see delta note below.
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

### Delta vs Banani source — `DashboardAujourdhui` / `Calendar` reconciliation pass (2026-09-07)

User flagged that this screen (and others) diverged from Banani/PRD; re-fetched the real sources (previously stuck on a stale editor selection) and reconciled — approved scope (AskUserQuestion, 2026-09-07): "Oui, vas-y avec ce périmètre".

- `CycleRing` — kept the single neutral progress arc (still not Banani's fixed 4-phase/28-day ring, which hardcodes generic day ranges 1–5/6–13/14–16/17–28 that PRD §8.1 explicitly forbids — "ne jamais généraliser « jour 14 »"). **Added** a green fertile-window arc segment computed from the user's own real `fertileWindowStart`/`fertileWindowEnd` (Phase 5 data), positioned via real day-offsets from the current cycle's start — never a fixed range.
- `PredictionCards` — **restored**, now showing all 3 real predictions (Prochaines règles / Ovulation estimée / Fenêtre fertile with "En cours" badge), replacing the single-card `PredictionCard.tsx` (deleted). All values are real (Phase 5 API), "≈" framing preserved.
- `MoodSelector` — **added**, a quick mood-log widget wired to `PUT /api/daily-logs/today` with a fetch-then-merge pattern (the endpoint is full-replace; merging avoids clobbering the day's other fields).
- `DailyTip` — **added**, a day-of-year-indexed rotating tip from a fixed set of 7 general, non-diagnostic wellness tips (not Banani's single hardcoded tip, and not a fake "personalized" tip).
- `ProjetBebeCard` — **added**, a real promo card linking to `/app/baby`.
- `TrendsChart`, `KeyDataCards` — **still dropped**, this time by explicit user confirmation: both overlap the deferred Analytics/Insights epic (cycle averages, top symptom, "meilleure phase") and would either fabricate data or duplicate that future epic's scope.
- Hero gradient — updated to Banani's exact `linear-gradient(135deg, #F8F5FD 0%, #FDF5F9 100%)` (previously a generic `primary-soft`→`rose-soft` Tailwind gradient).
- `calendar-day-types.ts` — extended with `fertile`/`ovulation` day types (real data from Phase 5's `fertileWindowStart`/`fertileWindowEnd`/`ovulationEstimate`), consumed by both `/app/today`'s `MiniCalendar` and `/app/calendar`. Precedence: today > observed > predicted > ovulation > fertile.
- `/app/calendar` — legend moved above the grid (was below) to match Banani; legend extended with Fenêtre fertile/Ovulation estimée. **Tap-to-journal added for today's cell only** (PRD §6.2 CAL01 wants "tap sur une date → journal du jour" for any date, but `/api/daily-logs/today` is today-only — making past/future cells look tappable when they do nothing would be a fake affordance, so only today's cell navigates to `/app/log`). Dropped Banani's "Exporter"/"Partager" buttons (no backend).

### Delta vs Banani source — `Profile` / `Settings` / `Logout` / `HelpCenter` / `CycleDetailFull` (2026-09-07)

- **Profile**: read-only this pass (no edit forms/PATCH endpoints — confirmed with user). Dropped "Nom complet"/"Pays" (no such fields exist), the fictional `UserAvatar`, the in-page Informations/Paramètres tabs (now two real routes), and "Régularité du cycle" (no defined business logic for a standalone label outside the prediction-confidence tiers). "Objectifs" shows the single real `goal` chip, not Banani's multiple fictional ones. New backend: `GET /api/profile` (profile fields + 3 real header stats — `monthsActive`, `daysTracked` as a `PeriodEvent`-count proxy until `DailyLog` ships in E4, `cyclesCompleted`).
- **Settings**: trimmed hard (confirmed with user) — kept only what has real backend: password change/set + Google link (re-skinned from the existing generic `/settings` page, not rewritten) and a new notifications section (`PATCH /api/profile`, reusing the onboarding `OptionCard` pattern). Dropped entirely: 2FA, active-sessions list, data-sharing/analytics-visibility/encrypted-storage toggles, language switcher, timezone, data export, account deletion — none have backend, and each is a real feature to design later, not a UI trim.
- **Logout**: real gap closed — `AppSidebar`'s "Déconnexion" previously called `logout()` directly with zero confirmation. Now opens `LogoutModal` via a shared `LogoutButton` wrapper (also reused by `/app/profile`'s mobile-only account block, since mobile has no sidebar to reach Settings/Help/Logout from otherwise).
- **HelpCenter**: dropped Banani's fabricated read-counts ("1 245 lectures"), the fake `Assistant`/chat backend, the unverified "Réseaux sociaux" account, and the dead-link "Ressources utiles" block (glossary/PDF guide/community, all `href="#"`). Real content instead: an FAQ accordion with genuine, cautious, non-diagnostic short answers (see `help-center.md` for the full copy), a real client-side search filter, a real `mailto:support@nawira.app` link, and the medical-disclaimer info box. Dropped the "Fertilité & Conception" category entirely — no such feature exists yet (E5).
- **CycleDetailFull → "Historique des cycles" (`/app/cycles`)**: not a translation of the source. `CycleDetailView` (the screen's entire differentiating content) is built around the 4 cycle phases and the fertile window — content already out of scope (E5). Confirmed with the user: replaced with a genuinely useful in-scope screen — a real cycle history list (dates, length, outlier flag) + a "why this estimate" card built from real facts, not Banani's fabricated ones. Reuses `GET /api/cycles` + `GET /api/predictions/current` (zero new backend). Linked from `PredictionCard` (`/app/today`) and the Calendar page's info note.

### Verified — `Profile` / `Settings` / `Logout` / `HelpCenter` / `CycleDetailFull` (2026-09-07)

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (652/652, incl. 2 new `GET /api/profile` tests), and `pnpm build` all green. All 4 new routes (`/app/profile`, `/app/settings`, `/app/help`, `/app/cycles`) resolve correctly; the generic `/settings` page is untouched.
- Rendered check via a real logged-in session at 375px / 768px / 1280px on all 4 new screens plus the already-shipped `/app/today` and `/app/calendar`: no horizontal overflow at any of the 18 checks, no overlapping elements.
- Logout modal specifically verified by clicking through it in a real browser at both 1280px (sidebar trigger) and 375px (Profile page's mobile trigger) — overlay, centered card, and both buttons render correctly at both sizes.

### Delta vs Banani source — `AddData` (`/app/log`, 2026-09-07)

- **No Banani source available.** The flow's selection stayed on `DashboardAujourdhui`
  (already shipped) across two fetch attempts; the user confirmed building
  this screen directly from the already-approved design spec
  (`docs/superpowers/specs/2026-09-07-phase4-daily-journal-design.md`
  §4) instead of waiting further — same precedent as Signup/Login/
  Verify-email, which also shipped without a Banani source.
- **Flow selector always defaults to "Aucun" on load.** There is no
  endpoint exposing today's actual `PeriodEvent.flow` value (the spec's
  own Flow Integration section is explicit: "no new endpoint" for this
  purpose) — only `GET /api/cycles`'s `todayLogged` boolean, reused
  as-is. When `todayLogged` is true, an inline note tells the user a
  flow is already logged and re-selecting a value corrects it. This is
  a direct, spec-mandated limitation, not an implementation shortcut.
- New shared primitive: `frontend/src/components/ui/ChipGroup.tsx` —
  generic single/multi toggle chip row, reused across 6 sections (flow,
  mood, energy, sleep quality, symptoms) — single- vs. multi-select is
  decided entirely by the caller's state-update logic, not a prop.
- `frontend/src/components/log/DailyLogForm.tsx` holds all 6 form
  sections + submit; `frontend/src/app/app/log/page.tsx` only handles
  fetch/loading/error/toast orchestration — same split as
  `/app/today`'s page + component composition.
- Submit fires two independent calls exactly as the spec specifies:
  always `PUT /api/daily-logs/today`, plus `POST /api/period-events`
  only when a flow other than "Aucun" is selected — the already-
  reviewed `period-events` transaction stays completely untouched.
- Mood/energy French chip labels (Très bien/Bien/Fatiguée/Stressée/
  Humeur basse) reuse the wording verified correct in the earlier
  `DashboardAujourdhui` Banani fetch's (unused) `MoodSelector.jsx` —
  copy only, no structure or component reused from that screen.

### Verified — `AddData` (2026-09-07)

- `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (665/665),
  and `pnpm build` all green. `/app/log` resolves correctly in the
  build's route list.
- Real browser check (system Chrome via Playwright, real logged-in
  session against the live dev server) at 375px / 768px / 1280px: no
  horizontal overflow at any width (`scrollWidth === clientWidth`),
  desktop sidebar / mobile bottom nav both render correctly, all 7
  sections and the submit button lay out cleanly single-column at every
  size.
- Full save round-trip driven for real: selected a mood chip + a
  symptom chip + wrote a note, clicked "Enregistrer" — `PUT
  /api/daily-logs/today` returned 200, the success toast appeared, and
  reloading the page correctly pre-filled the same mood/symptom/note
  from `GET /api/daily-logs/today`, confirming the edit-not-recreate
  today-only contract works end-to-end.

## In progress

_(none)_

## Pending — screens (ordered by recommended implementation phase)

**Stale rows pruned 2026-09-07**: `LandingPage`, `ProjetBebe` removed from this table — both already in Done above (this table wasn't kept in sync when they shipped; `AddData`/`DashboardAujourdhui`/`Calendar` were never added here either, same gap). **Pruned again 2026-09-08**: `Subscription` (shipped, see Done above) and `FertilityCalendar` (superseded by `/app/baby/calendar`, shipped as part of the ProjetBebe 5-route expansion) removed.

_(none — every Banani-sourced screen has shipped; see Done above)_

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

### Delta vs Banani source — `ProjetBebe` (2026-09-07)

- No Banani source available (3 fetch attempts this session all returned the stale `DashboardAujourdhui` selection). Built from the approved Phase 5 spec (`docs/superpowers/specs/2026-09-07-phase5-fertility-window-design.md` §6) + shipped backend + existing screen conventions — see `.planning/banani/projet-bebe.md`.
- `FertilityWindowCard` renders the fertile window as a **range**, ovulation framed as an estimate inside it — never a single certain date (PRD §8.1).
- `TodaySignalsCard` (the `LHTestTracker` composition, broadened to all 3 signal types) is the one entry point for basal-temperature/cervical-mucus/LH-test signals right now — it fills a real gap, since the shipped `GET`/`PUT /api/fertility-signals/today` backend had zero UI. The Phase 5 spec's "extend `/app/log`" decision is about the eventual long-term placement of this UI and is still deferred/unbuilt; this doesn't change that decision, it just avoids shipping a backend with no way to use it.
- `ConceptionTipsCard` content is fresh, cautious, non-diagnostic copy (no Banani copy used at all this pass) — same discipline as `HelpCenter`'s FAQ content, with the same medical disclaimer framing.
- `ConceptionStatistics` → `ConceptionStatsCard`: derived read-only stats (cycle day, fertile-window countdown) computed client-side from already-fetched `/api/cycles` + `/api/predictions/current` data — no new backend.
- No subscription/tier gate (nothing is gated anywhere yet, matches spec §1).

### Verified — `ProjetBebe`

- `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test` (683/683) all green.
- Real browser check at 375/768/1280px — no horizontal scroll, no overlap, empty-state (no prediction yet) renders correctly.
- Real save round-trip against the live dev server: filled temperature + cervical mucus + LH test → saved → reloaded → all 3 values persisted correctly, then cleared back out.
- Caught and fixed a real bug during verification: the running dev server's Prisma Client predated this session's `fertility_signal_unique_type` migration (stale generated client, missing the `userId_date_type` compound key), causing `PUT /api/fertility-signals/today` to 500. Fixed by regenerating the client (`prisma generate`) and restarting the dev server — no application code was at fault.

### Delta vs Banani source — `ProjetBebe` expanded to 5 routes (2026-09-07)

The user pasted a screenshot of the real desktop `ProjetBebe` screen, proving the earlier no-source
build (above) had drifted from the actual design. Re-fetched via MCP — this time the selection
correctly returned `ProjetBebe.jsx` plus 6 more screens the user had newly created in Banani for the
surrounding flow: `ProjetBebeRessources.jsx`, `ProjetBebeCalendarV2.jsx`, `AddLHTest.jsx`,
`ConceptionAdvice.jsx`, `ProjetBebe_next1.jsx` (duplicate of `ProjetBebe`), `ProjetBebeDiscovery.jsx`
(duplicate, already dropped above). Each real screen has its own breadcrumb/URL (`Projet Bébé / X`),
so this became 5 real routes instead of one page with in-page tabs.

- **`/app/baby` (Aperçu)** — rebuilt against the real source: 3-box `FertilityWindowCard` (range +
  ovulation estimate + confidence label), `LHTestTracker`, `ConceptionStatsCard`
  ("Ton parcours de conception"), plus a new `OtherSignalsCard` (temperature + cervical mucus —
  **addition beyond Banani**, flagged: Banani's source has no UI anywhere for these two signal
  types, but the existing backend/UI was their only entry point, so removing it without a
  replacement would have been a functionality regression).
- **Confidence score**: Banani's mockup shows a fabricated `74/100` next to the confidence label.
  The backend (`src/lib/server/cycles/prediction.ts`) only ever produces a `LOW/MEDIUM/HIGH`
  bucket from cycle-variance — no numeric score exists anywhere. **Confirmed with user via
  AskUserQuestion**: kept the label only, no invented number.
- **`/app/baby/calendar`** (new route, `FertilityCalendarV2` source) — real month grids (current +
  next month) via the existing `MonthGrid`/`buildDayTypes`, real `FertilityCalendarLegend` (trimmed
  to the day types the grid actually renders: Règles/Fenêtre fertile/Ovulation estimée/Prochaines
  règles/Aujourd'hui — dropped Banani's fake "Phase lutéale"/"Phase folliculaire" legend colors,
  since no per-day phase classification is computed beyond the fertile window, and PRD §8.1 bans
  generalizing cycle-day phases; also dropped Banani's decorative "Symboles" row — 🩸/🌡️/💬/🟢 icons
  that don't correspond to anything actually rendered on a day cell). Dropped "Exporter le
  calendrier"/"Partager avec médecin" buttons (no backend), matching `/app/calendar`'s existing
  precedent.
- **`/app/baby/resources`** (new route, `ProjetBebeRessources` source) — real cautious article
  content (`conception-articles.ts`), client-side search + category filter (real, not decorative),
  real FAQ. Dropped Banani's fabricated named-expert quote ("Dr. Aminata Diallo, gynécologue") and
  its "Approuvé par des gynécologues" claim — same discipline as the earlier fake-testimonial
  removal on the landing page; replaced with an honest "Bon à savoir: ressource de sensibilisation,
  pas un avis médical" note. "NAWIRA Plus" CTA → real `<Link href="/app/billing">`.
- **`/app/baby/tips`** (new route, `ConceptionAdvice` source) — 6 real cautious tips
  (`conception-tips-full.ts`), each softened from Banani's more assertive claims into hedged,
  non-diagnostic phrasing ("peut affecter" not "affecte", "est couramment recommandé" not a bare
  instruction). Dropped the same "approuvé par" style claim. Premium CTA → `/app/billing` link.
- **`/app/baby/add-lh-test`** (new route, `AddLHTest` source) — real form wired to the existing
  `GET`/`PUT /api/fertility-signals/today` (fetch-merge-PUT pattern, preserving
  temperature/mucus). Banani's 3 result options were remapped to the real 4-value enum
  (`NEGATIVE | POSITIVE | PEAK | INCONCLUSIVE`): Banani's "Positif" → `PEAK` (its own description,
  "pic de LH détecté", is literally what `PEAK` means), "Faible" → `POSITIVE`, "Négatif" →
  `NEGATIVE`; added a 4th real option, "Non concluant" → `INCONCLUSIVE`, not shown in Banani's mock
  but a real enum value that needs to be reachable somewhere. Sidebar context ("Ton cycle
  aujourd'hui") uses real cycle-day and fertile-window-status data; dropped Banani's fabricated
  "Pic d'estradiol: Hier" line (no such signal is tracked, no scientific claim we can back) and its
  generic "Phase actuelle: Ovulation" label (same phase-generalization concern as the calendar
  legend). **Dropped "Heure du test" and "Marque du test" fields** — `FertilitySignal` has no
  columns for either and the PRD doesn't call for them; building selectable-but-unsaved fields
  would be a fake affordance. "Notes personnelles" dropped for the same reason (no `note` column on
  `FertilitySignal`).
- **Premium CTA** on `/app/baby` ("Déverrouille Projet Bébé complet / Essayer gratuitement") — no
  `Subscription` model exists in Prisma (confirmed against `/app/billing`'s own "Bientôt
  disponible" placeholder). **Confirmed with user via AskUserQuestion**: kept as a real,
  functioning `<Link href="/app/billing">` rather than a dead button or a dropped section.
- New shared components: `ProjetBebeTabs.tsx` (the 3-way Aperçu/Calendrier/Ressources nav, reused
  on all 3 tab-bar pages), `ProjetBebeBreadcrumb.tsx` (the "Projet Bébé / X" breadcrumb, reused on
  the 2 drill-down pages that don't show the tab bar, matching their real Banani sources).

### Verified — `ProjetBebe` 5-route expansion (2026-09-07)

- `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test` (695/695), and `pnpm build` all green —
  all 4 new routes (`/app/baby/{calendar,resources,tips,add-lh-test}`) resolve correctly.
- Real browser check (logged-in session) at 375/768/1280px across all 5 routes: no horizontal
  overflow at any of the 15 checks. Caught and fixed one real layout bug during verification: the
  Ressources page's search input was being squeezed by the filter-pill row on the same line,
  truncating its placeholder text — fixed by stacking search above filters instead of sharing a row.
- Tab navigation (`ProjetBebeTabs`) driven end-to-end in a real browser: Aperçu → Calendrier →
  Ressources, each a real route change.
- Resources page's category filter driven for real (Alimentation filter → correct article subset).
- Full LH-test save round-trip driven end-to-end: selected "Pic positif" on `/app/baby/add-lh-test`
  → saved → redirected to `/app/baby` → `LHTestTracker` correctly shows "Aujourd'hui / Pic positif /
  L'ovulation arrive généralement 24 à 36 heures après un pic de LH." confirming the
  fetch-merge-PUT round-trip persisted correctly without clobbering the day's other signals.

### Delta vs Banani source — `Subscription` (`/app/billing`, 2026-09-08)

Fetched the real Banani source. Confirmed 2 scope decisions with the user via AskUserQuestion
before coding, since this screen is materially different from every other screen built so far — it
touches real pricing and (eventually) real money:

- **Real PRD pricing, not Banani's fictional Euro prices.** Banani shows "NAWIRA Plus 4,99€" /
  "NAWIRA Pro 9,99€" (a plan name — "Pro" — that doesn't exist in the PRD at all). Built against
  the PRD's actual business model (§3): Free (0), NAWIRA Plus (1 000 FCFA/mois), Projet Bébé
  (2 500 FCFA/mois) — matching `Profile.plan`'s real `FREE | PLUS | BABY` enum and §3.1's real
  entitlement matrix content for each plan's feature list.
- **Real page, payment CTAs disabled.** No `Subscription` model, no recurring-billing integration,
  no trial/webhook logic exists anywhere (Phase 7, confirmed unbuilt in two prior specs). Building
  the real payment flow is a multi-day epic with real money at stake, not a UI wire-up — out of
  scope for this pass. `PremiumPlansGrid`'s buttons are real but disabled, labeled "Bientôt
  disponible" (or "Plan actuel" for the user's real current plan) instead of linking to a purchase
  flow that doesn't exist.
- **`PaymentMethods` / `BillingHistory` — dropped entirely, not simplified.** Banani's mockups show
  a fake saved Visa card ("•••• 4242"), a fake billing address ("Aminata Sow, Dakar"), and fake
  invoice rows. Unlike every prior "no fake content" case this session, there is **zero backing
  data of any kind** here — no `PaymentMethod`/`Invoice`/`BillingAddress` model exists. Fabricating
  a card number or address for the logged-in user is financial/PII-shaped fabrication, a materially
  worse category than a fake tip or fake statistic — dropped outright.
- `CurrentPlanCard` — real `plan` from `GET /api/profile` (previously didn't expose `plan` at all;
  added it, 1-line change + updated test). Since nothing in the codebase ever sets `Profile.plan`
  away from its `FREE` default (confirmed via grep — no route writes it), every user is `FREE`
  today. Rather than list fake gated capabilities the user doesn't actually have, the card states
  plainly that all shipped features are unlocked for everyone during this launch phase, matching
  the wording the prior `ComingSoonPage` placeholder already used.
- FAQ — kept Banani's first two questions (reworded to not claim a live trial/purchase flow exists
  yet), replaced the third ("plan Pro") with the real second paid tier, "Projet Bébé".
- New files: `frontend/src/components/billing/{plans-data.ts,CurrentPlanCard.tsx,PremiumPlansGrid.tsx}`,
  `frontend/src/app/app/billing/page.tsx` (replaces the `ComingSoonPage` wrapper).

### Verified — `Subscription` (2026-09-08)

- `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm test` (695/695, incl. 1 updated `GET
  /api/profile` test asserting the new `plan` field), and `pnpm build` all green.
- Real browser check (logged-in session) at 375/768/1280px: no horizontal overflow at any width.
  Visually confirmed real pricing (Gratuit / 1 000 FCFA / 2 500 FCFA), correct "Plan actuel" badge
  on the Free card, disabled "Bientôt disponible" buttons on both paid tiers, and the honest
  launch-phase note rendering correctly.

### Delta vs Banani source — `Assistant` (`/app/assistant`, 2026-09-09)

- **No bounded-height chat pane.** Banani's mockup uses `height: calc(100vh - 280px)` with an
  internal `overflow-y-auto` message list. The `/app/*` shell (`frontend/src/app/app/layout.tsx`)
  has no bounded-height content area anywhere in this codebase — every existing page just lets the
  whole page scroll, and no sticky-footer precedent exists (the mobile bottom nav is `fixed`).
  Rebuilt as normal page-flow scrolling with a `scrollIntoView` sentinel instead of forcing a
  page-specific height hack that would conflict with `MobileBottomNav`.
- **SSE streaming, not a JSON fetch.** `POST /api/assistant/messages` returns `text/event-stream`;
  the shared `api<T>()` wrapper (`frontend/src/lib/api.ts`, PROTECTED) is JSON-only, so a dedicated
  `frontend/src/lib/assistant-chat.ts` reads the stream directly via `ReadableStream`, duplicating
  minimal CSRF-cookie-read logic rather than exporting a new symbol from `api.ts`.
- **Conversation history**: client-side `localStorage`, keyed per user id, capped at 50 messages —
  confirmed with user via AskUserQuestion (alternative was server-side-only, rejected since history
  persistence is already consent-gated server-side per `ASSISTANT_HISTORY`; localStorage gives a
  responsive reload even when consent is off, since the route is otherwise fully stateless).
- **`TopicsPanel`** split into two purpose-built exports (`TopicsChipRow` for the mobile horizontal
  scroll row, `TopicsSidebar` for the desktop vertical list) sharing one `TOPICS` data array with 8
  entries and original French example-question copy (not sourced from Banani, which had no example
  questions per topic).
- **Empty/loading/error states** (not in the Banani source): welcome message + 3 example questions
  on load, per-message streaming cursor, a persistent amber quota-exceeded banner that replaces the
  input entirely, an inline "assistant pas encore configuré" message (no toast) when
  `ANTHROPIC_API_KEY` is absent — matching this project's existing optional-provider pattern.
- Tested without `ANTHROPIC_API_KEY` set (confirmed with user via AskUserQuestion: build now, test
  the real key later) — the route's honest `503 AI_NOT_CONFIGURED` path is what's verified below;
  real model output is not yet verified in this environment.

### Verified — `Assistant` (2026-09-09)

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (770/770 — one pre-existing, unrelated flaky timing
  test in `signup/route.test.ts` failed once under full-suite load and passed clean in isolation),
  and `pnpm build` all green. `/app/assistant` resolves correctly in the build's route list.
- Real browser check (system Chrome via Playwright, real logged-in seeded session against the live
  dev server) at 375px / 768px / 1280px: no horizontal scroll, no overlapping elements, correct
  layout transition between the mobile topic-chip row and the desktop sidebar.
- Golden-path send flow driven end-to-end: message submitted, correct honest `503
  AI_NOT_CONFIGURED` French inline message rendered (no toast, as designed).
- Topic-chip click confirmed to pre-fill the chat input with the matching question.
- `localStorage` persistence confirmed across a full page reload (prior conversation, including the
  error bubble, reappeared after navigating away and back).
- Quota-exceeded state driven for real (repeated sends against the seeded test user): amber banner
  ("Tu as atteint ta limite de 10 messages aujourd'hui. Reviens demain !") cleanly replaces the
  input area with no layout break.
- Caught and fixed one real environmental bug during verification, not an application defect: the
  long-running dev server had a stale pre-migration Prisma Client cached in its module cache
  (`prisma.assistantConversation` undefined), causing a raw 500 instead of the intended clean 503.
  Diagnosed via `frontend/.next/dev/logs/next-development.log`; fixed by restarting the dev server
  process.

### Delta vs Banani source — `Analytics` (`/app/insights`, 2026-09-09)

Confirmed 4 real-data-mapping decisions with the user via AskUserQuestion before coding — this
screen had the largest mock/real-data gap of anything built so far. Full rationale and exact
formulas: `.planning/banani/insights.md`.

- **CycleScoreCard**: real headline score (`CYCLE_SCORE_TREND.current`, falling back to
  `cycleScoreToday`, falling back to an honest "pas encore assez de données" placeholder — never
  a fabricated number). 3 dimension bars remapped to real signals: Régularité ←
  `CYCLE_VARIABILITY`, Prévisibilité ← `prediction.confidence` (existing `/api/predictions/
  current` endpoint), Complétude des données ← a `dailyLogsAnalyzed`-count heuristic, explicitly
  labeled as a proxy. Each dimension gates independently (partial data still renders). "Points
  clés" bullets are now conditionally generated from real `CYCLE_VARIABILITY`/`meta` state
  instead of Banani's 3 hardcoded ones. "Voir le rapport détaillé" button dropped — no detail
  page exists.
- **MoodDistributionChart**: backend extended — new `MOOD_DISTRIBUTION` insight type added to
  `compute-insights.ts` (gated on ≥5 daily logs with a mood set). The real `DailyLog.mood` enum
  matches Banani's 5 mock rows exactly (same labels, same order), so this shipped as a genuine
  1:1 real-data mapping, not an approximation.
- **SymptomStatistics**: redesigned as phase chips (Règles/Phase folliculaire/Ovulation/Phase
  lutéale, reusing this project's existing phase-label convention from `CycleContextCard.tsx`)
  since the real `TOP_SYMPTOMS` insight is phase-bucketed, not a flat list like Banani's mock.
  Defaults to the most-logged phase. Trend arrows (up/down/stable) dropped — no real trend metric
  exists anywhere in this insight.
- **CycleComparisonCard**: Banani's 3 hardcoded calendar-month rows → 2 real cards ("Cycle
  actuel"/"Cycle précédent"), forced by the real `CYCLE_COMPARISON` shape (current/previous, no
  calendar-month concept, no fertile-day-count field). "Voir tous les cycles" wired to the real,
  already-shipped `/app/cycles` screen.
- **AnalyticsRecommendations**: rule-based tips derived from real insight data (cycle
  regularity, top symptom + phase, mood distribution), capped at 3, falling back to 2 generic
  non-personalized tips when not eligible. Dead "→" links dropped (none of Banani's 3 targets —
  "Voir les détails"/"Conseils santé"/"Guide de bien-être" — existed as real pages).
- **Filter tabs** ("6 derniers mois"/"Dernière année"/"Tout le temps") — dropped entirely, no
  fake affordance; `/api/insights` has no date-range parameter.
- Premium CTA → real `<Link href="/app/billing">`, same pattern as every prior screen.
- Grid breakpoint uses `lg:grid-cols-2` (1024px), matching this project's existing convention
  (`/app/baby`, not the `md:` breakpoint originally drafted in the plan file).
- **This was the last screen in the original 15-screen Banani fetch — the full UI pass is now
  complete.**

### Verified — `Analytics` (2026-09-09)

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (771/772, incl. 2 new `MOOD_DISTRIBUTION` tests —
  the 1 failure is the same pre-existing unrelated flaky timing test in `signup/route.test.ts`
  seen during the Assistant pass, passed clean in isolation), and `pnpm build` all green.
  `/app/insights` resolves correctly in the build's route list.
- Real browser check (system Chrome via Playwright) against seeded real data (36 `DailyLog` +
  `SymptomLog` rows across 3 completed + 1 open cycle for `user@example.com`) at 375/768/1280px:
  no horizontal overflow at any width, no overlap.
- Both eligibility states verified live: the fully-eligible state (all 6 real insight types
  populated, real Cycle Score/symptom/mood/comparison/recommendation data) and the
  not-yet-eligible empty state (fresh seeded user, real CTA link to `/app/log`).
- Phase-chip interaction driven end-to-end: clicking "Règles" vs "Phase folliculaire" correctly
  swaps to that phase's real top symptoms (verified exact percentage/count changes, e.g. Crampes
  100%/5 jours in Règles vs 20%/2 jours in Phase folliculaire).

### Delta vs Banani source — `LandingFeatures` app-mockup re-added (2026-09-10)

Re-fetched `LandingPage` on user request to check for drift — confirmed the Banani source is
byte-identical to the 2026-09-06 fetch, and the shipped implementation still faithfully reflects
every already-documented delta (fake stats/testimonial removed, footer trimmed, real Unsplash
photo, etc. — no drift found). User then asked to reopen the one candidate item explicitly left
for later: the Features section's app-mockup preview, dropped originally because `/app/today`
didn't exist yet to reference.

- New `frontend/src/components/landing/LandingAppMockup.tsx` — an **illustrative** preview (not a
  live screenshot, to avoid staleness and real-user-data exposure), but every label/color/nav
  item is now drawn verbatim from the real shipped components instead of Banani's originally
  fabricated copy: sidebar items from `AppSidebar.tsx`'s real `navItems`, the 3 prediction card
  labels/colors from `PredictionCards.tsx` (Fenêtre fertile/green, Prochaines règles/rose,
  Ovulation estimée/amber), the mood question + exact 5 emoji from `MoodSelector.tsx`, and the
  "Jour N / sur ~L jours" ring copy from `CycleRing.tsx`.
- Rebuilt mobile-first (Banani's original mockup was a non-wrapping desktop-only `flex` row that
  would have overflowed badly at 375px): single mobile-phone card at base, sidebar hidden below
  `sm`, both mockups shown side-by-side only at `lg`+.
- Wired into `LandingFeatures.tsx` right after the feature grid, matching Banani's original
  composition order.

### Verified (2026-09-10)

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (782/782 — the previously-flaky
  `signup/route.test.ts` timing test held up clean this run), and `pnpm build` all green.
- Real browser check at 375/768/1280px: no horizontal overflow at any width: the desktop-style
  mockup's 3-column prediction grid and sidebar collapse correctly on mobile, both cards stack
  cleanly below the feature grid.

### Full-app audit (2026-09-08) — dead links + notification bell gap

Full audit of responsive integration, data wiring, and backend connectivity across every shipped
page. Cross-referenced every `api()` call against the 52 real API route files and every `href`/
button pattern via grep before any live browser testing.

**Bugs found + fixed:**
- `frontend/src/components/landing/LandingNav.tsx` — logo and "Accueil" nav link both pointed to
  `href="#"` (dead link) instead of `/`. Fixed.
- `frontend/src/components/landing/LandingFooter.tsx` — footer links were plain strings with no
  real `href`s at all. Wired real anchors (`#fonctionnalites`, `#pourquoi`, `#avis`, `/app/help`);
  dropped "Confidentialité"/"Conditions d'utilisation" entirely since no such pages exist (no fake
  links to nowhere).
- **Notification bell — backend fully built (`GET/PATCH /api/notifications`, `GET
  /api/notifications/count`, `createNotification` dispatcher, `WELCOME` template), zero UI ever
  consumed it.** `AppTopBar.tsx` rendered a static, non-interactive bell icon. Built
  `frontend/src/components/app/NotificationBell.tsx` (dropdown, unread badge, mark-one/mark-all,
  outside-click + Escape to close) and `frontend/src/lib/time-ago.ts` (relative timestamps);
  wired into `AppTopBar.tsx`, now visible on mobile too (previously desktop-only decoration).
  Also localized `welcomeNotification()` in
  `frontend/src/lib/server/notifications/templates.ts` — it was the only English-language string
  left in the app.

**Verified:** `pnpm typecheck && pnpm lint && pnpm format && pnpm test` (695/695) `&& pnpm build`
all green. Real browser check confirmed: badge count accurate, dropdown lists real seeded
notifications, clicking an unread item marks it read and decrements the badge, "Tout marquer
comme lu" zeroes it, read state persists across reload, dropdown closes on outside click, no
horizontal overflow at 375px. (Two initial verification passes were muddied by dev-server/
Turbopack first-hit compile lag on the PATCH route — up to ~7s on the very first mutating call in
a fresh dev-server session — not an application bug; confirmed by tracing request/response timing
directly.)
