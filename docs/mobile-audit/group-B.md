# Mobile audit — Group B (public + auth pages)

Rules: docs/mobile-first-conventions.md. Class-only changes; no copy/logic changes.

| File | Problems found | Fix |
|---|---|---|
| components/auth/AuthCard | `min-h-screen`, `max-w-sm` card, no explicit centering wrapper, py-12 heavy, logo link <44px, p-6 | `min-h-dvh`, `mx-auto w-full max-w-md`, `py-8 sm:py-12`, logo `min-h-11`, `p-5 sm:p-8`, title `md:text-2xl` |
| components/auth/GoogleAuthButton | ~42px tall | `min-h-12` (already full width) |
| login / signup / forgot / reset / verify-email | secondary text links (forgot password, create account, resend code, restart signup) <44px tap height | `inline-flex min-h-11 items-center` on each. Inputs (Field: 16px, min-w-0) and OTP fields (8 chars mono, w-full) already fit |
| auth/error | `min-h-screen`, CTA 40px, link small, code could overflow | `min-h-dvh py-8`, CTA `min-h-12`, link `min-h-11`, `break-all` on code |
| offline | `min-h-screen`, p-6 | `min-h-dvh`, `px-4 py-6` |
| settings (root) | `min-h-screen`, py-12, inputs 14px (iOS zoom) and ~38px, submit not full width, Google link <44px, no min-w-0, h1 no scale | `min-h-dvh`, `py-6 sm:py-12`, inputs `text-base md:text-sm py-3 w-full min-w-0`, submit `min-h-12 w-full`, links `min-h-11`, `break-words` email, card `p-4 sm:p-5`, h1/h2 md: scale |
| LandingNav | logo link <44px, menu rows implicit height | `py-3`, logo `min-h-11`, menu rows `flex min-h-11` (hamburger was already 44px) |
| LandingHero | h1 `text-4xl` base, h2 `text-3xl` base, body base-size, CTA not h-12 | h1 `text-3xl md:text-5xl`, h2 `text-2xl md:text-4xl`, body `text-sm md:text-base`, CTA `h-12`, `min-w-0` |
| LandingFeatures / LandingCTA / LandingSocialProof | h2 `text-3xl` base; body base-size | `text-2xl md:text-3xl lg:text-4xl`; body `text-sm md:text-base`; CTA `h-12`; feature desc `md:text-sm` |
| LandingAppMockup | fixed w-64 without max-w-full; desktop mockup 3-col grid cramped at 360 | `max-w-full`, `min-w-0`, grid `grid-cols-1 sm:grid-cols-3` |
| LandingFooter | link rows ~20px tall | `inline-flex min-h-11` (spacing dropped from ul), gap-8 |
| LandingLifecycle, page.tsx | none (grid-cols-2 tiles, desktop-only flex) | - |

## Verification
Chrome headless `--window-size=375` enforces a ~500px minimum layout width, so those first PNGs (home/login/verify-email) were cropped and misleading; discarded. Used Playwright (mobile emulation, 375 and 360 wide, DPR 2) against `next dev` on port 3111 (3000 was occupied): for /, /login, /signup, /forgot-password, /reset-password, /verify-email, /auth/error, /offline: documentElement.scrollWidth == viewport width on all (no horizontal overflow), zero elements outside viewport, zero interactive elements under 43.5px. Full-page screenshots viewed: verify-email (centered card, full-width inputs and CTA) and home (hero, lifecycle, features, mockups, CTA, footer all fit, single column). Other pages share AuthCard and passed the numeric checks.

## Deliberately left
- Settings and auth/error pages keep their gray/black unstyled look (no color restyle per brief); auth-gated /settings audited by code only.
- Landing body text `text-xs` (12px floor) for feature/stage captions kept.
