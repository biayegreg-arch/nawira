# Assistant — Banani → Next.js/Tailwind

## Source
- Banani screen ID: `acguXQuGeGbU/screens/Assistant.jsx`
- Shared components fetched: `AssistantChatMessages.jsx`, `AssistantSidebarTopics.jsx` (also fetched but NOT used — `NawiraSidebar.jsx`, `TopBar.jsx`: the real app already has its own equivalent shell, see below)
- Fetched: 2026-09-09

## System context (Step 0 answers)

1. **Route:** `/app/assistant` — file already exists as a placeholder (`frontend/src/app/app/assistant/page.tsx`, `ComingSoonPage` wrapper). Nav link already wired in `AppSidebar.tsx:34` (`{ href: '/app/assistant', label: 'Assistant NAWIRA', icon: MessageCircle }`) — no shell changes needed.
2. **Auth:** gated by the existing `/app/layout.tsx` shell (auth+profile check already applied to all `/app/*` routes) + `useUser()` from `@/contexts/AuthContext`, matching the current placeholder's pattern exactly.
3. **Reads:** nothing via GET. The backend (`POST /api/assistant/messages`) injects real cycle/insight context server-side on every call — invisible to the frontend, nothing to fetch on page load beyond the user object already in context.
4. **Writes:** `POST /api/assistant/messages`, CSRF required, **SSE streaming response** (`content-type: text/event-stream`). This does NOT go through the generic `api<T>()` wrapper (JSON-only) — needs a dedicated `fetch()` + `ReadableStream` reader. Optimistic UI: append the user's message immediately, then progressively render the assistant's reply as `data: {"type":"chunk",...}` events arrive, followed by an `event: done` carrying `{conversationId, messageId}`.
5. **Navigation:** entered via the persistent sidebar/bottom-nav (already wired); no back button needed, it's a shell-resident screen like `/app/today`.
6. **Reuse vs. new:**
   - **REUSE** `AppSidebar`/`AppTopBar`/`/app/layout.tsx` — already built, already responsive (desktop sidebar + mobile bottom nav). Banani's `NawiraSidebar.jsx`/`TopBar.jsx` in this fetch are its own screen-mockup chrome and are NOT translated — the real shell already exists and must not be duplicated or reverted.
   - **REUSE** `Button` (`src/components/ui/Button.tsx`), `ChipGroup` (`src/components/ui/ChipGroup.tsx`) where they fit.
   - **NEW** `src/components/assistant/ChatPanel.tsx` — message list + input, from `AssistantChatMessages.jsx`.
   - **NEW** `src/components/assistant/TopicsPanel.tsx` — quick-topic buttons, from `AssistantSidebarTopics.jsx`. Confirmed via the fetched source this is a **static list of 8 topic categories** (Mon cycle, Énergie, Activité, Nutrition, Sommeil, Bien-être mental, Vie intime, Ressources) — NOT a list of past conversations. No mismatch with the backend's lack of a conversation-list endpoint.
   - **NEW** `src/lib/assistant-chat.ts` — the SSE fetch helper (CSRF header read duplicated minimally here rather than exporting a new symbol from the PROTECTED `src/lib/api.ts`; ~5 lines, matches `api.ts`'s own cookie-read logic).
7. **States:**
   - **Empty/first-load:** static welcome message + 3 example-question buttons (from Banani's mockup), rendered once, before any real message exists.
   - **Loading:** a "typing" indicator (three dots) while waiting for the first SSE chunk; the assistant bubble then fills in progressively as chunks arrive.
   - **Error:** parsed from the route's stable `{error: 'CODE'}` shape (route.ts, PROTECTED-adjacent — never modified, only read) — mapped to French inline text:
     - `ASSISTANT_QUOTA_EXCEEDED` (429) → persistent inline banner in the chat panel: "Tu as atteint ta limite de 10 messages aujourd'hui. Reviens demain !" — input disabled for the rest of the session (re-enabled on next successful send attempt after a page reload, no live countdown needed for v1).
     - `AI_NOT_CONFIGURED` (503) → "L'assistant n'est pas encore configuré. Réessaie plus tard." (this WILL be the real state in this dev environment, since `ANTHROPIC_API_KEY` isn't set — user confirmed testing this path is acceptable for now).
     - `ASSISTANT_UPSTREAM_ERROR` (502) / network error → toast via `useToast()`: "Une erreur est survenue, réessaie." + the failed user message stays visible but the assistant bubble is replaced with a small inline retry affordance.
     - `VALIDATION_FAILED` (400) → shouldn't be reachable from the UI (client always sends a valid body), but if hit, generic toast.
     - `401`/`403` → toast: "Ta session a expiré, reconnecte-toi." (no auto-refresh-retry for this first version — the SSE POST isn't safely retryable mid-stream, and by the time a user is actively chatting their session is very likely already fresh from other page activity; documented as a known simplification, not a silent gap).
8. **Side effects:** none beyond the chat exchange (no analytics pipeline exists anywhere in this codebase, confirmed). **Conversation persistence:** gated server-side on the `ASSISTANT_HISTORY` consent already collected at onboarding (`/onboarding/consent`) — invisible to this UI. **Visible transcript persistence across page reloads:** `localStorage` (user's explicit choice), keyed per-user (`assistant-chat:${user.id}`), storing the rendered message list only — reconstructed on mount, cleared only if the user explicitly starts a "new conversation" (out of scope for v1 — no such button; the transcript just keeps growing in one continuous localStorage-backed thread, capped at a reasonable count e.g. last 50 rendered messages to avoid unbounded storage growth).

## Structure map

- **Header** (`mb-6`): "🌸 Assistant NAWIRA" title + subtitle — static, translated 1:1 from Banani.
- **Main layout**: `grid` with chat column (`1fr`) + topics column (`280px` desktop, hidden/collapsed on mobile — see Responsive plan). Banani used a fixed `height: calc(100vh - 280px)`; adapted to a `flex-1 min-h-0` pattern so it works inside the existing `/app/*` shell's own scroll container instead of assuming a bespoke viewport height.
- **ChatPanel**: scrollable message list (user bubbles right-aligned purple, assistant bubbles left-aligned with 🌸 avatar + light-purple background) + sticky input row at the bottom (text input + send button, disclaimer text below).
- **TopicsPanel**: header + 8 topic buttons + footer disclaimer. Clicking a topic pre-fills the chat input with a matching question (does not send automatically — user still hits send, avoiding a surprise message firing without user confirmation).

## Component breakdown

- **NEW** `ChatPanel` (`src/components/assistant/ChatPanel.tsx`) — props: `messages: ChatMessage[]`, `onSend: (text: string) => void`, `sending: boolean`, `quotaExceeded: boolean`, `prefillText: string | null` (from a clicked topic), `onPrefillConsumed: () => void`. Owns the input's local state.
- **NEW** `TopicsPanel` (`src/components/assistant/TopicsPanel.tsx`) — props: `onTopicClick: (question: string) => void`. Static topic→question mapping lives here (8 topics, each with a representative French question, since Banani's topics are category labels, not the questions themselves — this mapping is new copy, listed in Copy/i18n below).
- **NEW** `MessageBubble` (`src/components/assistant/MessageBubble.tsx`) — props: `role: 'user' | 'assistant'`, `content: string`, `timestamp: string`, `streaming?: boolean` (shows a blinking cursor / typing dots while actively receiving chunks).
- **NEW** `src/lib/assistant-chat.ts` — `sendAssistantMessage(message: string, history: ChatMessage[], onChunk: (text: string) => void): Promise<{conversationId: string | null; messageId: string | null}>` — the SSE fetch + stream-parsing logic, throws a typed error with `.code` matching the route's `{error: 'CODE'}` shape (mirrors `ApiError`'s shape from `api.ts` but is a separate small local type — not importing from the protected file, avoiding any coupling to its internals).
- **PRIMITIVE reuse**: `Button` for send/topic buttons where it fits without fighting the exact Banani pixel spec (topic buttons and the send button use `Button`; the example-question buttons inside the welcome message are simple enough to stay as plain styled `<button>` matching Banani's compact list style, which `Button`'s variants don't currently cover).

## Token mapping (Banani → project, already-established real tokens — verified against `frontend/src/app/globals.css`)

| Banani token/hex | Project value |
|---|---|
| `#6C43C1` (primary) | `primary` |
| `#EEE7FA` (primary-100) | `primary-soft` |
| `#F8F5FD` (primary-50) | `primary-faint` |
| `#8058D4` (primary-500) | `purple` |
| `#1F2937` (navy) | `navy` |
| `#6B7280` (gray-500) | `muted-foreground` |
| `#9CA3AF` (gray-400, used inline) | `muted-light` |
| `#E5E7EB` (border) | `border` |
| `#F9FAFB` (gray-50) | closest existing is `primary-faint`/plain `bg-white` — no exact gray-50 token exists; use Tailwind's default `gray-50` utility (not a custom token collision, since the project's custom grays are named `muted-*`, not `gray-*`) |
| `--radius-md: 12px` | `rounded-xl` (Tailwind v4 default scale where `xl`≈12px) — verify against real rendered radius, adjust to `rounded-lg`/`rounded-xl` by eye if off |
| `--radius-pill: 999px` | `rounded-full` |

## Tailwind translation notes

- `flex gap-3` → `flex gap-3` (already a direct utility, Banani's Tailwind classes are usable near-verbatim where they don't rely on inline `style={{}}`)
- Inline `style={{ background: '#EEE7FA' }}` → `bg-primary-soft`
- Inline `style={{ background: '#6C43C1', color: '#FFFFFF' }}` (send button) → `bg-primary text-white`
- `gridTemplateColumns: '1fr 280px'` (desktop-only in Banani) → `md:grid md:grid-cols-[1fr_280px]` (mobile: single column, topics panel moves — see Responsive plan)
- `height: calc(100vh - 280px)` → dropped; replaced with `flex-1 min-h-0 flex flex-col` so the chat panel fills available height within the existing `/app/*` shell's own scroll container, and the message list itself scrolls (`overflow-y-auto`) rather than the whole page.

## Responsive plan (mandatory — Banani is desktop-only)

- **Base (375px, no prefix):** single column. Header at top (smaller: `text-xl` instead of `text-2xl`). Topics panel becomes a **horizontal scrollable chip row** (using the existing `ChipGroup` primitive, or a simple `flex gap-2 overflow-x-auto` row of pill buttons) placed ABOVE the chat messages, collapsed to icon+label chips rather than the full 3-line desktop button (icon box + label + arrow). Chat input row: full-width, send button icon-only (no wasted horizontal space). Message bubbles: `max-w-[85%]` instead of Banani's `max-w-md` (which would overflow a 375px viewport).
- **sm (640px+):** chip row gets a bit more breathing room; bubbles can grow slightly (`max-w-sm`).
- **md (768px+):** switch to the two-column grid (`md:grid-cols-[1fr_280px]`) — topics panel becomes the real right-hand sidebar as Banani designed it, chip row is hidden (`md:hidden` on the mobile chip row, `hidden md:flex` on the desktop panel).
- **lg (1024px+):** matches Banani's desktop mockup — this is the pixel-parity target breakpoint. `max-w-md` bubbles restored (enough width at this size).
- **xl (1280px+):** no additional change; the existing `/app/*` shell already caps content width via its own layout, this screen doesn't need its own max-width container.
- **What changes across breakpoints:** topics panel position (top chip row ↔ right sidebar), grid columns (1 ↔ `1fr 280px`), bubble max-width, header text size, send-button label visibility (icon+text at md+, icon-only below).

## Interactions / state

- **Hover/focus:** topic buttons and send button get a visible hover background shift + focus ring (`focus-visible:ring-2 focus-visible:ring-primary`), matching the app's existing `Button` primitive conventions.
- **Touch:** all topic buttons and the send button ≥48px tap target on mobile (chip row uses adequately padded chips, not Banani's dense desktop button height).
- **Keyboard:** text input submits on Enter (not Shift+Enter, no multiline needed for v1 — matches Banani's single-line input); tab order flows input → send → topic chips.
- **Streaming state:** while a response is streaming, the input + send button are disabled (`sending` prop) to prevent overlapping requests — matches the backend's one-quota-slot-per-call model.
- **Quota-exceeded state:** input fully disabled, replaced with the persistent French banner described above.

## Copy / i18n

All strings added to `src/lib/constants.ts` (existing i18n convention) under a new `ASSISTANT_*` block:
- Header title/subtitle (from Banani, translated 1:1 — already French in source)
- Welcome message + 3 example questions (from Banani, already French)
- 8 topic labels (from Banani) + **NEW** representative question per topic (Banani only gives category labels, not clickable questions — this mapping is new copy I'm writing, to be confirmed against user preference if any topic's suggested question feels off):
  - Mon cycle → "Peux-tu m'expliquer les phases de mon cycle ?"
  - Énergie → "Pourquoi je me sens fatiguée en ce moment ?"
  - Activité → "Quel type d'activité physique me convient selon mon cycle ?"
  - Nutrition → "Que devrais-je manger cette semaine ?"
  - Sommeil → "Comment améliorer mon sommeil pendant mes règles ?"
  - Bien-être mental → "Comment gérer les sautes d'humeur liées à mon cycle ?"
  - Vie intime → "Comment mon cycle affecte-t-il ma libido ?"
  - Ressources → "Où puis-je trouver plus d'informations fiables sur la santé féminine ?"
- Error messages (listed under States above)
- Disclaimer text below input (from Banani, already French): "NAWIRA peut faire des erreurs. Consulte un professionnel pour des questions médicales urgentes."
- Quota-exceeded banner text (new)

## Implementation checklist

- [ ] Build `src/lib/assistant-chat.ts` (SSE fetch helper)
- [ ] Build `MessageBubble`, `ChatPanel`, `TopicsPanel` components (mobile-first)
- [ ] Replace `frontend/src/app/app/assistant/page.tsx` (remove `ComingSoonPage`, wire the real screen)
- [ ] Add `ASSISTANT_*` copy block to `constants.ts`
- [ ] localStorage read/write for transcript persistence (per-user key, capped history)
- [ ] Wire quota/error states
- [ ] 375px check — chip row + stacked layout, no horizontal scroll, ≥48px targets
- [ ] 768px check — transition to 2-column layout
- [ ] 1280px check — matches Banani desktop mockup
- [ ] Keyboard nav + focus rings
- [ ] Verify the honest 503 (`AI_NOT_CONFIGURED`) path renders correctly end-to-end (real state in this dev env, no `ANTHROPIC_API_KEY` set)
- [ ] `pnpm lint && pnpm typecheck && pnpm build`, dev server visual check at 3 breakpoints

## Open questions for user

- The 8 topic→question mappings above are my own copy (Banani only gives category labels) — flag if any should be reworded.
- No "start a new conversation" affordance in v1 (transcript just keeps growing in localStorage, capped at 50 messages) — acceptable for a first pass, or worth a "Nouvelle conversation" button now?
