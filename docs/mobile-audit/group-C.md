# Mobile audit — Group C (onboarding)

Rules: docs/mobile-first-conventions.md. Class-only changes; no copy/logic/routing changes.

| Page / file | Problems found | Fix |
|---|---|---|
| OnboardingLayout | column `max-w-sm` (narrower than the convention) | `max-w-md` (gutter px-4, dvh, safe-area already OK; back button 44px, progress bar fits 360) |
| all 11 pages | h1 `text-xl` with no tablet+ scale; CTA 44px | h1 `leading-tight md:text-2xl` (welcome/ready `text-2xl md:text-3xl`); Button `min-h-12 w-full` |
| welcome, ready | none beyond h1/CTA (icon 64px, centered, wraps) | above |
| birth-date, last-period | Field is already 16px / 44px+ / full width; date input fits | none |
| goal, notifications | OptionCard already 1 column, wraps (group A) | none |
| period-length, cycle-length, concerns | chips relied on padding for 44px | `min-h-11` on chips (flex-wrap, wrap to rows cleanly at 360) |
| consent | switch 48x28 hit area; row text could overflow | `before:-inset-2` pseudo-element expands hit area to 64x44; text `min-w-0 break-words` |
| baby-project | code-only audit (only reachable with goal TRYING_TO_CONCEIVE in the draft; redirects to consent otherwise) | h1/CTA fixes |

## Verification
Playwright (Chrome, mobile emulation, DPR 2) at 375x812 and 360x740 against `next dev -p 3111` for all pages except baby-project: `scrollWidth == innerWidth` everywhere, zero elements outside the viewport, zero interactive elements under 44px except the consent switch visuals (48x28, hit area expanded via pseudo-element). Screenshots reviewed: consent (360), cycle-length (360). h1 computed size 20px (24px welcome/ready).

## Left / notes
- Sticky bottom CTA not added: every page is short and the CTA is in-flow well above the fold at 360x740 (consent is the longest and fits).
- Consent "checkboxes" are switches (`role=switch`), not checkboxes; kept.
- baby-project audited by code only.

## Reusable auth-screenshot script
`/private/tmp/claude-501/-Users-rodisiedantas-Documents-Projet-Nawira/bbca07f6-19d6-43f9-b686-728f0464ca6b/scratchpad/auth-shot.mjs`
Usage: `cd <scratchpad> && OUT=<dir> node auth-shot.mjs "/onboarding/welcome,/app/today" [hasProfile=false] [role=USER]` (dev server on :3111).
middleware.ts only checks cookie presence, so the script sets `<COOKIE_PREFIX>-token/-refresh/-csrf` (access token HS256-signed with JWT_SECRET from frontend/.env via node crypto) and intercepts `GET /api/auth/me` to return a fake user (hasProfile/role configurable). No DB access, nothing persisted. Other API calls (data fetches) hit the real server and will 401 unless mocked with further `ctx.route`.
