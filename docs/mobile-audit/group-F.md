# Mobile audit — Group F (admin back-office)

Class/markup-only changes. Verified with Playwright (mocked `/api/auth/me` + `/api/admin/*`, worst-case fixtures: very long emails/subjects/slugs/ids, JSON payloads, 12 rows + "Charger plus", empty and 500-error states, ADMIN and SUPERADMIN capability sets) at 375x812 and 360x740, quick check at 768 and 1280.

| Page / component | Problems | Fixes |
|---|---|---|
| admin/page.tsx (overview) | h1 text-xl; long admin email overflowed header; KPI 1 col with p-5; search input 12px/24px tall; px-6 panel gutters; footer link small; `lg:grid-cols-[1fr_420px]` could blow out; table cells not truncating | h1 `text-2xl md:text-3xl`; email `break-all`; CTA `min-h-11`; KPI `grid-cols-2 gap-3`, `p-4`; search full width, `min-h-11`, `text-base`; `px-4 sm:px-6`; `minmax(0,1fr)`; `table-fixed`; footer link `min-h-11` |
| admin/users | Search input 16px rule + tap area; badges no wrap; "Charger plus" self-centered small; table cells didn't truncate | input `min-h-11 text-base`; button `min-h-11`; `flex-wrap`; full-width button on mobile; `table-fixed w-1/2` |
| admin/pricing | Double padding (page p-4 inside main padding); 2-col cards overflowed at 375 (scrollW 417) due to long `updatedBy`; input w-32 12px font; small button | `mx-auto max-w-2xl`, single column, `break-all`, input `flex-1 min-h-11 text-base`, full-width Enregistrer on mobile, h1 2xl/3xl |
| admin/articles | Header/actions cramped; row action links ~16px tall; inputs 14px; button self-end small; slug unbroken | header `flex-col sm:flex-row`, full-width CTA; form inputs `text-base min-h-11`; row stacks on mobile with `min-h-11` action buttons; slug `break-all`; full-width Charger plus; h1 2xl/3xl |
| admin/support | select 14px/small, header not stacking; masked email untruncated | header stacks, select `w-full min-h-11 text-base`, `truncate`, Badge `shrink-0`, full-width Charger plus, h1 2xl/3xl |
| admin/support/[id] | Long subject h1 forced row layout with select; email/URL overflow risk; reveal link tiny; textarea 14px; reply button small | `max-w-2xl` centered thread; header `flex-col sm:flex-row`; h1 `text-xl md:text-2xl break-words`; email `break-all`; reveal/select/reply `min-h-11`, textarea `text-base`; messages `break-words` |
| admin/audit-log, outbox | Filter inputs squeezed on one row (flex-wrap + flex-1), 14px, small buttons; ids truncated | form stacks (`flex-col sm:flex-row`), `min-h-11 text-base`, full-width button; ids `break-all`; Charger plus full width |
| admin/email-queue | select 14px, small; body preview overflow risk | `w-full sm:w-auto min-h-11 text-base`; preview `break-words` |
| admin/rate-limits | Key + "hits · expire" crammed in one row; long bucket names | entry stacks on mobile; bucket `break-all min-w-0`; `p-4 sm:p-5` |
| components/admin/RecordDetailModal | Field values `truncate` hid lastError/User-Agent/ids; pre didn't wrap | `dd break-words`; pre `whitespace-pre-wrap break-all` (still `overflow-auto max-h-64`) |
| AdminMobileNav / AdminTopBar / UserDetailModal | Checked: select lists all 9 ADMIN_NAV entries (incl. Articles, Support), 44px, 16px; modal scrolls with real content | none needed (group A) |

## Measurements
- All 10 admin pages, 375 and 360, states full / empty / error: `scrollWidth == innerWidth`, no off-screen elements, no tap targets < 44px (pricing was 417 before the fix).
- Modals opened (audit-log, outbox, email-queue, users): fit viewport, body scrolls, JSON wraps.
- Article create form open at 360: fine. ADMIN (no pricing:write) pricing view fine.
- 768: users table with truncation OK; 1280: only sidebar links are 40px tall (desktop pointer UI, left as in group A).

## Left and why
- Dense pages (audit-log, outbox, email-queue, rate-limits) are already stacked cards, which the conventions allow; no `overflow-x-auto` tables were needed.
- Admin top bar h1 stays `text-lg` (group A, compact bar); the few page h1s that exist are 2xl/3xl (support ticket subject is xl/2xl on purpose since it is user text).
- RecordDetailModal stays a centered dialog with `px-4` gutter (fits, scrolls) rather than a bottom sheet.
- "[object Object]" seen in the error-state screenshot is an artifact of my mock error shape, not an app bug.
