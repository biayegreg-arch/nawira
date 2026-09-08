# Phase 7 — AI Assistant (E10, PRD §6.5 AI01) Design

## 1. Scope

Backend for `/app/assistant` — currently an honest "Bientôt disponible"
placeholder. Builds the AI Gateway logical component named in PRD §13:
"Guardrails, contexte autorisé, fournisseur LLM." UI is explicitly
deferred to a separate `banani-design-implementation` pass (spec §8) —
the Banani `Assistant.jsx` screen (static mock chat UI) was already
fetched and structurally extracted in a prior session.

**In scope:**
- `POST /api/assistant/messages` — streaming chat endpoint, backed by
  Claude (Anthropic Messages API, model `claude-sonnet-5`).
- Two-layer guardrails: a fixed system prompt encoding PRD §6.5's
  allowed/forbidden table, plus a rule-based output filter as a defensive
  net (never a second LLM call — see "Decisions" below).
- Real personal-data context (structured only — cycle/prediction/insight
  summaries, never free-text notes) injected per PRD's "Mes données"
  allowed-response row.
- Conversation persistence gated by the existing `ASSISTANT_HISTORY`
  consent (already defined in the `Consent` model, previously unused).
- A per-user daily message quota as a cost control (PRD/business-model
  rule #6 — "AI Gateway must have quotas/cost controls"), independent of
  plan tier for this launch phase.
- A coarse intent classification for the `assistant_used` analytics event
  (PRD §16: `intent_category,no_health_text` — never raw message text).

**Out of scope (explicit deviations, decided with the user before writing
this spec):**
- **No Free/Plus tier split.** PRD §35 says Free gets FAQ-only content,
  Plus/Baby get the real assistant. Every user is FREE today (no billing
  enforcement exists anywhere in the codebase yet — confirmed in the
  Subscription epic's own delta notes). Matching the precedent already
  set for Insights (Phase 6): the live LLM assistant is available to
  every authenticated user during this launch phase; the daily quota is
  the cost control, not a plan gate. Revisit once billing is real.
- **No second LLM call as a moderator.** Doubling the cost per message
  contradicts the "AI cost per free MAU must stay minimal" rule
  directly. The rule-based output filter is the only defensive net
  beyond the system prompt.
- **No UI.** Per this project's established pattern (Phase 5, Phase 6).

## 2. Data model (new tables + reused consent)

```prisma
model AssistantConversation {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  title     String?  // derived from the first user message, truncated
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  messages  AssistantMessage[]

  @@index([userId, updatedAt])
}

model AssistantMessage {
  id             String                @id @default(cuid())
  conversationId String
  conversation   AssistantConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           String                // USER | ASSISTANT
  content        String                @db.Text
  intentCategory String?               // set only on USER messages; stored for a future E12 analytics pass (see §9) — no event pipeline exists yet
  createdAt      DateTime              @default(now())

  @@index([conversationId, createdAt])
}
```

`User` gets one new relation: `assistantConversations AssistantConversation[]`.

**Consent-gated persistence.** The `Consent` model already has a
`type: "ASSISTANT_HISTORY"` value (used by the onboarding flow's consent
payload, never actually consumed anywhere until now). The route checks
for an active (non-revoked) `ASSISTANT_HISTORY` consent:
- **Granted** → conversations/messages are created and read normally;
  the client may omit `history` and rely on `conversationId`.
- **Not granted / revoked** → the route creates and reads NOTHING in
  these two tables. The client is responsible for resending the full
  conversation (`history` field) on every request; nothing persists
  server-side. A conversation becomes unreadable if consent is revoked
  after messages were written (existing rows are NOT deleted by
  revocation — consistent with how every other consent type in this
  codebase behaves; only an explicit privacy-delete request removes
  data).

No new consent type is added — `ASSISTANT_HISTORY` already exists and
was simply unused.

## 3. Guardrails

### 3.1 System prompt (`system-prompt.ts`, pure)

Fixed French text, structured in three parts, in this order (most
important last — instructions near the end of a long system prompt
carry more weight):

1. **Identity**: "Tu es NAWIRA, un assistant bienveillant de santé
   féminine. Tu n'es ni médecin ni professionnel de santé."
2. **Per-topic rules**, translating PRD §6.5's table directly into
   imperative instructions — one paragraph per row (information cycle,
   mes données, retard de règles, douleur, contraception, projet bébé).
3. **Absolute prohibitions, repeated as a final bullet list**: never
   diagnose, never prescribe treatment or dosage, never assert a
   pregnancy, never claim "safe days" / "jours sans risque" (PRD §8's
   contraceptive-marketing restriction), never guarantee conception.
   Includes an escalation instruction: emergency-shaped descriptions
   (sudden severe pain, unusually heavy bleeding, suicidal ideation) get
   an empathetic redirect to immediate professional/emergency care, never
   a generic answer.

`buildSystemPrompt(): string` takes no arguments — the text is
completely static, which is exactly what makes it cacheable
(`cache_control: { type: 'ephemeral' }` on the system block, per
Anthropic's prompt-caching guidance: any byte change anywhere in a
cached prefix invalidates everything after it, so this text must never
depend on request-specific data).

### 3.2 Output filter (`output-filter.ts`, pure)

`filterAssistantOutput(text: string): string` — scans the model's full
response (after streaming completes server-side, before it's forwarded
to the client — see §6, this means the route buffers the model's
response internally even though it re-streams to the client, since the
filter needs the complete text to make a decision) against a fixed list
of high-risk regex patterns:

- Pregnancy affirmation (e.g. `/tu\s+es\s+(probablement\s+)?enceinte/i`,
  excluding phrasings that recommend a pregnancy test rather than assert
  one)
- Dosage instructions (quantity + unit + a taking-verb, e.g.
  `/\bprends?\s+\d+\s?(mg|ml|comprimés?|gélules?)/i`)
- "Safe days" claims (`/jours?\s+sans\s+risque/i`, `/jour\s+sûr/i`)
- A small curated list of assertive diagnosis phrasings (e.g. `/tu\s+as\s+(de\s+l['e])?(endométriose|SOPK|un\s+kyste)/i`,
  `/cela\s+confirme\s+que\s+tu\s+(as|souffres)/i`)

If ANY pattern matches, the entire response is replaced with a fixed
safe fallback message (French, apologetic, redirects to a professional)
— never a partial edit of the flagged sentence, since surgical editing
of LLM output risks producing a nonsensical, partially-redacted
response.

## 4. Context injection (`context-summary.ts`, pure formatter + route does the fetching)

Real, structured user data — never free text — assembled into a French
paragraph prepended to the user's message content (not the system
prompt, so the cached system-prompt prefix never changes):

- **Cycle/prediction summary**: reuses the exact same
  `prisma.prediction.findUnique` shape already returned by
  `GET /api/predictions/current` (Phase 3/5) — confidence,
  expected period start/end, ovulation estimate, fertile window.
- **Insights summary**: reuses `deriveInsights()` (Phase 6) — when
  `eligible: true`, includes Cycle Score trend and top symptoms by
  phase.
- **Explicitly excluded**: `DailyLog.note` (free text), any
  user-authored content besides the chat message itself.

`formatUserContext(input: UserContextInput): string` is a pure function
(same split as every other module in this codebase — pure formatting
logic separate from the Prisma fetch, which lives in the route). When
there's no prediction and no eligible insights (a brand-new user), it
returns a short "pas encore assez de données" sentence rather than an
empty block — the assistant should never silently pretend to have
context it doesn't.

## 5. Quota (`quota.ts`)

10 messages per user per rolling 24h window
(`ASSISTANT_DAILY_MESSAGE_LIMIT`, env-configurable, default `10`).
Reuses the existing `RateLimitStore` interface (Redis-backed,
in-memory fallback with a boot-time `log.warn`) — no new
infrastructure. Exceeding the quota returns `429` with the stable code
`ASSISTANT_QUOTA_EXCEEDED`.

## 6. Anthropic client (`client.ts`)

The only file that imports `@anthropic-ai/sdk`. Lazy-initialized
singleton exactly mirroring `cloudinary-client.ts`'s pattern: a
`AssistantNotConfiguredError` thrown synchronously on first use when
`ANTHROPIC_API_KEY` is empty/missing (checked via `process.env` at
call time, not module load, so tests can mutate the env; deliberately
NOT added to `env.ts`'s Zod schema for the same reason Cloudinary's
keys aren't — an empty value must not block boot). The route catches
`instanceof AssistantNotConfiguredError` and returns `503
AI_NOT_CONFIGURED`.

Model: `claude-sonnet-5`. Streaming (`client.messages.stream(...)`),
system prompt cached via `cache_control: { type: 'ephemeral' }`.
`max_tokens: 2048` (chat responses are short; no reason to allow a
128K-token response for this use case). No `thinking` — this is a
conversational assistant with a fixed, well-specified system prompt, not
a reasoning-heavy task; adaptive thinking would add latency and cost
with no benefit here, and the model's default (`thinking: {type:
"adaptive"}`) is left as-is (Sonnet 5 always runs adaptive regardless).

## 7. Intent classification (`intent-classifier.ts`, pure)

`classifyIntent(message: string): IntentCategory` — coarse, keyword-based
classification (no LLM call — this exists purely to populate
`AssistantMessage.intentCategory` for a future analytics pass, §9; a
second API call to classify intent would double cost for no product
value):

```ts
type IntentCategory =
  | 'CYCLE_INFO'
  | 'MY_DATA'
  | 'DELAYED_PERIOD'
  | 'PAIN'
  | 'CONTRACEPTION'
  | 'BABY_PROJECT'
  | 'OTHER';
```

Mirrors PRD §6.5's table rows exactly. `OTHER` is the fallback when no
keyword set matches — this is intentionally approximate; it feeds an
analytics dimension, not a guardrail decision (guardrails come from the
system prompt + output filter, applied regardless of classified intent).

## 8. API

`POST /api/assistant/messages` (`runtime = 'nodejs'`, `requireAuth` +
`verifyCsrf`):

**Request:**
```ts
{
  conversationId?: string;  // omitted = start a new conversation
  message: string;
  history?: Array<{ role: 'USER' | 'ASSISTANT'; content: string }>; // required only when ASSISTANT_HISTORY is not granted
}
```

**Response**: `text/event-stream` (SSE). Text chunks stream as the model
generates them; a final `event: done` carries
`{ conversationId, messageId }` so the client can persist/reference the
turn. Because the output filter needs the complete response before
deciding whether to forward or replace it (§3.2), the route buffers
Claude's stream server-side and re-streams either the real text (chunk
by chunk, replayed) or the safe fallback message to the client — the
client never sees a mid-stream response that gets retracted.

**Errors** (stable `ApiError.code`, matching this codebase's convention
of switching on `.code` never `.message`):
- `429 ASSISTANT_QUOTA_EXCEEDED` — daily quota exhausted.
- `503 AI_NOT_CONFIGURED` — `ANTHROPIC_API_KEY` missing.
- `502 ASSISTANT_UPSTREAM_ERROR` — the Anthropic API call itself fails
  (network error, provider-side error, provider rate limit). Caught via
  the SDK's typed exception classes (`APIError` and subclasses), logged
  server-side with the real error detail, but the client only ever sees
  the generic code — never a provider error message forwarded verbatim
  (avoids leaking upstream implementation details). If the failure
  happens after some text has already streamed to the client, the
  connection simply ends without a `done` event; the client-side chat UI
  (built in the later `banani-design-implementation` pass) is
  responsible for treating an incomplete stream as a failed turn.
- Standard `401`/`403` from `requireAuth`/`verifyCsrf`.

## 9. Analytics (deferred — no event pipeline exists in this codebase)

PRD §16 defines `assistant_used` (`intent_category,no_health_text`), but
**no analytics-event infrastructure exists anywhere in this codebase** —
none of PRD §16's other events (`period_logged`, `insight_viewed`,
`prediction_viewed`, ...) are wired in any already-shipped epic either
(E12 "Analytics" is its own separate, unstarted PRD epic). Building an
event pipeline unilaterally inside this epic would be new,
unprecedented scope.

What this phase DOES build, so the future E12 pass has something to
consume: `classifyIntent()` (§7) runs on every user message and its
result is stored as `AssistantMessage.intentCategory` — but only when
`ASSISTANT_HISTORY` consent is granted (§2's persistence gate applies
here too; no separate analytics-only write path bypasses that consent).
When history isn't persisted, the classification still runs (cheap,
pure, no DB write) but its result is discarded — it existing only to
keep the code path uniform, not to sneak analytics past the consent
gate. No event is fired to any pipeline; `no_health_text` stays a
documentation note (this classifier's output is categorical, never the
message text) until E12 actually exists.

## 10. UI (deferred to a separate `banani-design-implementation` pass)

No UI is built in this plan. `/app/assistant`'s existing
`ComingSoonPage` placeholder stays until that pass. The Banani
`Assistant.jsx` screen (static mock: `AssistantChatMessages` +
`AssistantSidebarTopics`, no functional wiring in the source) was
already fetched and structurally extracted in a prior session — ready
to consume this endpoint once that pass starts.

## 11. Testing

- `system-prompt.ts` — asserts presence of each key prohibition phrase
  (not a fragile full-text snapshot).
- `output-filter.ts` — one case per red-line pattern (caught) + benign
  text passthrough cases (unmodified).
- `context-summary.ts` — pure formatting, various input combinations
  (no prediction, prediction only, prediction + eligible insights, no
  insights).
- `intent-classifier.ts` — representative examples per category
  including the `OTHER` fallback.
- `quota.ts` — thin wrapper test over the already-tested
  `RateLimitStore`.
- `client.ts` — `AssistantNotConfiguredError` thrown when
  `ANTHROPIC_API_KEY` is empty; no real network call in tests (the
  Anthropic SDK is mocked at the route-test level, matching how
  `payments/bictorys.ts` and other external-provider clients are
  tested elsewhere in this codebase).
- `route.test.ts` — auth/CSRF, quota exceeded → 429, missing API key →
  503, consent-gated persistence (both branches), SSE response shape,
  `assistant_used` event fired with the right shape and never containing
  raw message text.
