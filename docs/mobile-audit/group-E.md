# Mobile audit — Group E (remaining app pages)

Rules: docs/mobile-first-conventions.md. Class-only changes; no copy/logic/props changes.

| Page / component | Problems | Fixes |
|---|---|---|
| assistant/page | h1 text-xl, grid min-content blew layout to 1135px with a long token, gutters | h1 `text-2xl md:text-3xl`, grid `grid-cols-1 md:[minmax(0,1fr)_280px]`, `px-4 py-6 sm:px-6` |
| ChatPanel / MessageBubble | no `break-words`, bubbles p-4, input 14px, composer scrolled away with the page | `min-w-0 max-w-[85%]` + `break-words`, `p-3 sm:p-4`, input `text-base md:text-sm`, composer `sticky bottom-[calc(4.25rem+safe-area)] z-30` above bottom nav (`lg:bottom-0`), example buttons `text-sm break-words` |
| billing/page, CurrentPlanCard, PremiumPlansGrid | h1 no scale, h2 2xl in card, p-6 cards, CTA 40px, xs promise | h1 scale, h2 `text-lg md:text-xl`, `p-4 sm:p-6`, `grid-cols-1`, CTA `min-h-11`, `text-sm` |
| profile/page, ProfileHeaderCard, ProfileInfoSection | long email overflow risk, h2 2xl, h3 lg, p-6, stat tiles tight | `min-w-0 break-all` email, name `text-lg md:text-xl`, h3 `text-base md:text-lg`, `p-4 sm:p-6`, `max-w-3xl` + gutters, links `min-h-11` |
| settings/page | inputs 14px / 40px, submit auto width, google row not shrinking, max-w-3xl | `max-w-2xl` centered, inputs `min-h-11 w-full text-base md:text-sm`, CTA `min-h-12 w-full sm:w-auto`, "Lier Google" `min-h-11`, `min-w-0 flex-1` text, `p-4 sm:p-6` |
| help/page, HelpAccordion, ContactSupportCard | search input 14px, card stretched at md, inputs 14px/small, button auto width, "Mes demandes" 20px tall | column `max-w-2xl lg:max-w-none`, `minmax(0,1fr)` grid, inputs `text-base md:text-sm min-h-11 w-full`, CTA `min-h-12 w-full sm:w-auto`, triggers `min-h-11` with `min-w-0 flex-1 break-words`, `p-4 sm:p-6` |
| support list | h1 scale, row not `min-w-0`, load-more 40px | centered `max-w-3xl`, `min-w-0 flex-1 truncate`, badge `shrink-0`, load-more `min-h-11 w-full sm:w-auto` |
| support/[id] | h1 xl + long subject, bubbles no `break-words`, reply box scrolls off under bottom nav, textarea 14px | h1 scale + `break-words`, bubbles `break-words`, reply box sticky above nav, textarea `text-base md:text-sm w-full`, CTA `min-h-12 w-full sm:w-auto` |
| baby/page, calendar, tips, resources, add-lh-test | h1 no scale, wide grids with `1fr` min-content, xs body, tab/link/filter chips <44px, p-6 cards, LH result rows small, Save/Cancel side by side | h1 scale, `grid-cols-1` + `minmax(0,1fr)`, `text-sm` body, tabs/filters/links `min-h-11`, `p-4 sm:p-6`, result rows `min-h-14 break-words`, actions `flex-col-reverse sm:flex-row min-h-12`, search input 16px |
| components/baby/* | h2 2xl/lg, xs text, missing `min-w-0`, CTAs 40px, temp input 14px | h2 `text-base/lg md:text-lg/xl`, `text-sm`, `min-w-0 break-words`, `min-h-11` CTAs, temperature input `text-base md:text-sm min-h-11`, wrapping row |

## Verification
Playwright mobile emulation (DPR 2) on `next dev -p 3111`; `/api/auth/me` and every data endpoint mocked in `scratchpad/e-shot.mjs` (catch-all for other /api, no DB). Worst-case data: 118-char email, 120-char unbroken URL, long French strings, 14 chat messages, 12-message ticket thread, long ticket subjects. States: full, empty, error at 375x812 and 360x740 for all 12 pages; also FAQ expanded, settings without password. Result: scrollWidth == innerWidth everywhere, zero off-screen elements, h1 24px (30px at 768/1280), only sub-44 measured items are inner text inputs inside 48px containers. 768 and 1280: no overflow, constrained columns. Screenshots viewed: assistant, settings, support thread, add-lh-test, billing (360). `pnpm lint/typecheck/test` pass (882 tests).

## Left
- Support thread bubbles remain full-width cards (not 85% chat bubbles) — layout choice kept.
- Empty/error/768/1280 screenshots verified by measurement only.
- Desktop sidebar links 40px (layout, out of scope).
- Assistant page has no internal scroll container (by design); composer is sticky instead.
