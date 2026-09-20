# Mobile audit — independent verification

Method: Playwright (Chrome, isMobile, DPR 2) against `next dev` :3111, 47 page routes x 3 viewports (360x740, 375x812, 390x844) x 3 passes (populated mocks / HTTP 500 errors / empty lists) = 423 page loads. Catch-all `/api/**` mock, `/api/auth/me` faked (USER; SUPERADMIN for /admin). Script: scratchpad `sweep.mjs`, raw data `sweep-{full,error,empty}.json`, screenshots (375) `screenshots/`.

## 1. Matrix (summary)

| Check | Result across all 47 pages x 3 vp x 3 passes |
|---|---|
| Horizontal page scroll (scrollWidth > innerWidth) | PASS everywhere (0 FAIL) |
| Element crossing right edge (outside overflow-x scrollers) | PASS everywhere (0 FAIL) |
| h1 > 28px at width <= 390 | FAIL only on `/` (30px) ; PASS on all other pages |
| Text < 12px | PASS everywhere |
| Input/select/textarea < 16px | PASS everywhere |
| Form/auth/onboarding card centered (<=4px) and <= vw-32 | PASS on all measured pages (login card 301px wide, centered exactly) |
| Fixed bottom nav covers last element / content at scroll-bottom | PASS on all pages with nav (`/app/*`) |
| Tap targets < 44px | FAIL on 6 distinct items (below) |

Per-page matrix: every page is PASS for hscroll / overflow / h1 / font / input-zoom / centering / nav in all 3 viewports; the only per-page deviations are the tap-target items and `/` h1 listed in section 2.

## 2. Residual FAILs

| # | Category | Page(s) | Element | Measured | Suggested fix |
|---|---|---|---|---|---|
| 1 | h1 > 28px | `/` (all vp, all passes) | Landing hero h1 | 30px (text-3xl) | `frontend/src/components/landing/LandingHero.tsx:17` change `text-3xl` to `text-[1.75rem]` (28px) `md:text-5xl`, or accept: conventions doc explicitly allows hero 3xl, so this is a spec conflict; decide which wins |
| 2 | Tap < 44 | `/app/calendar` (all vp) | Month day buttons | 40x40 | `frontend/src/components/calendar/MonthGrid.tsx:54` `max-w-10` -> `min-h-11 max-w-11` (grid cell 7 cols at 360 = ~44px is available) |
| 3 | Tap < 44 | `/app/today`, `/app/baby/calendar` (compact grid) | Mini-calendar day buttons | 28x28 (mostly disabled/non-interactive future days; today variant may be tappable) | `MonthGrid.tsx:54` compact `h-7 w-7`: if buttons are meant to be tappable add `before:absolute before:-inset-2` hit-area; if display-only render as `<div>` |
| 4 | Tap < 44 (width) | `/` (and admin pages in error pass, footer/nav link) | "Avis" anchor | 26x44 (width) | `components/landing/LandingFooter.tsx:7`/`LandingNav.tsx:11`: add `min-w-11 justify-center`. Low severity (height OK) |
| 5 | Tap < 44 (measured) | `/onboarding/consent`, `/onboarding/baby-project` | Switch button `h-7 w-12` | 48x28 | `app/onboarding/consent/page.tsx:39` already has `before:-inset-2` (effective hit area ~64x44), so likely FALSE POSITIVE of the bounding-box metric; still, visual box is 28px tall. Optional: `h-8`. |
| 6 | Tap < 44 (measured) | `/app/assistant`, `/app/help`, `/app/baby/resources` at 360/375/390 | Bare text input inside a pill wrapper | input 24px tall (wrapper is ~48px) | Wrapper is the visible tap area; low severity. To be strict, make the input `min-h-11 w-full`: `components/assistant/ChatPanel.tsx:132`, `app/app/help/page.tsx:45`, `app/app/baby/resources/page.tsx:52` |

No FAIL in: horizontal scroll, right-edge crossing, small fonts, iOS input zoom, form centering, nav overlap.

## Coverage gaps (honest caveats)
- `/onboarding/baby-project` redirected to `/onboarding/consent` at 375 and 390 (onboarding state guard) so only the 360 measurement is of the real page; at 360 the centering union metric was not computable. Screenshot at 375 is the consent page. Needs manual re-check with correct onboarding state.
- Error pass: `/admin`, `/admin/articles`, `/admin/audit-log`, `/admin/pricing`, `/admin/outbox`, `/admin/email-queue` redirected to `/` in some viewports because `/api/admin/me` returned 500 (expected: guard bounces). Their error UI states are therefore NOT verified; populated and empty passes are.
- `next dev` overlay badge ("N") appears in screenshots; it is not app UI. Fixed nav appears mid-page in full-page screenshots (screenshot artifact); the numeric nav check at scroll-bottom is the authoritative one.
- Mocks are synthetic; very long unbroken strings were included (long email, 80-char URLs, 30-char ids) and did not overflow.

## 3. Visual observations (375, populated)
- `/`: hero, feature grids and CTA well proportioned; hero photo is a large dark block with a stray dev badge; no overflow. h1 slightly big but not cramped.
- `/login`: card centered (37px each side), inputs full width of the card, comfortable spacing. Good.
- `/onboarding/goal`: clean, three large choices, disabled CTA; large empty lower half is normal.
- `/onboarding/consent`: layout fine; enabled switches look visually clipped on the right (thumb appears cut at the track edge on the two "on" toggles) — check thumb `translate-x` vs track width in `app/onboarding/consent/page.tsx` (~line 39-45).
- `/app/today`: balanced cards, calendar widget readable (day cells small but legible), no clipping.
- `/app/log`: very long but well structured; chips wrap correctly; date input fine.
- `/app/calendar`: good; legend wraps in 2 rows; info box ok.
- `/app/assistant`: chip row scrolls horizontally inside its container (intended, clipped "Activité" at edge is a scroller); input + send button OK; composer sits above nav without overlap.
- `/app/billing`: plan cards single column, readable, "Populaire" badge ok.
- `/admin/users`, `/admin/audit-log`, `/admin/pricing`: stacked cards, long email/ids truncate or wrap without overflow; header is a bit cramped (title + "Retour" + Déconnexion) but not clipped; nav select dropdown is full width. Good.
