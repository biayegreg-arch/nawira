# E11 Admin — Content CMS + Support Tickets — Design Spec

## 0. Scope of this spec

E11 "Admin" (PRD §18 Back-office) is tracked as partially shipped: pricing management and the
admin overview page landed earlier this session. Per the user's own status tracking, exactly
two pieces remain absent — **CMS de contenu** and **support/tickets** — and this spec covers
only those two, decided during brainstorming:

1. **Content CMS**: a generic `Article` model + admin CRUD (create/edit/publish). No consumer-
   facing display page yet, no locale field, no migration of existing hardcoded content.
2. **Support tickets**: a full in-app ticket system. A user submits a request from `/app/help`
   (replacing the current `mailto:support@nawira.app` link), an admin sees a queue, replies,
   and changes status. Includes masked-by-default account info in the ticket detail view,
   satisfying the PRD's "recherche compte support par identifiant sécurisé" + "masquage par
   défaut des données sensibles" bullets without a separate standalone lookup tool.

**Explicitly out of scope for this spec** (confirmed during brainstorming):

- **Feature flags, algorithm-version tracking, an incidents dashboard, and an admin-side
  export/deletion view** — the other four unshipped PRD §18 bullets. Not part of "finishing
  E11" per the user's own status line; each is a separate future item if ever needed.
- **"Vue paiements et webhooks"** — the PRD's back-office bullet for a payments/webhooks view
  is now permanently moot: payments-bictorys, withdrawals, and webhooks-bictorys were pruned
  wholesale from this fork earlier in this same session (unused starter scaffolding — no
  NAWIRA feature ever used them). Not resurrected here or anywhere.
- **Multi-locale content.** `Article` ships French-only, no `locale` field. Wolof/English
  support (PRD §19) is architecture the PRD says should be "ready", not built — adding a
  locale field later is a small additive migration, not a redesign, so there's no cost to
  deferring it.
- **Migrating existing hardcoded content** (help-center FAQ, conception tips, Projet Bébé
  resources) onto the new `Article` model. The CMS ships as an authoring tool; wiring it to
  real consumer-facing pages is separate future work, tracked in `.planning/banani/STATUS.md`
  under "Pending" rather than built now.
- **Real-time ticket updates (Ably).** Considered and rejected for v1 — no other admin list
  page in this app is live-updating (audit-log, outbox, email-queue are all manual-refresh),
  and a low-volume MVP support inbox doesn't need push; CLAUDE.md's Ably guidance targets
  chat/presence-scale needs, not this. Admin refreshes the queue like every other admin list.

## 1. Context found during brainstorming

- No `Article`, `Ticket`, `SupportRequest`, or `Content` model exists anywhere in
  `frontend/prisma/schema.prisma` (25 models total as of this session) — this is genuinely
  greenfield, no code to migrate away from.
- `frontend/src/app/app/help/page.tsx` currently renders a hardcoded FAQ from
  `frontend/src/lib/help-content.ts` (`HELP_CATEGORIES: HelpCategory[]`, each question typed
  `{ q: string; a: string }`) plus a single `<a href="mailto:support@nawira.app">` contact
  block — no request of any kind is ever persisted server-side today. This spec replaces only
  the contact block; the FAQ accordion stays as-is (explicitly out of scope above).
- Two other pages carry hardcoded educational content with different shapes (`CONCEPTION_FULL_TIPS`
  with an emoji `icon` field + Tailwind category-color classes in
  `frontend/src/components/baby/conception-tips-full.ts`; a `FILTERS` category list in
  `frontend/src/app/app/baby/resources/page.tsx`) — confirms these are three independently-
  shaped hardcoded content sources, not one existing "content model" to extend. Left untouched
  per the confirmed CMS scope.
- Admin conventions established across this session, reused as-is:
  - `requireAdmin('ADMIN')` / `requireSuperadmin()` middleware HOFs
  - `verifyCsrf(req)` on every mutating route
  - `logAdminAction(prisma | tx, {...})` on every admin mutation — non-negotiable per CLAUDE.md
  - Stable `{error: CODE, message}` error bodies
  - Cursor pagination via `frontend/src/lib/server/pagination/paginate.ts`
    (`clampLimit`/`cursorWhere`/`buildPage`) — **hardcoded to `(createdAt, id)` composite
    ordering** (`buildPage<T extends { id: string; createdAt: Date }>`). The admin ticket
    queue therefore sorts by `createdAt desc` like every other admin list (users, audit-log,
    outbox, email-queue) — not by "most recently active" (`updatedAt`) — to reuse the shared
    helper unmodified rather than forking it for one route. Admins use the `status` filter to
    find what needs attention.
  - `admin/users/route.ts`'s combined-filter pattern: `where = cursor ? { AND: [baseWhere,
    cursorWhere(cursor)] } : baseWhere` — reused for the admin ticket queue's status filter.
  - The `can: string[]` capability list from `GET /api/admin/me` (`CAPABILITIES_BY_ROLE`,
    just corrected this session to a 7-item ADMIN / 12-item SUPERADMIN contract after removing
    three stale capabilities left over from the payments/withdrawals prune).
- Outbox + email pattern (`frontend/src/lib/server/outbox/`), confirmed by reading
  `types.ts` + `dispatcher.ts` + the signup route's call site: `enqueueOutbox(tx, { kind,
  payload })` inside a transaction; `OutboxEvent` is a closed union in `types.ts` the
  dispatcher `switch`es on by exact `kind` match; each case lazy-imports a template renderer
  from `auth/email-templates.ts` and calls `deps.emailQueue.enqueue({ to, subject, html })`.
  This spec adds one new variant, `EmailSupportTicketReplyEvent` (kind
  `'email.support_ticket_reply'`), plus one new case in the dispatcher's switch, plus one new
  template function.
- `createNotification(prisma, input)` (`frontend/src/lib/server/notifications/index.ts`) is
  the single entry point for `Notification` rows — `dedupeKey` is the unique at-most-once
  delivery gate. `templates.ts` holds typed wrappers per notification type — this spec adds
  `supportTicketReplied(userId, ticketId, messageId)`.
- `requireAuth(authHeader?: string | null)` — cookie-first, optional `Authorization: Bearer`
  fallback. Confirmed two call shapes already in use: `requireAuth()` (GET, cookie-only, e.g.
  `notifications/route.ts`) and `requireAuth(req.headers.get('authorization'))` (mutating
  routes, e.g. `account/route.ts`). This spec's consumer routes follow the `notifications/
  route.ts` shape exactly (same resource class: user-owned, list + mutate).
- `AdminAction.actor` and `AssistantConversation`/`AssistantMessage` are the two closest
  existing Prisma precedents (audit-actor `onDelete: Restrict`; conversation/message parent-
  child shape with cascade + `@@index([parentId, createdAt])`) — both reused directly below.

## 2. Data model

```prisma
model SupportTicket {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  subject   String
  status    String   @default("OPEN") // OPEN | IN_PROGRESS | RESOLVED | CLOSED
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  messages SupportTicketMessage[]

  @@index([status, createdAt])
  @@index([userId, createdAt])
}

model SupportTicketMessage {
  id        String        @id @default(cuid())
  ticketId  String
  ticket    SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  authorId  String
  author    User          @relation(fields: [authorId], references: [id], onDelete: Restrict)
  role      String        // USER | ADMIN
  body      String        @db.Text
  createdAt DateTime      @default(now())

  @@index([ticketId, createdAt])
}

model Article {
  id          String    @id @default(cuid())
  title       String
  slug        String    @unique
  body        String    @db.Text
  status      String    @default("DRAFT") // DRAFT | PUBLISHED
  authorId    String
  author      User      @relation(fields: [authorId], references: [id], onDelete: Restrict)
  publishedAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([status, publishedAt])
}
```

`onDelete: Restrict` on both author-style FKs (`SupportTicketMessage.author`, `Article.author`)
mirrors `AdminAction.actor` — an admin who wrote a reply or an article can't be hard-deleted
while it exists. In practice this is a non-issue today: the account-deletion path
(`deleteAccount()`, E8 Part B) is self-service-only and only ever runs for `role: 'USER'`
accounts (confirmed this session — the just-completed test-account cleanup only ever targeted
`role: 'USER'` rows), so an ADMIN/SUPERADMIN row is never a deletion target through that path.

`SupportTicket.userId` uses `onDelete: Cascade` (matching every other user-owned model, e.g.
`AssistantConversation.user`) — if a user's account is ever hard-deleted, their tickets and
message history go with it. This is consistent with existing behavior for every other piece of
a deleted user's data.

A single migration adds both new models — no existing table/column changes, so no data
backfill is needed (unlike the plan-pricing migration, which added a column to `Profile`).

## 3. Support tickets — API surface

### 3.1 Consumer routes (`requireAuth()`, no CSRF on GET, `verifyCsrf(req)` on POST)

**`POST /api/support-tickets`** — create a ticket + its first message in one transaction.

Request: `{ "subject": "Je n'arrive pas à..." , "message": "Détail du problème..." }`. Zod:
`subject` non-empty string, `max(200)`; `message` non-empty string, `max(5000)`.

Behavior: `prisma.$transaction` creates the `SupportTicket` (`status: 'OPEN'`) and its first
`SupportTicketMessage` (`role: 'USER'`, `authorId: userId`). No `AdminAction` (not an admin
action) and no outbox/notification (nothing to notify the user about their own message).
Response: `201 { "ticket": { "id", "subject", "status", "createdAt" } }`.

**`GET /api/support-tickets`** — the caller's own tickets, cursor-paginated
(`clampLimit`/`cursorWhere`/`buildPage`, `where: { userId }`, `orderBy: [{ createdAt: 'desc'
}, { id: 'desc' }]`). Response shape matches every other list route:
`{ items: [...], nextCursor: string | null }`. Each item: `{ id, subject, status, createdAt,
updatedAt }` (no message bodies — list view only).

**`GET /api/support-tickets/[id]`** — full thread. 404 `TICKET_NOT_FOUND` if the ticket
doesn't exist *or* belongs to a different user (same non-enumeration reasoning as org
membership 404s elsewhere in this codebase — never leak "this ticket exists but isn't yours"
via a 403). Response: `{ ticket: { id, subject, status, createdAt }, messages: [{ id, role,
body, createdAt, authorEmail }] }`. `authorEmail` resolved via the `author` relation so the
user can tell which messages are admin replies vs. their own (an admin's real email, not
masked — the masking requirement applies to the *admin's view of the user*, not the reverse).

**`POST /api/support-tickets/[id]/messages`** — reply on an open thread. 404
`TICKET_NOT_FOUND` (same ownership check as above). 409 `TICKET_CLOSED` if `status` is
`RESOLVED` or `CLOSED` (a closed ticket doesn't silently reopen from a stray user reply — they
see a clear "this ticket is closed" state client-side and would need a new ticket). Zod:
`message` non-empty, `max(5000)`. Creates a `SupportTicketMessage` (`role: 'USER'`) — no status
change, no notification to the admin (admins re-poll the queue like every other admin list; no
per-admin "assigned to me" concept exists in this spec, so there's no single recipient to
notify). Response: `201 { "message": { "id", "body", "createdAt" } }`.

### 3.2 Admin routes

**`GET /api/admin/support-tickets`** — `requireAdmin('ADMIN')`. Query params: `?status`
(optional exact match), `?cursor`, `?limit`. `where = cursor ? { AND: [baseWhere,
cursorWhere(cursor)] } : baseWhere` where `baseWhere = status ? { status } : {}` — mirrors
`admin/users/route.ts`'s fixed combined-filter bug precedent exactly (don't let a flat spread
let `cursorWhere`'s `OR` clobber a status filter on paginated results). `orderBy: [{ createdAt:
'desc' }, { id: 'desc' }]`. Each item includes `userEmailMasked` (see §3.4) instead of the raw
email, plus `subject, status, createdAt, updatedAt`, and a `messageCount` (via
`_count: { select: { messages: true } }`) so the queue shows activity at a glance without a
join per row.

**`GET /api/admin/support-tickets/[id]`** — `requireAdmin('ADMIN')`. Full thread, same shape
as the consumer route's detail response, plus the reporting user's info masked by default (see
§3.4). 404 `TICKET_NOT_FOUND` if missing.

**`POST /api/admin/support-tickets/[id]/messages`** — `requireAdmin('ADMIN')`,
`verifyCsrf(req)`. Zod: `message` non-empty, `max(5000)`. Single transaction:

1. Create `SupportTicketMessage` (`role: 'ADMIN'`, `authorId: adminId`).
2. If `status === 'OPEN'`, update to `'IN_PROGRESS'` (a reply always implies work has started —
   an admin who wants to immediately resolve still calls the explicit status route below rather
   than relying on a reply to also close the ticket, keeping the two actions independent).
3. `logAdminAction(tx, { actorId, action: 'support_ticket.reply', targetType: 'SupportTicket',
   targetId: id, metadata: { messageId } })`.
4. `enqueueOutbox(tx, { kind: 'email.support_ticket_reply', payload: { to: user.email, subject,
   ticketId: id } })` (§4).
5. `createNotification(tx, supportTicketReplied(userId, ticketId, messageId))` (§4) — same tx,
   consistent with every other "state change + side effect" mutation in this codebase never
   using a postCommit closure.

Response: `201 { "message": { "id", "body", "createdAt" }, "status": "IN_PROGRESS" }`.

**`PATCH /api/admin/support-tickets/[id]/status`** — `requireAdmin('ADMIN')`,
`verifyCsrf(req)`. Body: `{ "status": "RESOLVED" }`, Zod enum `'OPEN' | 'IN_PROGRESS' |
'RESOLVED' | 'CLOSED'`. Idempotent no-op (200, no `AdminAction` write) when unchanged — mirrors
the plan-change route's audit-log-noise mitigation from the admin-premium-management spec.
On an actual change: `prisma.supportTicket.update` + `logAdminAction(prisma, { action:
'support_ticket.status_change', targetType: 'SupportTicket', targetId: id, metadata: { from,
to } })`. No notification/email on a bare status change (only a reply is considered
notification-worthy — a silent "marked resolved" with no reply would be confusing to a user
who's still waiting on an answer, so this route deliberately does not notify; an admin who
wants to close *with* an explanation uses the reply route, then the status route).

### 3.3 Capability list changes (`GET /api/admin/me`)

`CAPABILITIES_BY_ROLE` grows from 7→11 (ADMIN) and 12→16 (SUPERADMIN) — both roles get the same
four new entries, no SUPERADMIN-only gate (content/support aren't financial or role/security
sensitive like `pricing:write` or `users:role`). Matches the existing pattern where every admin
resource gets its own capability even when both roles currently have identical access to it
(e.g. `outbox:read`, `email-queue:read`, `rate-limits:read` today):

- `support-tickets:read` — both.
- `support-tickets:reply` — both (covers both the reply and status-change routes; one
  capability governs "can act on a ticket", not split further — no UI element needs to
  distinguish "can reply" from "can change status" independently).
- `content:read` — both (§5.4 admin articles list/detail).
- `content:write` — both (§5.4 admin articles create/edit/publish/delete).

The route's own docstring (`CAPABILITY LIST CONTRACT (D-ADMIN-04 — locked)`) is updated in the
same edit, same as every prior capability addition this session.

### 3.4 PII masking (satisfies "masquage par défaut des données sensibles")

A small pure helper, `frontend/src/lib/server/support/mask-email.ts`:

```ts
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const visible = local.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(local.length - 1, 3))}@${domain}`;
}
```

Both admin ticket routes (§3.2) return `userEmailMasked: maskEmail(user.email)` by default —
never the raw email in the list or detail payload. A separate action, **`POST
/api/admin/support-tickets/[id]/reveal`** (`requireAdmin('ADMIN')`, `verifyCsrf(req)`), returns
`{ email: user.email }` on demand and calls `logAdminAction(prisma, { action:
'support_ticket.reveal_pii', targetType: 'SupportTicket', targetId: id })` — every unmask is
audited, satisfying "recherche compte support par identifiant sécurisé" (the admin can look up
exactly who they're helping) without ever defaulting to exposing it.

## 4. Notification + email plumbing

**`frontend/src/lib/server/outbox/types.ts`** — `OutboxEvent` union grows to include:

```ts
export interface EmailSupportTicketReplyEvent {
  kind: 'email.support_ticket_reply';
  payload: {
    to: string;
    subject: string;
    ticketId: string;
  };
}
```

**`frontend/src/lib/server/outbox/dispatcher.ts`** (PROTECTED file — this is a surgical edit,
not a rewrite, same pattern as every prior addition to this file's `switch`): one new `case
'email.support_ticket_reply'` that lazy-imports a new `supportTicketReplyEmail()` template and
calls `deps.emailQueue.enqueue(...)`, structurally identical to the existing
`email.verification_code` / `email.password_reset` cases.

**`frontend/src/lib/server/auth/email-templates.ts`** — new `supportTicketReplyEmail(args: {
ticketId: string }): EmailTemplate` function, subject `"Réponse à votre demande de support
NAWIRA"`, body links to `/app/support/${ticketId}` (§5). Despite living in `auth/`
(established file, not renamed — the file already holds the project's two other transactional
email templates and CLAUDE.md doesn't list it as protected, but splitting it into a
provider-neutral `notifications/email-templates.ts` is an unrelated refactor this spec doesn't
need to make).

**`frontend/src/lib/server/notifications/templates.ts`** — new typed wrapper:

```ts
export function supportTicketReplied(
  userId: string,
  ticketId: string,
  messageId: string,
): CreateNotificationInput {
  return {
    userId,
    type: 'SUPPORT_TICKET_REPLIED',
    title: 'Réponse à votre demande',
    body: 'Un membre de notre équipe a répondu à votre demande de support.',
    dedupeKey: `support-ticket-reply:${messageId}`,
    data: { ticketId },
  };
}
```

`dedupeKey` is keyed on `messageId` (not `ticketId`) so each individual reply notifies once,
matching the existing dedup contract ("deterministic for the dedup window", never a random
suffix, per the file's own docstring).

## 5. UI

### 5.1 Consumer: `/app/help` contact block replacement

The existing "Contacte notre équipe" card (`frontend/src/app/app/help/page.tsx`) swaps its
`mailto:` link for a short form (subject + message) that `POST`s to `/api/support-tickets`, then
routes to the new `/app/support/[id]` thread view on success. The FAQ accordion above it is
untouched.

### 5.2 New consumer pages: `/app/support` (list) + `/app/support/[id]` (thread)

"Mes demandes" — a simple list (subject, status badge, last-updated) linking into a thread view
that renders the message history and a reply box (disabled with an explanatory line when
`status` is `RESOLVED`/`CLOSED`, matching the 409 `TICKET_CLOSED` the API already enforces).
Reuses the existing `Badge` component for status.

### 5.3 New admin page: `/admin/support`

List page matching the established shape (`AdminListSkeleton` loading state, cursor
pagination with a "Voir tout" pattern, status filter dropdown). Clicking a row opens a detail
view (either a dedicated `/admin/support/[id]` page or `RecordDetailModal` — a route-based page
is preferred here over the shared modal, since a ticket thread with a reply box is materially
richer than the outbox/audit-log/email-queue record views `RecordDetailModal` was built for;
reusing it would mean extending a shared component for one very different consumer, worse than
one small dedicated page). Shows: masked email + "Révéler" button (§3.4), message thread,
reply textarea + send button, status `<select>` (separate from the reply action, matching the
API's separation of concerns from §3.2).

### 5.4 New admin page: `/admin/articles`

List + inline create/edit, matching `/admin/pricing`'s established shape (this session):
table of articles (title, status badge, updated date), a "Nouvel article" button opening a
simple form (title, slug — auto-generated from title via the existing
`frontend/src/lib/server/slug.ts` helper, editable — body as a plain `<textarea>`, no rich-text
editor for v1), and a publish/unpublish toggle per row.

**`GET/POST /api/admin/articles`** + **`GET/PATCH/DELETE /api/admin/articles/[id]`** —
`requireAdmin('ADMIN')` for all (no SUPERADMIN gate — content isn't financial/security
sensitive like pricing). `POST`/`PATCH`/`DELETE` require `verifyCsrf(req)` and call
`logAdminAction`. `slug` uniqueness violation → `409 SLUG_TAKEN`. Publishing (`PATCH` with
`status: 'PUBLISHED'`) sets `publishedAt: new Date()` only on the FREE→PUBLISHED transition
(re-publishing after an edit doesn't reset the original publish date — mirrors how most CMSes
treat "first published" as distinct from "last updated", using the model's own `updatedAt` for
the latter).

### 5.5 Nav

Two new `ADMIN_NAV` entries in `frontend/src/components/admin/admin-nav.ts`: "Articles" (icon:
`FileText`) and "Support" (icon: `MessageCircle` or `LifeBuoy` — pick whichever isn't already
imported elsewhere in the file, verified against the installed `lucide-react` version at
implementation time). The Support entry shows an open-ticket count badge, computed from a new
field on the existing `/api/admin/stats` response (`openTicketCount: prisma.supportTicket.count({
where: { status: 'OPEN' } })`, added to the `Promise.all` alongside the existing two counts —
reuses the route rather than adding a new one for a single extra number).

## 6. Error handling summary

| Code | Route | Cause |
|---|---|---|
| `VALIDATION_FAILED` | `POST /api/support-tickets` | empty/oversized `subject` or `message` |
| `TICKET_NOT_FOUND` | `GET/POST .../support-tickets/[id]...` (consumer + admin) | missing, or (consumer only) belongs to a different user |
| `TICKET_CLOSED` (409) | `POST /api/support-tickets/[id]/messages` | ticket `status` is `RESOLVED` or `CLOSED` |
| `VALIDATION_FAILED` | `PATCH .../support-tickets/[id]/status` | invalid status enum value |
| `VALIDATION_FAILED` | `POST/PATCH /api/admin/articles...` | empty title/body, or malformed slug |
| `SLUG_TAKEN` (409) | `POST/PATCH /api/admin/articles...` | slug not unique |
| `ARTICLE_NOT_FOUND` | `GET/PATCH/DELETE /api/admin/articles/[id]` | missing id |

## 7. Testing plan

Mirrors this session's `PATCH /api/admin/users/[id]/plan` coverage shape:

- **Consumer ticket routes**: unauth 401, CSRF failure on mutating routes, validation
  failures, create writes ticket+first-message atomically, list scoped to `userId`, detail
  404s for another user's ticket (never 403 — non-enumeration), reply 409 on closed ticket,
  reply succeeds on open/in-progress ticket.
- **Admin ticket routes**: non-admin 403, list filter+cursor combination (mirrors the exact
  `admin/users/route.ts` combined-filter regression test from this session), reply writes
  message + transitions OPEN→IN_PROGRESS + writes AdminAction + enqueues outbox event + creates
  notification (all four asserted in one test, all in the same tx), reply on an already
  IN_PROGRESS/RESOLVED ticket does NOT re-transition status, status-change idempotent no-op
  (asserts no AdminAction write), successful status change, reveal-PII writes AdminAction and
  returns the real email, list/detail never include the raw email un-revealed.
- **Outbox dispatcher** (scoped re-test of the existing `dispatcher.test.ts`, additive): new
  case dispatches `supportTicketReplyEmail()` and calls `emailQueue.enqueue`, same
  claim/backoff/lifecycle assertions already covered generically.
- **Admin article routes**: non-admin 403, CSRF failure, validation failures, slug uniqueness
  409, auto-slug generation from title, publish sets `publishedAt` only on first publish
  (re-publish after edit leaves the original `publishedAt` untouched), list/detail/delete.
- **`GET /api/admin/me`**: four new capabilities present for both roles, existing capability
  counts (7 ADMIN / 12 SUPERADMIN) become 11/16 — update the exact-list assertions the same way
  this session's `orders:read`/`withdrawals:read`/`withdrawals:cancel` cleanup just did.

## 8. Out-of-scope confirmation (restated)

No feature flags, no algorithm-version tracking, no incidents dashboard, no admin-side export/
deletion view, no payments/webhooks view (permanently moot post-prune), no multi-locale
content, no migration of the three existing hardcoded content sources onto `Article`, no
real-time ticket updates. Each remains a legitimate, separate future item this spec's data
model does not block.
