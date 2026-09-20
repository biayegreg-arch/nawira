# E11 Admin — Content CMS + Support Tickets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two pieces the user's own E11 status tracking marks absent — a generic `Article` content-CMS admin tool, and a full in-app support-ticket system (consumer submit/reply, admin queue/reply/status, masked-by-default PII with an audited reveal action).

**Architecture:** Two new independent Prisma models (`Article`; `SupportTicket` + `SupportTicketMessage`). Support tickets get consumer routes (`/api/support-tickets*`) and admin routes (`/api/admin/support-tickets*`); articles get admin-only CRUD (`/api/admin/articles*`). An admin reply enqueues an existing-pattern outbox email event plus an in-app `Notification`, both inside the same transaction as the reply write. Admin UI reuses established primitives (`AdminListSkeleton`, `Badge`, `Skeleton`) and the `/admin/pricing` page's shape; consumer UI adds two small pages under `/app/support` and swaps the `mailto:` block on `/app/help`.

**Tech Stack:** Next.js 16 Route Handlers, Prisma 5, Zod, Vitest + `vitest-mock-extended` (`prismaMock`), the existing outbox/notification/email-queue infrastructure.

**Spec:** `docs/superpowers/specs/2026-09-20-e11-admin-cms-support-design.md`

## Global Constraints

- Every new Route Handler: `export const runtime = 'nodejs'`.
- Every mutating route (`POST`/`PATCH`/`DELETE`): `verifyCsrf(req)` at the top, before any auth check.
- Consumer routes use `requireAuth()` with no argument (cookie-only — matches `notifications/route.ts`'s exact call shape), never `requireAuth(req.headers.get('authorization'))`.
- Every admin mutation MUST call `logAdminAction(prisma | tx, {...})`. Skipping it is a compliance regression per CLAUDE.md.
- Admin ticket list/detail responses NEVER include the raw user email — only `userEmailMasked` via `maskEmail()`. The raw email is returned ONLY by `POST /api/admin/support-tickets/[id]/reveal`, and every reveal call is audited via `logAdminAction`.
- A consumer accessing another user's ticket gets 404 `TICKET_NOT_FOUND`, never 403 — non-enumeration (matches the org-membership 404 convention elsewhere in this codebase).
- The admin ticket queue and the admin article list both sort by `createdAt desc` (never `updatedAt`) — the shared pagination helper (`frontend/src/lib/server/pagination/paginate.ts`, `buildPage<T extends { id: string; createdAt: Date }>`) is hardcoded to that shape and this plan reuses it unmodified rather than forking it.
- `PATCH /api/admin/support-tickets/[id]/status` and `POST /api/admin/support-tickets/[id]/messages` (admin reply) are independent actions. A reply only ever auto-transitions `OPEN → IN_PROGRESS`, never to `RESOLVED`/`CLOSED` — an admin who wants to close after replying calls the status route as a second, explicit action.
- The outbox event and the `Notification` row from an admin reply are created **inside the same `prisma.$transaction`** as the reply write and the status transition — never as a postCommit closure (project-wide invariant per CLAUDE.md).
- `frontend/src/lib/server/outbox/dispatcher.ts` is a PROTECTED file (per CLAUDE.md) — Task 3 below is an approved surgical edit (one new `switch` case, mirroring the existing two cases exactly), not a rewrite.
- Out of scope, do not build in any task below: feature flags, algorithm-version tracking, an incidents dashboard, an admin-side export/deletion view, a payments/webhooks admin view (permanently moot — pruned this session), a `locale` field on `Article`, migration of the three existing hardcoded content sources (`help-content.ts`, `conception-tips-full.ts`, the resources page) onto `Article`, or any real-time/Ably wiring.
- FCFA/money invariants don't apply to this plan (no monetary fields) — no task should add one.

---

### Task 1: `SupportTicket`, `SupportTicketMessage`, `Article` Prisma models + migration

**Files:**
- Modify: `frontend/prisma/schema.prisma`
- Create: `frontend/prisma/migrations/15_e11_cms_support/migration.sql` (generated, not hand-edited — no seed data needed, unlike the plan-pricing migration)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `prisma.supportTicket.*`, `prisma.supportTicketMessage.*`, `prisma.article.*` — every later task's Prisma calls.

- [ ] **Step 1: Add the three models to `schema.prisma`**

In `frontend/prisma/schema.prisma`, find `model PricingPlan` (currently lines 119-126) and its closing `}`. Insert the three new models immediately **after** that `}` and **before** the `// ─── Multi-tenancy primitives ───` comment block that follows:

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
  role      String        // USER | ADMIN — SupportTicketMessage.role, not User.role;
                           // ADMIN here covers both ADMIN and SUPERADMIN back-office users
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

- [ ] **Step 2: Add the three back-relations to `model User`**

In the same file, find `model User`'s relation block (currently lines 41-57), specifically the line:

```prisma
  adminActions           AdminAction[]
```

Add three new lines immediately after it:

```prisma
  adminActions           AdminAction[]
  supportTickets         SupportTicket[]
  supportTicketReplies   SupportTicketMessage[]
  articles               Article[]
```

- [ ] **Step 3: Generate the migration SQL without applying it (shadow-DB workaround)**

This project's Prisma shadow database hits a known replay defect on this schema (sequential-integer migration folder names replay out of lexicographic order) — `prisma migrate dev` fails here. Use the diff-based workaround established by the two most recent schema changes this session (`13_nawira_plan_pricing`, `14_prune_payments_withdrawals_webhooks`). Run from `frontend/`:

```bash
mkdir -p prisma/migrations/15_e11_cms_support
DIRECT_URL=$(grep -E "^DIRECT_URL" .env | sed -E 's/^DIRECT_URL="(.*)"$/\1/')
pnpm exec prisma migrate diff \
  --from-url "$DIRECT_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/15_e11_cms_support/migration.sql
```

Expected: `prisma/migrations/15_e11_cms_support/migration.sql` contains three `CREATE TABLE` statements (`SupportTicket`, `SupportTicketMessage`, `Article`), their foreign keys, and their indexes — no `DROP`/`ALTER` on any existing table (this migration is purely additive, unlike the two precedents which also dropped columns/tables).

- [ ] **Step 4: Apply the migration**

Run from `frontend/`:

```bash
pnpm db:migrate:deploy
pnpm exec prisma generate
```

Expected: "All migrations have been successfully applied." and a regenerated Prisma Client with `supportTicket`, `supportTicketMessage`, and `article` delegates.

- [ ] **Step 5: Verify**

Run: `pnpm db:migrate:status` — expect the new migration listed as applied, nothing pending.
Run: `pnpm typecheck` — expect a clean pass, confirming the regenerated Prisma Client compiles against the new relation fields on `User`.

- [ ] **Step 6: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations/
git commit -m "feat(e11): add SupportTicket, SupportTicketMessage, Article models"
```

---

### Task 2: `maskEmail()` helper

**Files:**
- Create: `frontend/src/lib/server/support/mask-email.ts`
- Test: `frontend/src/lib/server/support/mask-email.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `maskEmail(email: string): string`, consumed by Task 7 (admin queue list) and Task 8 (admin ticket detail).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/server/support/mask-email.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { maskEmail } from './mask-email';

describe('maskEmail', () => {
  it('keeps the first local-part character and masks the rest before @domain', () => {
    expect(maskEmail('gregory@gmail.com')).toBe('g******@gmail.com');
  });

  it('pads short local parts to at least 3 mask characters', () => {
    expect(maskEmail('ab@test.local')).toBe('a***@test.local');
  });

  it('handles a single-character local part', () => {
    expect(maskEmail('a@test.local')).toBe('a***@test.local');
  });

  it('falls back to a generic mask for input with no @', () => {
    expect(maskEmail('not-an-email')).toBe('***');
  });

  it('falls back to a generic mask for an empty string', () => {
    expect(maskEmail('')).toBe('***');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/support/mask-email.test.ts`
Expected: FAIL — `Cannot find module './mask-email'`.

- [ ] **Step 3: Implement**

Create `frontend/src/lib/server/support/mask-email.ts`:

```ts
// Masks an email's local part for display in admin support-ticket views
// (PRD §18 "masquage par défaut des données sensibles"). Never used for
// comparison/lookup — only for what an admin sees before an explicit
// reveal (POST /api/admin/support-tickets/[id]/reveal).
import 'server-only';

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const visible = local.slice(0, 1);
  return `${visible}${'*'.repeat(Math.max(local.length - 1, 3))}@${domain}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/support/mask-email.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/server/support/mask-email.ts frontend/src/lib/server/support/mask-email.test.ts
git commit -m "feat(e11): add maskEmail helper for admin support views"
```

---

### Task 3: Outbox + notification templates for ticket replies

**Files:**
- Modify: `frontend/src/lib/server/outbox/types.ts`
- Modify: `frontend/src/lib/server/outbox/dispatcher.ts` (PROTECTED — approved surgical edit, one new `case`)
- Modify: `frontend/src/lib/server/outbox/dispatcher.test.ts`
- Modify: `frontend/src/lib/server/auth/email-templates.ts`
- Modify: `frontend/src/lib/server/auth/email-templates.test.ts`
- Modify: `frontend/src/lib/server/notifications/templates.ts`
- Modify: `frontend/src/lib/server/notifications/templates.test.ts`

**Interfaces:**
- Consumes: `EmailTemplate` interface (`{ subject, html, text }`) from `email-templates.ts`; `CreateNotificationInput` from `notifications/index.ts`; `EmailQueue.enqueue({ to, subject, html })`.
- Produces: `enqueueOutbox(tx, { kind: 'email.support_ticket_reply', payload: { to, subject, ticketId } })` and `supportTicketReplied(userId, ticketId, messageId): CreateNotificationInput`, both consumed by Task 8 (admin reply route).

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/server/auth/email-templates.test.ts` currently starts with a single import line, `import { verificationEmail, resetPasswordEmail } from './email-templates';`, followed by flat top-level `describe('verificationEmail', ...)` / `describe('resetPasswordEmail', ...)` blocks (no shared setup). Change the import line to:

```ts
import { verificationEmail, resetPasswordEmail, supportTicketReplyEmail } from './email-templates';
```

Then append a new top-level `describe` block after the file's last existing one:

```ts
describe('supportTicketReplyEmail', () => {
  it('renders a subject and a link to the ticket thread', () => {
    const tpl = supportTicketReplyEmail({ ticketId: 'ticket_123' });
    expect(tpl.subject).toBe('Réponse à votre demande de support NAWIRA');
    expect(tpl.html).toContain('/app/support/ticket_123');
    expect(tpl.text).toContain('/app/support/ticket_123');
  });
});
```

`frontend/src/lib/server/notifications/templates.test.ts` currently starts with a multi-line import from `./templates` (one named import per line) followed by flat top-level `describe` blocks per function (`periodReminder`, `journalReminder`, `weeklySummaryReady`, `fertilityWindowApproaching`). Add `supportTicketReplied` as a new line inside that existing multi-line import, then append a new top-level `describe` block after the file's last existing one:

```ts
describe('supportTicketReplied', () => {
  it('returns a CreateNotificationInput keyed by messageId for dedup', () => {
    const input = supportTicketReplied('user_1', 'ticket_1', 'msg_1');
    expect(input).toMatchObject({
      userId: 'user_1',
      type: 'SUPPORT_TICKET_REPLIED',
      dedupeKey: 'support-ticket-reply:msg_1',
      data: { ticketId: 'ticket_1' },
    });
    expect(input.title.length).toBeGreaterThan(0);
    expect(input.body.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/lib/server/auth/email-templates.test.ts src/lib/server/notifications/templates.test.ts`
Expected: FAIL — `supportTicketReplyEmail`/`supportTicketReplied` is not exported.

- [ ] **Step 3: Add `supportTicketReplyEmail` to `email-templates.ts`**

In `frontend/src/lib/server/auth/email-templates.ts`, add after the existing `resetPasswordEmail` function:

```ts
export function supportTicketReplyEmail(args: { ticketId: string }): EmailTemplate {
  const id = htmlEscape(args.ticketId);
  return {
    subject: 'Réponse à votre demande de support NAWIRA',
    html: `<p>Bonjour,</p><p>Un membre de notre équipe a répondu à votre demande de support.</p><p><a href="https://nawira.app/app/support/${id}">Voir la réponse</a></p>`,
    text: `Un membre de notre équipe a répondu à votre demande de support. Voir la réponse : https://nawira.app/app/support/${args.ticketId}`,
  };
}
```

- [ ] **Step 4: Add `supportTicketReplied` to `notifications/templates.ts`**

In `frontend/src/lib/server/notifications/templates.ts`, add after the existing template functions:

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

- [ ] **Step 5: Add the `OutboxEvent` union variant**

In `frontend/src/lib/server/outbox/types.ts`, change:

```ts
export type OutboxEvent = EmailVerificationCodeEvent | EmailPasswordResetEvent;
```

to:

```ts
export type OutboxEvent =
  | EmailVerificationCodeEvent
  | EmailPasswordResetEvent
  | EmailSupportTicketReplyEvent;
```

Then add the new interface after `EmailPasswordResetEvent`:

```ts
/**
 * E11 — emitted by the admin support-ticket reply route; consumed by the
 * email-queue cron (renders via supportTicketReplyEmail() from
 * auth/email-templates.ts).
 */
export interface EmailSupportTicketReplyEvent {
  kind: 'email.support_ticket_reply';
  payload: {
    to: string;
    subject: string;
    ticketId: string;
  };
}
```

- [ ] **Step 6: Write the failing dispatcher test**

Add a new test to `frontend/src/lib/server/outbox/dispatcher.test.ts`, inside the existing `describe('drainOutbox (TEST-02)', ...)` block, after the "marks the row SENT" test:

```ts
it('dispatches email.support_ticket_reply via emailQueue.enqueue', async () => {
  const row = makeRow({
    kind: 'email.support_ticket_reply',
    payload: { to: 'u@test.local', subject: 'Réponse à votre demande de support NAWIRA', ticketId: 'ticket_1' },
  });
  const emailQueue = makeEmailQueue();
  prismaMock.outboxEvent.findMany.mockResolvedValue([{ id: 'oe_1' }] as never);
  prismaMock.outboxEvent.updateMany.mockResolvedValue({ count: 1 } as never);
  prismaMock.outboxEvent.findUnique.mockResolvedValue(row as never);
  prismaMock.outboxEvent.update.mockResolvedValue({} as never);

  const stats = await drainOutbox({ prisma: prismaMock, emailQueue: emailQueue as never });

  expect(stats.succeeded).toBe(1);
  expect(emailQueue.enqueue).toHaveBeenCalledWith({
    to: 'u@test.local',
    subject: 'Réponse à votre demande de support NAWIRA',
    html: expect.stringContaining('ticket_1'),
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/outbox/dispatcher.test.ts`
Expected: FAIL — the `switch` in `dispatchEvent` hits its `default` exhaustiveness branch for the new kind (TypeScript will also fail `pnpm typecheck` at this point, since `types.ts` already declares the new union member but `dispatcher.ts` doesn't handle it yet).

- [ ] **Step 8: Add the dispatcher case**

In `frontend/src/lib/server/outbox/dispatcher.ts`, inside `dispatchEvent`'s `switch (event.kind)`, add a new case immediately after the existing `case 'email.password_reset':` block and before `default:`:

```ts
    case 'email.support_ticket_reply': {
      // E11 — emitted by the admin support-ticket reply route.
      if (!deps.emailQueue) throw new Error('email queue not configured');
      const { supportTicketReplyEmail } = await import('../auth/email-templates');
      const { to, subject, ticketId } = event.payload;
      const tpl = supportTicketReplyEmail({ ticketId });
      await deps.emailQueue.enqueue({ to, subject, html: tpl.html });
      return;
    }
```

Note: `subject` from the payload is intentionally unused by the render call (the template renders its own fixed subject) but is read from `event.payload` so the destructure matches the declared payload shape — pass `subject` through to `deps.emailQueue.enqueue` as shown, not `tpl.subject`, since the outbox event already carries the exact subject the route computed and the template's own `subject` field exists for callers that don't have one to hand (mirrors how `payload.to`, not a re-derived value, is used above).

- [ ] **Step 9: Run all four test files to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/lib/server/auth/email-templates.test.ts src/lib/server/notifications/templates.test.ts src/lib/server/outbox/dispatcher.test.ts`
Run: `pnpm typecheck`
Expected: all PASS, clean typecheck.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/lib/server/outbox/types.ts frontend/src/lib/server/outbox/dispatcher.ts frontend/src/lib/server/outbox/dispatcher.test.ts frontend/src/lib/server/auth/email-templates.ts frontend/src/lib/server/auth/email-templates.test.ts frontend/src/lib/server/notifications/templates.ts frontend/src/lib/server/notifications/templates.test.ts
git commit -m "feat(e11): outbox event + notification template for ticket replies"
```

---

### Task 4: Consumer routes — `POST`/`GET /api/support-tickets`

**Files:**
- Create: `frontend/src/app/api/support-tickets/route.ts`
- Test: `frontend/src/app/api/support-tickets/route.test.ts`

**Interfaces:**
- Consumes: `requireAuth()`, `verifyCsrf(req)`, `prisma.$transaction`, `clampLimit`/`decodeCursor`/`cursorWhere`/`buildPage` from `pagination/paginate.ts`.
- Produces: `POST /api/support-tickets` → `201 { ticket: { id, subject, status, createdAt } }`; `GET /api/support-tickets` → `200 { items: [...], nextCursor }`. The `POST` response's `ticket.id` is what the consumer UI (Task 16) redirects to.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/support-tickets/route.test.ts`:

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { POST, GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);

const userCtx = { user: { sub: 'user_1', email: 'u@test.local' } };

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/support-tickets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeGet(qs = ''): NextRequest {
  return new NextRequest(`http://test/api/support-tickets${qs}`, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(userCtx as never);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('POST /api/support-tickets', () => {
  it('returns the CSRF failure response when verifyCsrf rejects', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }));
    const res = await POST(makePost({ subject: 'x', message: 'y' }));
    expect(res.status).toBe(403);
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });

  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never);
    const res = await POST(makePost({ subject: 'x', message: 'y' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 VALIDATION_FAILED for an empty subject', async () => {
    const res = await POST(makePost({ subject: '', message: 'y' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('returns 400 VALIDATION_FAILED for an empty message', async () => {
    const res = await POST(makePost({ subject: 'x', message: '' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('VALIDATION_FAILED');
  });

  it('creates the ticket and its first message atomically, returns 201', async () => {
    prismaMock.$transaction.mockImplementationOnce(async (cb: unknown) => {
      const tx = {
        supportTicket: {
          create: vi.fn().mockResolvedValue({
            id: 'ticket_1',
            subject: 'Problème de connexion',
            status: 'OPEN',
            createdAt: new Date('2026-09-20T00:00:00.000Z'),
          }),
        },
        supportTicketMessage: { create: vi.fn().mockResolvedValue({ id: 'msg_1' }) },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as (tx: any) => unknown)(tx);
    });

    const res = await POST(makePost({ subject: 'Problème de connexion', message: "Je n'arrive pas à me connecter" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ticket).toMatchObject({ id: 'ticket_1', subject: 'Problème de connexion', status: 'OPEN' });
  });
});

describe('GET /api/support-tickets', () => {
  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it('scopes the list to the authenticated userId', async () => {
    prismaMock.supportTicket.findMany.mockResolvedValue([]);
    await GET(makeGet());
    expect(prismaMock.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_1' } }),
    );
  });

  it('returns items + nextCursor shape', async () => {
    prismaMock.supportTicket.findMany.mockResolvedValue([
      { id: 't1', subject: 'A', status: 'OPEN', createdAt: new Date(), updatedAt: new Date() },
    ] as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('nextCursor');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/support-tickets/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement**

Create `frontend/src/app/api/support-tickets/route.ts`:

```ts
// POST /api/support-tickets — create a ticket + its first message (consumer).
// GET  /api/support-tickets — the caller's own tickets, cursor-paginated.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const CreateBody = z.object({
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const ticket = await prisma.$transaction(async (tx) => {
      const created = await tx.supportTicket.create({
        data: { userId: auth.user.sub, subject: parsed.data.subject, status: 'OPEN' },
      });
      await tx.supportTicketMessage.create({
        data: {
          ticketId: created.id,
          authorId: auth.user.sub,
          role: 'USER',
          body: parsed.data.message,
        },
      });
      return created;
    });

    return NextResponse.json(
      {
        ticket: {
          id: ticket.id,
          subject: ticket.subject,
          status: ticket.status,
          createdAt: ticket.createdAt.toISOString(),
        },
      },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const cursor = decodeCursor(url.searchParams.get('cursor'));
    const baseWhere = { userId: auth.user.sub };
    const where = cursor ? { AND: [baseWhere, cursorWhere(cursor)] } : baseWhere;

    const rows = await prisma.supportTicket.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: { id: true, subject: true, status: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json(buildPage(rows, limit), { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/support-tickets/route.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/support-tickets/route.ts frontend/src/app/api/support-tickets/route.test.ts
git commit -m "feat(e11): POST/GET /api/support-tickets (consumer create + list)"
```

---

### Task 5: Consumer routes — `GET /api/support-tickets/[id]` + `POST .../messages`

**Files:**
- Create: `frontend/src/app/api/support-tickets/[id]/route.ts`
- Test: `frontend/src/app/api/support-tickets/[id]/route.test.ts`
- Create: `frontend/src/app/api/support-tickets/[id]/messages/route.ts`
- Test: `frontend/src/app/api/support-tickets/[id]/messages/route.test.ts`

**Interfaces:**
- Consumes: `requireAuth()`, `verifyCsrf(req)`, `prisma.supportTicket.findFirst/findUnique`, `prisma.supportTicketMessage.create`.
- Produces: `GET /api/support-tickets/[id]` → `200 { ticket, messages }` or `404 TICKET_NOT_FOUND`; `POST /api/support-tickets/[id]/messages` → `201 { message }` or `404`/`409 TICKET_CLOSED`. Both consumed by Task 16 (consumer thread page).

- [ ] **Step 1: Write the failing tests for the thread route**

Create `frontend/src/app/api/support-tickets/[id]/route.test.ts`:

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));

import { requireAuth } from '@/lib/server/middleware';
import { GET } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const userCtx = { user: { sub: 'user_1', email: 'u@test.local' } };

function makeGet(id: string): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    new NextRequest(`http://test/api/support-tickets/${id}`, { method: 'GET' }),
    { params: Promise.resolve({ id }) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(userCtx as never);
});

describe('GET /api/support-tickets/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: 'Missing token' }, { status: 401 }) as never);
    const res = await GET(...makeGet('t1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 TICKET_NOT_FOUND when the ticket does not exist', async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue(null);
    const res = await GET(...makeGet('missing'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('TICKET_NOT_FOUND');
  });

  it('returns 404 TICKET_NOT_FOUND (never 403) when the ticket belongs to another user', async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue(null);
    const res = await GET(...makeGet('someone-elses-ticket'));
    expect(res.status).toBe(404);
    expect(prismaMock.supportTicket.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'someone-elses-ticket', userId: 'user_1' } }),
    );
  });

  it('returns the ticket + message thread with author emails', async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue({
      id: 't1',
      subject: 'Aide',
      status: 'OPEN',
      createdAt: new Date('2026-09-20T00:00:00.000Z'),
      messages: [
        {
          id: 'm1',
          role: 'USER',
          body: 'Bonjour',
          createdAt: new Date('2026-09-20T00:00:00.000Z'),
          author: { email: 'u@test.local' },
        },
      ],
    } as never);
    const res = await GET(...makeGet('t1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticket).toMatchObject({ id: 't1', subject: 'Aide', status: 'OPEN' });
    expect(body.messages[0]).toMatchObject({ id: 'm1', role: 'USER', body: 'Bonjour', authorEmail: 'u@test.local' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run "src/app/api/support-tickets/[id]/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement the thread route**

Create `frontend/src/app/api/support-tickets/[id]/route.ts`:

```ts
// GET /api/support-tickets/[id] — full thread for the ticket's owner.
// 404 (never 403) when the ticket doesn't exist or belongs to another
// user — non-enumeration.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await routeCtx.params;
    const ticket = await prisma.supportTicket.findFirst({
      where: { id, userId: auth.user.sub },
      select: {
        id: true,
        subject: true,
        status: true,
        createdAt: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            body: true,
            createdAt: true,
            author: { select: { email: true } },
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: 'TICKET_NOT_FOUND', message: 'Ticket not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      {
        ticket: { id: ticket.id, subject: ticket.subject, status: ticket.status, createdAt: ticket.createdAt.toISOString() },
        messages: ticket.messages.map((m) => ({
          id: m.id,
          role: m.role,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
          authorEmail: m.author.email,
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run "src/app/api/support-tickets/[id]/route.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Write the failing tests for the reply route**

Create `frontend/src/app/api/support-tickets/[id]/messages/route.test.ts`:

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

import { requireAuth } from '@/lib/server/middleware';
import { verifyCsrf } from '@/lib/server/auth';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const userCtx = { user: { sub: 'user_1', email: 'u@test.local' } };

function makePost(id: string, body: unknown): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    new NextRequest(`http://test/api/support-tickets/${id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(userCtx as never);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('POST /api/support-tickets/[id]/messages', () => {
  it('returns the CSRF failure response when verifyCsrf rejects', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }));
    const res = await POST(...makePost('t1', { message: 'hi' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 VALIDATION_FAILED for an empty message', async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue({ id: 't1', status: 'OPEN' } as never);
    const res = await POST(...makePost('t1', { message: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 TICKET_NOT_FOUND when the ticket is missing or belongs to another user', async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue(null);
    const res = await POST(...makePost('t1', { message: 'hi' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('TICKET_NOT_FOUND');
  });

  it('returns 409 TICKET_CLOSED when the ticket status is RESOLVED', async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue({ id: 't1', status: 'RESOLVED' } as never);
    const res = await POST(...makePost('t1', { message: 'hi' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('TICKET_CLOSED');
  });

  it('returns 409 TICKET_CLOSED when the ticket status is CLOSED', async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue({ id: 't1', status: 'CLOSED' } as never);
    const res = await POST(...makePost('t1', { message: 'hi' }));
    expect(res.status).toBe(409);
  });

  it('creates the message and returns 201 for an OPEN ticket', async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue({ id: 't1', status: 'OPEN' } as never);
    prismaMock.supportTicketMessage.create.mockResolvedValue({
      id: 'm2',
      body: 'Merci',
      createdAt: new Date('2026-09-20T00:00:00.000Z'),
    } as never);
    const res = await POST(...makePost('t1', { message: 'Merci' }));
    expect(res.status).toBe(201);
    expect(prismaMock.supportTicketMessage.create).toHaveBeenCalledWith({
      data: { ticketId: 't1', authorId: 'user_1', role: 'USER', body: 'Merci' },
    });
  });

  it('creates the message and returns 201 for an IN_PROGRESS ticket', async () => {
    prismaMock.supportTicket.findFirst.mockResolvedValue({ id: 't1', status: 'IN_PROGRESS' } as never);
    prismaMock.supportTicketMessage.create.mockResolvedValue({
      id: 'm3',
      body: 'Merci',
      createdAt: new Date(),
    } as never);
    const res = await POST(...makePost('t1', { message: 'Merci' }));
    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run "src/app/api/support-tickets/[id]/messages/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 7: Implement the reply route**

Create `frontend/src/app/api/support-tickets/[id]/messages/route.ts`:

```ts
// POST /api/support-tickets/[id]/messages — the ticket owner replies on
// their own open/in-progress thread. 404 on ownership mismatch (never
// 403). 409 TICKET_CLOSED once the admin has resolved/closed it.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ message: z.string().trim().min(1).max(5000) });

export async function POST(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await routeCtx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const ticket = await prisma.supportTicket.findFirst({
      where: { id, userId: auth.user.sub },
      select: { id: true, status: true },
    });
    if (!ticket) {
      return NextResponse.json(
        { error: 'TICKET_NOT_FOUND', message: 'Ticket not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
      return NextResponse.json(
        { error: 'TICKET_CLOSED', message: 'This ticket is closed' },
        { status: 409, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const message = await prisma.supportTicketMessage.create({
      data: { ticketId: id, authorId: auth.user.sub, role: 'USER', body: parsed.data.message },
    });

    return NextResponse.json(
      { message: { id: message.id, body: message.body, createdAt: message.createdAt.toISOString() } },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run "src/app/api/support-tickets/[id]/messages/route.test.ts"`
Expected: PASS (7 tests).

- [ ] **Step 9: Commit**

```bash
git add "frontend/src/app/api/support-tickets/[id]/route.ts" "frontend/src/app/api/support-tickets/[id]/route.test.ts" "frontend/src/app/api/support-tickets/[id]/messages/route.ts" "frontend/src/app/api/support-tickets/[id]/messages/route.test.ts"
git commit -m "feat(e11): consumer ticket thread + reply routes"
```

---

### Task 6: Admin route — `GET /api/admin/support-tickets` (queue)

**Files:**
- Create: `frontend/src/app/api/admin/support-tickets/route.ts`
- Test: `frontend/src/app/api/admin/support-tickets/route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin('ADMIN')`, `enforceAdminRateLimit`, `maskEmail()` (Task 2), `clampLimit`/`cursorWhere`/`buildPage`/`decodeCursor`.
- Produces: `GET /api/admin/support-tickets` → `200 { items: [{ id, subject, status, createdAt, updatedAt, messageCount, userEmailMasked }], nextCursor }`, consumed by Task 13 (admin queue page).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/admin/support-tickets/route.test.ts`:

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const adminCtx = { user: { sub: 'admin_1', email: 'admin@test.local' }, admin: { id: 'admin_1', email: 'admin@test.local', role: 'ADMIN' as const } };

function makeGet(qs = ''): NextRequest {
  return new NextRequest(`http://test/api/admin/support-tickets${qs}`, { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx as never);
  mockRateLimit.mockResolvedValue(null);
});

describe('GET /api/admin/support-tickets', () => {
  it('returns 403 when the caller is not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }) as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
  });

  it('masks the reporting user email in every row, never returning the raw address', async () => {
    prismaMock.supportTicket.findMany.mockResolvedValue([
      {
        id: 't1',
        subject: 'Aide',
        status: 'OPEN',
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { messages: 2 },
        user: { email: 'gregory@gmail.com' },
      },
    ] as never);
    const res = await GET(makeGet());
    const body = await res.json();
    expect(body.items[0].userEmailMasked).toBe('g******@gmail.com');
    expect(JSON.stringify(body)).not.toContain('gregory@gmail.com');
  });

  it('combines the status filter with cursor pagination via AND (never lets the cursor clobber the filter)', async () => {
    prismaMock.supportTicket.findMany.mockResolvedValue([]);
    await GET(makeGet('?status=OPEN&cursor=eyJjcmVhdGVkQXQiOiIyMDI2LTAxLTAxVDAwOjAwOjAwLjAwMFoiLCJpZCI6InQxIn0='));
    const call = prismaMock.supportTicket.findMany.mock.calls[0]?.[0];
    expect(call?.where).toHaveProperty('AND');
  });

  it('applies the status filter alone when no cursor is given', async () => {
    prismaMock.supportTicket.findMany.mockResolvedValue([]);
    await GET(makeGet('?status=OPEN'));
    expect(prismaMock.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'OPEN' } }),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/support-tickets/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement**

Create `frontend/src/app/api/admin/support-tickets/route.ts`:

```ts
// GET /api/admin/support-tickets — filterable, cursor-paginated queue.
// Never returns the raw reporting-user email — only userEmailMasked.
// See POST .../[id]/reveal for the audited unmask action.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { maskEmail } from '@/lib/server/support/mask-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const status = url.searchParams.get('status');
    const cursor = decodeCursor(url.searchParams.get('cursor'));
    const baseWhere = status ? { status } : {};
    const where = cursor ? { AND: [baseWhere, cursorWhere(cursor)] } : baseWhere;

    const rows = await prisma.supportTicket.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        subject: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
        user: { select: { email: true } },
      },
    });

    const mapped = rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      messageCount: r._count.messages,
      userEmailMasked: maskEmail(r.user.email),
    }));

    return NextResponse.json(buildPage(mapped, limit), { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/support-tickets/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/admin/support-tickets/route.ts frontend/src/app/api/admin/support-tickets/route.test.ts
git commit -m "feat(e11): admin support-ticket queue route"
```

---

### Task 7: Admin route — `GET /api/admin/support-tickets/[id]` (detail)

**Files:**
- Create: `frontend/src/app/api/admin/support-tickets/[id]/route.ts`
- Test: `frontend/src/app/api/admin/support-tickets/[id]/route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin('ADMIN')`, `enforceAdminRateLimit`, `maskEmail()`.
- Produces: `GET /api/admin/support-tickets/[id]` → `200 { ticket: { id, subject, status, createdAt, userEmailMasked }, messages: [{ id, role, body, createdAt }] }` or `404`, consumed by Task 13 (admin thread page).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/admin/support-tickets/[id]/route.test.ts`:

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { GET } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const adminCtx = { user: { sub: 'admin_1', email: 'admin@test.local' }, admin: { id: 'admin_1', email: 'admin@test.local', role: 'ADMIN' as const } };

function makeGet(id: string): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    new NextRequest(`http://test/api/admin/support-tickets/${id}`, { method: 'GET' }),
    { params: Promise.resolve({ id }) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx as never);
  mockRateLimit.mockResolvedValue(null);
});

describe('GET /api/admin/support-tickets/[id]', () => {
  it('returns 403 when the caller is not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }) as never);
    const res = await GET(...makeGet('t1'));
    expect(res.status).toBe(403);
  });

  it('returns 404 TICKET_NOT_FOUND for a missing ticket', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue(null);
    const res = await GET(...makeGet('missing'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('TICKET_NOT_FOUND');
  });

  it('returns the masked email and the message thread without author emails', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue({
      id: 't1',
      subject: 'Aide',
      status: 'OPEN',
      createdAt: new Date('2026-09-20T00:00:00.000Z'),
      user: { email: 'gregory@gmail.com' },
      messages: [{ id: 'm1', role: 'USER', body: 'Bonjour', createdAt: new Date('2026-09-20T00:00:00.000Z') }],
    } as never);
    const res = await GET(...makeGet('t1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticket.userEmailMasked).toBe('g******@gmail.com');
    expect(JSON.stringify(body)).not.toContain('gregory@gmail.com');
    expect(body.messages[0]).toEqual({ id: 'm1', role: 'USER', body: 'Bonjour', createdAt: '2026-09-20T00:00:00.000Z' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run "src/app/api/admin/support-tickets/[id]/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement**

Create `frontend/src/app/api/admin/support-tickets/[id]/route.ts`:

```ts
// GET /api/admin/support-tickets/[id] — full thread for admin triage.
// The reporting user's email is masked by default; POST .../reveal is
// the only route that returns it, and it's audited.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { maskEmail } from '@/lib/server/support/mask-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await routeCtx.params;
    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      select: {
        id: true,
        subject: true,
        status: true,
        createdAt: true,
        user: { select: { email: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, role: true, body: true, createdAt: true },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: 'TICKET_NOT_FOUND', message: 'Ticket not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      {
        ticket: {
          id: ticket.id,
          subject: ticket.subject,
          status: ticket.status,
          createdAt: ticket.createdAt.toISOString(),
          userEmailMasked: maskEmail(ticket.user.email),
        },
        messages: ticket.messages.map((m) => ({
          id: m.id,
          role: m.role,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
        })),
      },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run "src/app/api/admin/support-tickets/[id]/route.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/api/admin/support-tickets/[id]/route.ts" "frontend/src/app/api/admin/support-tickets/[id]/route.test.ts"
git commit -m "feat(e11): admin support-ticket detail route (masked email)"
```

---

### Task 8: Admin route — `POST /api/admin/support-tickets/[id]/messages` (reply)

**Files:**
- Create: `frontend/src/app/api/admin/support-tickets/[id]/messages/route.ts`
- Test: `frontend/src/app/api/admin/support-tickets/[id]/messages/route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin('ADMIN')`, `verifyCsrf(req)`, `logAdminAction` (Task 1's protected file, existing export), `enqueueOutbox` + `EmailSupportTicketReplyEvent` (Task 3), `createNotification` + `supportTicketReplied` (Task 3).
- Produces: `POST /api/admin/support-tickets/[id]/messages` → `201 { message: { id, body, createdAt }, status }` or `404`, consumed by Task 13 (admin thread page).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/admin/support-tickets/[id]/messages/route.test.ts`:

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn(),
}));
vi.mock('@/lib/server/outbox', () => ({
  enqueueOutbox: vi.fn(),
}));
vi.mock('@/lib/server/notifications', () => ({
  createNotification: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enqueueOutbox } from '@/lib/server/outbox';
import { createNotification } from '@/lib/server/notifications';
import { POST } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);
const mockEnqueueOutbox = vi.mocked(enqueueOutbox);
const mockCreateNotification = vi.mocked(createNotification);
const adminCtx = { user: { sub: 'admin_1', email: 'admin@test.local' }, admin: { id: 'admin_1', email: 'admin@test.local', role: 'ADMIN' as const } };

function makePost(id: string, body: unknown): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    new NextRequest(`http://test/api/admin/support-tickets/${id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx as never);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
  prismaMock.$transaction.mockImplementation(async (cb: unknown) => (cb as (tx: unknown) => unknown)(prismaMock));
});

describe('POST /api/admin/support-tickets/[id]/messages', () => {
  it('returns the CSRF failure response when verifyCsrf rejects', async () => {
    mockVerifyCsrf.mockReturnValueOnce(NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 }));
    const res = await POST(...makePost('t1', { message: 'hi' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 when the caller is not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }) as never);
    const res = await POST(...makePost('t1', { message: 'hi' }));
    expect(res.status).toBe(403);
  });

  it('returns 404 TICKET_NOT_FOUND for a missing ticket', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue(null);
    const res = await POST(...makePost('missing', { message: 'hi' }));
    expect(res.status).toBe(404);
  });

  it('writes the message, transitions OPEN to IN_PROGRESS, logs the action, enqueues the email, and creates the notification — all in one transaction', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue({ id: 't1', status: 'OPEN', userId: 'user_1', user: { email: 'u@test.local' } } as never);
    prismaMock.supportTicketMessage.create.mockResolvedValue({ id: 'm2', body: 'Voici la solution', createdAt: new Date('2026-09-20T00:00:00.000Z') } as never);
    prismaMock.supportTicket.update.mockResolvedValue({} as never);

    const res = await POST(...makePost('t1', { message: 'Voici la solution' }));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('IN_PROGRESS');
    expect(prismaMock.supportTicketMessage.create).toHaveBeenCalledWith({
      data: { ticketId: 't1', authorId: 'admin_1', role: 'ADMIN', body: 'Voici la solution' },
    });
    expect(prismaMock.supportTicket.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { status: 'IN_PROGRESS' },
    });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorId: 'admin_1', action: 'support_ticket.reply', targetType: 'SupportTicket', targetId: 't1' }),
    );
    expect(mockEnqueueOutbox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'email.support_ticket_reply', payload: expect.objectContaining({ to: 'u@test.local', ticketId: 't1' }) }),
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: 'user_1', type: 'SUPPORT_TICKET_REPLIED', dedupeKey: 'support-ticket-reply:m2' }),
    );
  });

  it('does NOT re-transition status when the ticket is already IN_PROGRESS', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue({ id: 't1', status: 'IN_PROGRESS', userId: 'user_1', user: { email: 'u@test.local' } } as never);
    prismaMock.supportTicketMessage.create.mockResolvedValue({ id: 'm3', body: 'Suite', createdAt: new Date() } as never);

    const res = await POST(...makePost('t1', { message: 'Suite' }));

    expect(res.status).toBe(201);
    expect(prismaMock.supportTicket.update).not.toHaveBeenCalled();
  });

  it('does NOT re-transition status when the ticket is RESOLVED (admin can still reply)', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue({ id: 't1', status: 'RESOLVED', userId: 'user_1', user: { email: 'u@test.local' } } as never);
    prismaMock.supportTicketMessage.create.mockResolvedValue({ id: 'm4', body: 'Reouvert', createdAt: new Date() } as never);

    const res = await POST(...makePost('t1', { message: 'Reouvert' }));

    expect(res.status).toBe(201);
    expect(prismaMock.supportTicket.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run "src/app/api/admin/support-tickets/[id]/messages/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement**

Create `frontend/src/app/api/admin/support-tickets/[id]/messages/route.ts`:

```ts
// POST /api/admin/support-tickets/[id]/messages — admin reply. A reply
// only ever auto-transitions OPEN -> IN_PROGRESS; RESOLVED/CLOSED tickets
// accept replies without re-transitioning (an admin can still answer a
// closed ticket without silently reopening it — status is a separate,
// explicit action via PATCH .../status).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enqueueOutbox } from '@/lib/server/outbox';
import { createNotification } from '@/lib/server/notifications';
import { supportTicketReplied } from '@/lib/server/notifications/templates';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ message: z.string().trim().min(1).max(5000) });
const REPLY_SUBJECT = 'Réponse à votre demande de support NAWIRA';

export async function POST(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await routeCtx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, status: true, userId: true, user: { select: { email: true } } },
    });
    if (!ticket) {
      return NextResponse.json(
        { error: 'TICKET_NOT_FOUND', message: 'Ticket not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const nextStatus = ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status;

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.supportTicketMessage.create({
        data: { ticketId: id, authorId: auth.admin.id, role: 'ADMIN', body: parsed.data.message },
      });

      if (ticket.status === 'OPEN') {
        await tx.supportTicket.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
      }

      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'support_ticket.reply',
        targetType: 'SupportTicket',
        targetId: id,
        metadata: { messageId: created.id },
      });

      await enqueueOutbox(tx, {
        kind: 'email.support_ticket_reply',
        payload: { to: ticket.user.email, subject: REPLY_SUBJECT, ticketId: id },
      });

      await createNotification(tx, supportTicketReplied(ticket.userId, id, created.id));

      return created;
    });

    return NextResponse.json(
      { message: { id: message.id, body: message.body, createdAt: message.createdAt.toISOString() }, status: nextStatus },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run "src/app/api/admin/support-tickets/[id]/messages/route.test.ts"`
Run: `pnpm typecheck`
Expected: all PASS (7 tests), clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/api/admin/support-tickets/[id]/messages/route.ts" "frontend/src/app/api/admin/support-tickets/[id]/messages/route.test.ts"
git commit -m "feat(e11): admin support-ticket reply route (outbox + notification)"
```

---

### Task 9: Admin routes — `PATCH .../status` + `POST .../reveal`

**Files:**
- Create: `frontend/src/app/api/admin/support-tickets/[id]/status/route.ts`
- Test: `frontend/src/app/api/admin/support-tickets/[id]/status/route.test.ts`
- Create: `frontend/src/app/api/admin/support-tickets/[id]/reveal/route.ts`
- Test: `frontend/src/app/api/admin/support-tickets/[id]/reveal/route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin('ADMIN')`, `verifyCsrf(req)`, `logAdminAction`.
- Produces: `PATCH .../status` → `200 { status }`; `POST .../reveal` → `200 { email }`. Both consumed by Task 13 (admin thread page).

- [ ] **Step 1: Write the failing tests for the status route**

Create `frontend/src/app/api/admin/support-tickets/[id]/status/route.test.ts`:

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { PATCH } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);
const adminCtx = { user: { sub: 'admin_1', email: 'admin@test.local' }, admin: { id: 'admin_1', email: 'admin@test.local', role: 'ADMIN' as const } };

function makePatch(id: string, body: unknown): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    new NextRequest(`http://test/api/admin/support-tickets/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx as never);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('PATCH /api/admin/support-tickets/[id]/status', () => {
  it('returns 400 VALIDATION_FAILED for an invalid status value', async () => {
    const res = await PATCH(...makePatch('t1', { status: 'DONE' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 TICKET_NOT_FOUND for a missing ticket', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue(null);
    const res = await PATCH(...makePatch('missing', { status: 'RESOLVED' }));
    expect(res.status).toBe(404);
  });

  it('is idempotent (200, no write, no AdminAction) when the status is unchanged', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue({ id: 't1', status: 'RESOLVED' } as never);
    const res = await PATCH(...makePatch('t1', { status: 'RESOLVED' }));
    expect(res.status).toBe(200);
    expect(prismaMock.supportTicket.update).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('updates the status and logs the admin action on an actual change', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue({ id: 't1', status: 'IN_PROGRESS' } as never);
    prismaMock.supportTicket.update.mockResolvedValue({ status: 'RESOLVED' } as never);
    const res = await PATCH(...makePatch('t1', { status: 'RESOLVED' }));
    expect(res.status).toBe(200);
    expect(prismaMock.supportTicket.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'RESOLVED' } });
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorId: 'admin_1', action: 'support_ticket.status_change', targetType: 'SupportTicket', targetId: 't1', metadata: { from: 'IN_PROGRESS', to: 'RESOLVED' } }),
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement**

Run: `pnpm --filter frontend exec vitest run "src/app/api/admin/support-tickets/[id]/status/route.test.ts"` — expect FAIL.

Create `frontend/src/app/api/admin/support-tickets/[id]/status/route.ts`:

```ts
// PATCH /api/admin/support-tickets/[id]/status — explicit status change,
// independent of the reply route. Idempotent no-op (no AdminAction write)
// when unchanged, mirroring the plan-change route's audit-log-noise
// mitigation.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) });

export async function PATCH(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await routeCtx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const ticket = await prisma.supportTicket.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!ticket) {
      return NextResponse.json(
        { error: 'TICKET_NOT_FOUND', message: 'Ticket not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    if (ticket.status === parsed.data.status) {
      return NextResponse.json({ status: ticket.status }, { status: 200, headers: { 'x-request-id': ctx.requestId } });
    }

    const updated = await prisma.supportTicket.update({ where: { id }, data: { status: parsed.data.status } });
    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'support_ticket.status_change',
      targetType: 'SupportTicket',
      targetId: id,
      metadata: { from: ticket.status, to: updated.status },
    });

    return NextResponse.json({ status: updated.status }, { status: 200, headers: { 'x-request-id': ctx.requestId } });
  });
}
```

Run: `pnpm --filter frontend exec vitest run "src/app/api/admin/support-tickets/[id]/status/route.test.ts"` — expect PASS (4 tests).

- [ ] **Step 3: Write the failing tests for the reveal route**

Create `frontend/src/app/api/admin/support-tickets/[id]/reveal/route.test.ts`:

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { logAdminAction } from '@/lib/server/admin/audit';
import { POST } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockLogAdminAction = vi.mocked(logAdminAction);
const adminCtx = { user: { sub: 'admin_1', email: 'admin@test.local' }, admin: { id: 'admin_1', email: 'admin@test.local', role: 'ADMIN' as const } };

function makePost(id: string): [NextRequest, { params: Promise<{ id: string }> }] {
  return [
    new NextRequest(`http://test/api/admin/support-tickets/${id}/reveal`, { method: 'POST' }),
    { params: Promise.resolve({ id }) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx as never);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('POST /api/admin/support-tickets/[id]/reveal', () => {
  it('returns 404 TICKET_NOT_FOUND for a missing ticket', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue(null);
    const res = await POST(...makePost('missing'));
    expect(res.status).toBe(404);
  });

  it('returns the raw email and logs an audited reveal action', async () => {
    prismaMock.supportTicket.findUnique.mockResolvedValue({ id: 't1', user: { email: 'gregory@gmail.com' } } as never);
    const res = await POST(...makePost('t1'));
    expect(res.status).toBe(200);
    expect((await res.json()).email).toBe('gregory@gmail.com');
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorId: 'admin_1', action: 'support_ticket.reveal_pii', targetType: 'SupportTicket', targetId: 't1' }),
    );
  });
});
```

- [ ] **Step 4: Run to verify it fails, then implement**

Run: `pnpm --filter frontend exec vitest run "src/app/api/admin/support-tickets/[id]/reveal/route.test.ts"` — expect FAIL.

Create `frontend/src/app/api/admin/support-tickets/[id]/reveal/route.ts`:

```ts
// POST /api/admin/support-tickets/[id]/reveal — the ONLY route that
// returns the reporting user's raw email. Every call is audited via
// logAdminAction (PRD "recherche compte support par identifiant sécurisé").
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function POST(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await routeCtx.params;
    const ticket = await prisma.supportTicket.findUnique({ where: { id }, select: { id: true, user: { select: { email: true } } } });
    if (!ticket) {
      return NextResponse.json(
        { error: 'TICKET_NOT_FOUND', message: 'Ticket not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await logAdminAction(prisma, {
      actorId: auth.admin.id,
      action: 'support_ticket.reveal_pii',
      targetType: 'SupportTicket',
      targetId: id,
    });

    return NextResponse.json({ email: ticket.user.email }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

Run: `pnpm --filter frontend exec vitest run "src/app/api/admin/support-tickets/[id]/reveal/route.test.ts"` — expect PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/api/admin/support-tickets/[id]/status" "frontend/src/app/api/admin/support-tickets/[id]/reveal"
git commit -m "feat(e11): admin support-ticket status + PII-reveal routes"
```

---

### Task 10: Admin routes — `GET`/`POST /api/admin/articles`

**Files:**
- Create: `frontend/src/app/api/admin/articles/route.ts`
- Test: `frontend/src/app/api/admin/articles/route.test.ts`

**Interfaces:**
- Consumes: `requireAdmin('ADMIN')`, `verifyCsrf(req)`, `logAdminAction`, `slugify` from `@/lib/server/slug` (PROTECTED file — read-only import, no modification).
- Produces: `GET /api/admin/articles` → `200 { items, nextCursor }`; `POST /api/admin/articles` → `201 { article }` or `409 SLUG_TAKEN`. Consumed by Task 14 (admin articles page).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/admin/articles/route.test.ts`:

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { GET, POST } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const adminCtx = { user: { sub: 'admin_1', email: 'admin@test.local' }, admin: { id: 'admin_1', email: 'admin@test.local', role: 'ADMIN' as const } };

function makeGet(qs = ''): NextRequest {
  return new NextRequest(`http://test/api/admin/articles${qs}`, { method: 'GET' });
}
function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/admin/articles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx as never);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('GET /api/admin/articles', () => {
  it('returns 403 when the caller is not an admin', async () => {
    mockRequireAdmin.mockResolvedValueOnce(NextResponse.json({ error: 'ADMIN_REQUIRED' }, { status: 403 }) as never);
    const res = await GET(makeGet());
    expect(res.status).toBe(403);
  });

  it('returns items + nextCursor shape', async () => {
    prismaMock.article.findMany.mockResolvedValue([]);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('nextCursor');
  });
});

describe('POST /api/admin/articles', () => {
  it('returns 400 VALIDATION_FAILED for an empty title', async () => {
    const res = await POST(makePost({ title: '', body: 'x' }));
    expect(res.status).toBe(400);
  });

  it('auto-generates the slug from the title when none is given', async () => {
    prismaMock.article.create.mockResolvedValue({
      id: 'a1',
      title: 'Comprendre son cycle',
      slug: 'comprendre-son-cycle',
      status: 'DRAFT',
      createdAt: new Date(),
    } as never);
    const res = await POST(makePost({ title: 'Comprendre son cycle', body: 'Contenu…' }));
    expect(res.status).toBe(201);
    expect(prismaMock.article.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: 'comprendre-son-cycle', authorId: 'admin_1' }) }),
    );
  });

  it('returns 409 SLUG_TAKEN on a unique-constraint violation', async () => {
    prismaMock.article.create.mockRejectedValue(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));
    const res = await POST(makePost({ title: 'Doublon', body: 'x', slug: 'doublon' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('SLUG_TAKEN');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/articles/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement**

Create `frontend/src/app/api/admin/articles/route.ts`:

```ts
// GET  /api/admin/articles — list, cursor-paginated, optional ?status.
// POST /api/admin/articles — create a DRAFT article. slug auto-generated
// from title via slugify() when omitted; 409 SLUG_TAKEN on collision
// (no auto-retry — the admin edits and resubmits).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { clampLimit, cursorWhere, buildPage, decodeCursor } from '@/lib/server/pagination/paginate';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { slugify } from '@/lib/server/slug';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const CreateBody = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const url = req.nextUrl;
    const limit = clampLimit(url.searchParams.get('limit'));
    const status = url.searchParams.get('status');
    const cursor = decodeCursor(url.searchParams.get('cursor'));
    const baseWhere = status ? { status } : {};
    const where = cursor ? { AND: [baseWhere, cursorWhere(cursor)] } : baseWhere;

    const rows = await prisma.article.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: { id: true, title: true, slug: true, status: true, createdAt: true, updatedAt: true },
    });

    return NextResponse.json(buildPage(rows, limit), { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = CreateBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const slug = parsed.data.slug ?? slugify(parsed.data.title);

    try {
      const article = await prisma.article.create({
        data: { title: parsed.data.title, body: parsed.data.body, slug, authorId: auth.admin.id, status: 'DRAFT' },
      });
      await logAdminAction(prisma, { actorId: auth.admin.id, action: 'article.create', targetType: 'Article', targetId: article.id });
      return NextResponse.json(
        {
          article: {
            id: article.id,
            title: article.title,
            slug: article.slug,
            status: article.status,
            createdAt: article.createdAt.toISOString(),
          },
        },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        return NextResponse.json(
          { error: 'SLUG_TAKEN', message: 'This slug is already in use' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/articles/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/admin/articles/route.ts frontend/src/app/api/admin/articles/route.test.ts
git commit -m "feat(e11): admin articles list + create routes"
```

---

### Task 11: Admin routes — `GET`/`PATCH`/`DELETE /api/admin/articles/[id]`

**Files:**
- Create: `frontend/src/app/api/admin/articles/[id]/route.ts`
- Test: `frontend/src/app/api/admin/articles/[id]/route.test.ts`

**Interfaces:**
- Consumes: same as Task 10.
- Produces: `GET/PATCH/DELETE /api/admin/articles/[id]`, consumed by Task 14 (admin articles page).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/api/admin/articles/[id]/route.test.ts`:

```ts
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/server/middleware', () => ({
  requireAdmin: vi.fn(),
}));
vi.mock('@/lib/server/middleware/rate-limit-by-userid', () => ({
  enforceAdminRateLimit: vi.fn(),
}));
vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));
vi.mock('@/lib/server/admin/audit', () => ({
  logAdminAction: vi.fn(),
}));

import { requireAdmin } from '@/lib/server/middleware';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { verifyCsrf } from '@/lib/server/auth';
import { GET, PATCH, DELETE } from './route';

const mockRequireAdmin = vi.mocked(requireAdmin);
const mockRateLimit = vi.mocked(enforceAdminRateLimit);
const mockVerifyCsrf = vi.mocked(verifyCsrf);
const adminCtx = { user: { sub: 'admin_1', email: 'admin@test.local' }, admin: { id: 'admin_1', email: 'admin@test.local', role: 'ADMIN' as const } };

function ctxWith(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}
function makeGet(id: string): NextRequest {
  return new NextRequest(`http://test/api/admin/articles/${id}`, { method: 'GET' });
}
function makePatch(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://test/api/admin/articles/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function makeDelete(id: string): NextRequest {
  return new NextRequest(`http://test/api/admin/articles/${id}`, { method: 'DELETE' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(adminCtx as never);
  mockRateLimit.mockResolvedValue(null);
  mockVerifyCsrf.mockReturnValue(null);
});

describe('GET /api/admin/articles/[id]', () => {
  it('returns 404 ARTICLE_NOT_FOUND for a missing article', async () => {
    prismaMock.article.findUnique.mockResolvedValue(null);
    const res = await GET(makeGet('missing'), ctxWith('missing'));
    expect(res.status).toBe(404);
  });

  it('returns the full article', async () => {
    prismaMock.article.findUnique.mockResolvedValue({
      id: 'a1', title: 'T', slug: 't', body: 'B', status: 'DRAFT', publishedAt: null, createdAt: new Date(), updatedAt: new Date(),
    } as never);
    const res = await GET(makeGet('a1'), ctxWith('a1'));
    expect(res.status).toBe(200);
    expect((await res.json()).article).toMatchObject({ id: 'a1', title: 'T', body: 'B' });
  });
});

describe('PATCH /api/admin/articles/[id]', () => {
  it('sets publishedAt only on the first DRAFT -> PUBLISHED transition', async () => {
    prismaMock.article.findUnique.mockResolvedValue({ id: 'a1', status: 'DRAFT', publishedAt: null } as never);
    prismaMock.article.update.mockResolvedValue({
      id: 'a1', title: 'T', slug: 't', body: 'B', status: 'PUBLISHED', publishedAt: new Date('2026-09-20T00:00:00.000Z'), createdAt: new Date(), updatedAt: new Date(),
    } as never);
    await PATCH(makePatch('a1', { status: 'PUBLISHED' }), ctxWith('a1'));
    expect(prismaMock.article.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PUBLISHED', publishedAt: expect.any(Date) }) }),
    );
  });

  it('does not reset publishedAt on a subsequent edit while already PUBLISHED', async () => {
    const originalPublishedAt = new Date('2026-01-01T00:00:00.000Z');
    prismaMock.article.findUnique.mockResolvedValue({ id: 'a1', status: 'PUBLISHED', publishedAt: originalPublishedAt } as never);
    prismaMock.article.update.mockResolvedValue({
      id: 'a1', title: 'T2', slug: 't', body: 'B2', status: 'PUBLISHED', publishedAt: originalPublishedAt, createdAt: new Date(), updatedAt: new Date(),
    } as never);
    await PATCH(makePatch('a1', { title: 'T2', body: 'B2' }), ctxWith('a1'));
    const call = prismaMock.article.update.mock.calls[0]?.[0];
    expect(call?.data).not.toHaveProperty('publishedAt');
  });

  it('returns 409 SLUG_TAKEN on a unique-constraint violation', async () => {
    prismaMock.article.findUnique.mockResolvedValue({ id: 'a1', status: 'DRAFT', publishedAt: null } as never);
    prismaMock.article.update.mockRejectedValue(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));
    const res = await PATCH(makePatch('a1', { slug: 'taken' }), ctxWith('a1'));
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/admin/articles/[id]', () => {
  it('deletes the article and returns 200', async () => {
    prismaMock.article.findUnique.mockResolvedValue({ id: 'a1' } as never);
    prismaMock.article.delete.mockResolvedValue({} as never);
    const res = await DELETE(makeDelete('a1'), ctxWith('a1'));
    expect(res.status).toBe(200);
    expect(prismaMock.article.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });

  it('returns 404 ARTICLE_NOT_FOUND for a missing article', async () => {
    prismaMock.article.findUnique.mockResolvedValue(null);
    const res = await DELETE(makeDelete('missing'), ctxWith('missing'));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter frontend exec vitest run "src/app/api/admin/articles/[id]/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement**

Create `frontend/src/app/api/admin/articles/[id]/route.ts`:

```ts
// GET/PATCH/DELETE /api/admin/articles/[id]. PATCH sets publishedAt ONLY
// on the DRAFT -> PUBLISHED transition — later edits (including
// PUBLISHED -> DRAFT -> PUBLISHED again) never move it, matching how
// most CMSes distinguish "first published" from "last updated"
// (article.updatedAt already covers the latter).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { logAdminAction } from '@/lib/server/admin/audit';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const PatchBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(20000).optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
});

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

function serialize(a: {
  id: string;
  title: string;
  slug: string;
  body: string;
  status: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: a.id,
    title: a.title,
    slug: a.slug,
    body: a.body,
    status: a.status,
    publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export async function GET(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await routeCtx.params;
    const article = await prisma.article.findUnique({ where: { id } });
    if (!article) {
      return NextResponse.json(
        { error: 'ARTICLE_NOT_FOUND', message: 'Article not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    return NextResponse.json({ article: serialize(article) }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function PATCH(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await routeCtx.params;
    const parsed = PatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existing = await prisma.article.findUnique({ where: { id }, select: { status: true, publishedAt: true } });
    if (!existing) {
      return NextResponse.json(
        { error: 'ARTICLE_NOT_FOUND', message: 'Article not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const firstPublish = existing.status === 'DRAFT' && parsed.data.status === 'PUBLISHED';

    try {
      const updated = await prisma.article.update({
        where: { id },
        data: {
          ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
          ...(parsed.data.body !== undefined ? { body: parsed.data.body } : {}),
          ...(parsed.data.slug !== undefined ? { slug: parsed.data.slug } : {}),
          ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
          ...(firstPublish ? { publishedAt: new Date() } : {}),
        },
      });
      await logAdminAction(prisma, { actorId: auth.admin.id, action: 'article.update', targetType: 'Article', targetId: id });
      return NextResponse.json({ article: serialize(updated) }, { headers: { 'x-request-id': ctx.requestId } });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return NextResponse.json(
          { error: 'SLUG_TAKEN', message: 'This slug is already in use' },
          { status: 409, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
  });
}

export async function DELETE(
  req: NextRequest,
  routeCtx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await routeCtx.params;
    const existing = await prisma.article.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json(
        { error: 'ARTICLE_NOT_FOUND', message: 'Article not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.article.delete({ where: { id } });
    await logAdminAction(prisma, { actorId: auth.admin.id, action: 'article.delete', targetType: 'Article', targetId: id });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': ctx.requestId } });
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run "src/app/api/admin/articles/[id]/route.test.ts"`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/api/admin/articles/[id]/route.ts" "frontend/src/app/api/admin/articles/[id]/route.test.ts"
git commit -m "feat(e11): admin article detail/update/delete routes"
```

---

### Task 12: Capabilities, stats count, nav entries

**Files:**
- Modify: `frontend/src/app/api/admin/me/route.ts`
- Modify: `frontend/src/app/api/admin/me/route.test.ts`
- Modify: `frontend/src/app/api/admin/stats/route.ts`
- Modify: `frontend/src/app/api/admin/stats/route.test.ts`
- Modify: `frontend/src/components/admin/admin-nav.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `admin.can` includes `support-tickets:read`, `support-tickets:reply`, `content:read`, `content:write` for both roles; `/api/admin/stats` response gains `openTicketCount`; `ADMIN_NAV` gains "Articles" and "Support" entries — all consumed by Tasks 13-14 (admin UI).

- [ ] **Step 1: Update the capability list tests**

In `frontend/src/app/api/admin/me/route.test.ts` (current state: 7-item ADMIN / 12-item SUPERADMIN contract, per this session's `d91cd09` commit), update the three exact-list tests:

Replace the ADMIN 7-item test's `toEqual` array and `toHaveLength(7)`:

```ts
    expect(body.can).toEqual([
      'users:read',
      'users:status:suspend',
      'audit-log:read',
      'outbox:read',
      'email-queue:read',
      'rate-limits:read',
      'pricing:read',
      'support-tickets:read',
      'support-tickets:reply',
      'content:read',
      'content:write',
    ]);
    expect(body.can).toHaveLength(11);
```

Replace the SUPERADMIN 12-item test's `toHaveLength(12)` with `toHaveLength(16)`, and the exact-list test's `toEqual` array:

```ts
    expect(body.can).toEqual([
      'users:read',
      'users:role',
      'users:status:suspend',
      'users:status:restore',
      'users:delete',
      'users:plan',
      'audit-log:read',
      'outbox:read',
      'email-queue:read',
      'rate-limits:read',
      'pricing:read',
      'pricing:write',
      'support-tickets:read',
      'support-tickets:reply',
      'content:read',
      'content:write',
    ]);
```

Update the titles: `'GET returns role + capability list for ADMIN (7-item exact list)'` → `'(11-item exact list)'`; `'SUPERADMIN list is the exact 12-item set required by D-ADMIN-04'` → `'16-item set'`.

- [ ] **Step 2: Run to verify the tests fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/me/route.test.ts`
Expected: FAIL — actual `can` arrays are still the old 7/12-item lists.

- [ ] **Step 3: Update `CAPABILITIES_BY_ROLE`**

In `frontend/src/app/api/admin/me/route.ts`, update both arrays:

```ts
const CAPABILITIES_BY_ROLE: Record<'ADMIN' | 'SUPERADMIN', readonly string[]> = {
  ADMIN: [
    'users:read',
    'users:status:suspend',
    'audit-log:read',
    'outbox:read',
    'email-queue:read',
    'rate-limits:read',
    'pricing:read',
    'support-tickets:read',
    'support-tickets:reply',
    'content:read',
    'content:write',
  ],
  SUPERADMIN: [
    'users:read',
    'users:role',
    'users:status:suspend',
    'users:status:restore',
    'users:delete',
    'users:plan',
    'audit-log:read',
    'outbox:read',
    'email-queue:read',
    'rate-limits:read',
    'pricing:read',
    'pricing:write',
    'support-tickets:read',
    'support-tickets:reply',
    'content:read',
    'content:write',
  ],
} as const;
```

Update the docstring block above it (`CAPABILITY LIST CONTRACT (D-ADMIN-04 — locked)`) to say ADMIN sees 11, SUPERADMIN sees 16, listing the four new entries.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/me/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `openTicketCount` to `/api/admin/stats`**

In `frontend/src/app/api/admin/stats/route.test.ts`, the existing file already declares `function makeGet(): NextRequest { return new NextRequest('http://test/api/admin/stats', { method: 'GET' }); }` — reuse it as-is, no changes needed to that helper.

Update the existing `'returns real active-user and paid-profile counts'` test's mocks and assertion:

```ts
  it('returns real active-user, paid-profile, and open-ticket counts', async () => {
    prismaMock.user.count.mockResolvedValueOnce(12847);
    prismaMock.profile.count.mockResolvedValueOnce(4231);
    prismaMock.supportTicket.count.mockResolvedValueOnce(6);

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { activeUsers: number; paidProfiles: number; openTicketCount: number };
    expect(body).toEqual({ activeUsers: 12847, paidProfiles: 4231, openTicketCount: 6 });

    expect(prismaMock.user.count).toHaveBeenCalledWith({ where: { status: 'ACTIVE' } });
    expect(prismaMock.profile.count).toHaveBeenCalledWith({
      where: { plan: { in: ['PLUS', 'BABY'] } },
    });
    expect(prismaMock.supportTicket.count).toHaveBeenCalledWith({ where: { status: 'OPEN' } });
  });
```

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/stats/route.test.ts` — expect FAIL (the updated assertion now expects `openTicketCount`, which the route doesn't return yet).

Update `frontend/src/app/api/admin/stats/route.ts`:

```ts
    const [activeUsers, paidProfiles, openTicketCount] = await Promise.all([
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.profile.count({ where: { plan: { in: ['PLUS', 'BABY'] } } }),
      prisma.supportTicket.count({ where: { status: 'OPEN' } }),
    ]);

    return NextResponse.json(
      { activeUsers, paidProfiles, openTicketCount },
      { headers: { 'x-request-id': ctx.requestId } },
    );
```

Run: `pnpm --filter frontend exec vitest run src/app/api/admin/stats/route.test.ts` — expect PASS.

- [ ] **Step 6: Add the nav entries**

In `frontend/src/components/admin/admin-nav.ts`, add `FileText` and `LifeBuoy` to the `lucide-react` import list, and two new entries to `ADMIN_NAV` after the existing `Tarifs` entry:

```ts
  { href: '/admin/articles', label: 'Articles', icon: FileText, available: true },
  { href: '/admin/support', label: 'Support', icon: LifeBuoy, available: true },
```

- [ ] **Step 7: Full gate + commit**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

```bash
git add frontend/src/app/api/admin/me/route.ts frontend/src/app/api/admin/me/route.test.ts frontend/src/app/api/admin/stats/route.ts frontend/src/app/api/admin/stats/route.test.ts frontend/src/components/admin/admin-nav.ts
git commit -m "feat(e11): capabilities, openTicketCount stat, nav entries"
```

---

### Task 13: Admin UI — `/admin/support` (queue) + `/admin/support/[id]` (thread)

**Files:**
- Create: `frontend/src/app/admin/support/page.tsx`
- Create: `frontend/src/app/admin/support/[id]/page.tsx`

**Interfaces:**
- Consumes: `api()` wrapper, `useAdmin()`, `useToast()`, `Badge`, `AdminListSkeleton`, `Skeleton` — all existing. Task 6-9's routes.
- Produces: two reachable pages, no other task depends on their internals.

This is a UI-only task with no unit tests (matching this session's existing admin pages, e.g. `/admin/pricing`, `/admin/users` — none have component tests; the project's Vitest coverage is `lib/server/**` + route handlers only, per CLAUDE.md's Conventions section). Verification is manual (Step 3 below).

- [ ] **Step 1: Queue page**

Create `frontend/src/app/admin/support/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { AdminListSkeleton } from '@/components/admin/AdminListSkeleton';

interface TicketRow {
  id: string;
  subject: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  userEmailMasked: string;
}

interface TicketListResponse {
  items: TicketRow[];
  nextCursor: string | null;
}

const STATUS_LABEL: Record<TicketRow['status'], string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En cours',
  RESOLVED: 'Résolu',
  CLOSED: 'Fermé',
};

const STATUS_TONE: Record<TicketRow['status'], 'primary' | 'warning' | 'success' | 'neutral'> = {
  OPEN: 'primary',
  IN_PROGRESS: 'warning',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

export default function AdminSupportPage(): React.JSX.Element {
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load(): Promise<void> {
      setError(null);
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (status) params.set('status', status);
        const res = await api<TicketListResponse>(`/api/admin/support-tickets?${params.toString()}`);
        setTickets(res.items);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
      }
    }
    void load();
  }, [status]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Support</h1>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-navy"
        >
          <option value="">Tous les statuts</option>
          <option value="OPEN">Ouvert</option>
          <option value="IN_PROGRESS">En cours</option>
          <option value="RESOLVED">Résolu</option>
          <option value="CLOSED">Fermé</option>
        </select>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {tickets === null ? (
        <AdminListSkeleton />
      ) : tickets.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune demande de support.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tickets.map((t) => (
            <Link
              key={t.id}
              href={`/admin/support/${t.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-gray-50"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-navy">{t.subject}</div>
                <div className="text-xs text-muted-foreground">
                  {t.userEmailMasked} · {t.messageCount} message{t.messageCount > 1 ? 's' : ''}
                </div>
              </div>
              <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Thread page**

Create `frontend/src/app/admin/support/[id]/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAdmin } from '@/contexts/AdminContext';
import { useToast } from '@/contexts/ToastContext';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

interface TicketDetail {
  ticket: {
    id: string;
    subject: string;
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
    createdAt: string;
    userEmailMasked: string;
  };
  messages: { id: string; role: 'USER' | 'ADMIN'; body: string; createdAt: string }[];
}

const STATUS_LABEL: Record<TicketDetail['ticket']['status'], string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En cours',
  RESOLVED: 'Résolu',
  CLOSED: 'Fermé',
};

export default function AdminSupportTicketPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const admin = useAdmin();
  const { toast } = useToast();
  const canReply = admin.can.includes('support-tickets:reply');

  const [data, setData] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [revealedEmail, setRevealedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api<TicketDetail>(`/api/admin/support-tickets/${id}`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reveal(): Promise<void> {
    try {
      const res = await api<{ email: string }>(`/api/admin/support-tickets/${id}/reveal`, { method: 'POST' });
      setRevealedEmail(res.email);
    } catch {
      toast('Impossible de révéler l’email.', 'error');
    }
  }

  async function sendReply(): Promise<void> {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api(`/api/admin/support-tickets/${id}/messages`, { method: 'POST', body: { message: reply } });
      setReply('');
      await load();
      toast('Réponse envoyée.', 'success');
    } catch {
      toast('Échec de l’envoi.', 'error');
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(status: TicketDetail['ticket']['status']): Promise<void> {
    try {
      await api(`/api/admin/support-tickets/${id}/status`, { method: 'PATCH', body: { status } });
      await load();
      toast('Statut mis à jour.', 'success');
    } catch {
      toast('Échec de la mise à jour du statut.', 'error');
    }
  }

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-navy">{data.ticket.subject}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <span>{revealedEmail ?? data.ticket.userEmailMasked}</span>
            {!revealedEmail && (
              <button onClick={() => void reveal()} className="text-primary underline">
                Révéler
              </button>
            )}
          </div>
        </div>
        <select
          value={data.ticket.status}
          onChange={(e) => void changeStatus(e.target.value as TicketDetail['ticket']['status'])}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-navy"
        >
          {(Object.keys(STATUS_LABEL) as TicketDetail['ticket']['status'][]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-3">
        {data.messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-lg border border-border p-3 text-sm ${m.role === 'ADMIN' ? 'bg-primary-soft' : 'bg-card'}`}
          >
            <div className="mb-1 text-xs font-semibold text-muted-foreground">
              <Badge tone={m.role === 'ADMIN' ? 'primary' : 'neutral'}>{m.role === 'ADMIN' ? 'Équipe' : 'Utilisatrice'}</Badge>
            </div>
            <p className="whitespace-pre-wrap text-navy">{m.body}</p>
          </div>
        ))}
      </div>

      {canReply && (
        <div className="flex flex-col gap-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={4}
            placeholder="Écrire une réponse…"
            className="rounded-lg border border-border bg-white p-3 text-sm text-navy outline-none"
          />
          <button
            onClick={() => void sendReply()}
            disabled={sending || !reply.trim()}
            className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? 'Envoi…' : 'Répondre'}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Manual verification**

Run `pnpm dev`, sign in as an admin (`pnpm db:make-superadmin <email>` if needed), navigate to `/admin/support`. Confirm: the empty-state message renders with no tickets; after Task 16 ships (consumer submission), a submitted ticket appears in the queue with a masked email; clicking it opens the thread; "Révéler" swaps the masked email for the real one; sending a reply appends it to the thread and (per Task 8) flips `OPEN` to `IN_PROGRESS` in the status `<select>` after a reload; the status `<select>` independently changes status.

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/admin/support/
git commit -m "feat(e11): admin support queue + thread pages"
```

---

### Task 14: Admin UI — `/admin/articles`

**Files:**
- Create: `frontend/src/app/admin/articles/page.tsx`

**Interfaces:**
- Consumes: `api()`, `useAdmin()`, `useToast()`, `Badge`, `AdminListSkeleton`. Task 10-11's routes.
- Produces: one reachable page, no other task depends on its internals.

- [ ] **Step 1: Implement**

Create `frontend/src/app/admin/articles/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAdmin } from '@/contexts/AdminContext';
import { useToast } from '@/contexts/ToastContext';
import { Badge } from '@/components/ui/Badge';
import { AdminListSkeleton } from '@/components/admin/AdminListSkeleton';

interface ArticleRow {
  id: string;
  title: string;
  slug: string;
  status: 'DRAFT' | 'PUBLISHED';
  createdAt: string;
  updatedAt: string;
}

interface ArticleListResponse {
  items: ArticleRow[];
  nextCursor: string | null;
}

function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Une erreur est survenue.';
  switch (err.code) {
    case 'SLUG_TAKEN':
      return 'Ce slug est déjà utilisé.';
    case 'VALIDATION_FAILED':
      return 'Titre ou contenu invalide.';
    default:
      return err.message;
  }
}

export default function AdminArticlesPage(): React.JSX.Element {
  const admin = useAdmin();
  const { toast } = useToast();
  const canWrite = admin.can.includes('content:write');

  const [articles, setArticles] = useState<ArticleRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<ArticleListResponse>('/api/admin/articles?limit=50');
      setArticles(res.items);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createArticle(): Promise<void> {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    try {
      await api('/api/admin/articles', { method: 'POST', body: { title, body } });
      setTitle('');
      setBody('');
      setCreating(false);
      await load();
      toast('Article créé.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(a: ArticleRow): Promise<void> {
    const status = a.status === 'DRAFT' ? 'PUBLISHED' : 'DRAFT';
    try {
      await api(`/api/admin/articles/${a.id}`, { method: 'PATCH', body: { status } });
      await load();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  async function remove(a: ArticleRow): Promise<void> {
    try {
      await api(`/api/admin/articles/${a.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Articles</h1>
        {canWrite && (
          <button
            onClick={() => setCreating((v) => !v)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            {creating ? 'Annuler' : 'Nouvel article'}
          </button>
        )}
      </div>

      {creating && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-white p-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre"
            className="rounded-lg border border-border p-3 text-sm text-navy outline-none"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="Contenu"
            className="rounded-lg border border-border p-3 text-sm text-navy outline-none"
          />
          <button
            onClick={() => void createArticle()}
            disabled={saving || !title.trim() || !body.trim()}
            className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Création…' : 'Créer (brouillon)'}
          </button>
        </div>
      )}

      {articles === null ? (
        <AdminListSkeleton />
      ) : articles.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun article.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {articles.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-navy">{a.title}</div>
                <div className="text-xs text-muted-foreground">/{a.slug}</div>
              </div>
              <Badge tone={a.status === 'PUBLISHED' ? 'success' : 'neutral'}>
                {a.status === 'PUBLISHED' ? 'Publié' : 'Brouillon'}
              </Badge>
              {canWrite && (
                <div className="flex gap-2">
                  <button onClick={() => void togglePublish(a)} className="text-xs font-medium text-primary underline">
                    {a.status === 'DRAFT' ? 'Publier' : 'Dépublier'}
                  </button>
                  <button onClick={() => void remove(a)} className="text-xs font-medium text-danger underline">
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Run `pnpm dev`, navigate to `/admin/articles`. Confirm: empty state renders; "Nouvel article" opens the form; creating one shows it in the list as "Brouillon"; "Publier" flips it to "Publié"; "Supprimer" removes it.

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/admin/articles/
git commit -m "feat(e11): admin articles page"
```

---

### Task 15: Consumer UI — swap `/app/help`'s `mailto:` block

**Files:**
- Modify: `frontend/src/app/app/help/page.tsx`

**Interfaces:**
- Consumes: `api()` wrapper. Task 4's `POST /api/support-tickets`.
- Produces: a working "Contacte notre équipe" form; the FAQ accordion above it is untouched.

- [ ] **Step 1: Read the current file in full**

Read `frontend/src/app/app/help/page.tsx` end to end before editing — only the "Contacte notre équipe" `<div>` block (currently the first child of the right-column `<div className="animate-fade-in-up flex flex-col gap-6" ...>`, containing the `<h2>Contacte notre équipe</h2>` and the `mailto:` `<a>`) changes. Everything else (the search box, the FAQ accordion loop, the medical-disclaimer box) stays byte-identical.

- [ ] **Step 2: Replace the contact block**

Replace:

```tsx
          <div className="rounded-xl border border-border bg-white p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-navy">
              <Mail size={18} className="text-primary" />
              Contacte notre équipe
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Tu n&rsquo;as pas trouvé la réponse ? Écris-nous, on te répond par email.
            </p>
            <a
              href="mailto:support@nawira.app"
              className="flex items-center justify-between rounded-lg border border-border bg-gray-50 p-3 transition-all duration-150 hover:bg-gray-100 active:scale-[0.98]"
            >
              <span className="text-sm font-medium text-navy">support@nawira.app</span>
            </a>
          </div>
```

with:

```tsx
          <ContactSupportCard />
```

Add the import near the top of the file (alongside the existing `import { HelpAccordion } from '@/components/help/HelpAccordion';`):

```tsx
import { ContactSupportCard } from '@/components/help/ContactSupportCard';
```

Remove the now-unused `Mail` import from the `lucide-react` import line if `Mail` isn't used elsewhere in this file (check before removing — `Info` is still used by the medical-disclaimer box below).

- [ ] **Step 3: Create the extracted component**

Create `frontend/src/components/help/ContactSupportCard.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail } from 'lucide-react';
import { api, ApiError } from '@/lib/api';

export function ContactSupportCard(): React.JSX.Element {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!subject.trim() || !message.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await api<{ ticket: { id: string } }>('/api/support-tickets', {
        method: 'POST',
        body: { subject, message },
      });
      router.push(`/app/support/${res.ticket.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-white p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-navy">
        <Mail size={18} className="text-primary" />
        Contacte notre équipe
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Tu n&rsquo;as pas trouvé la réponse ? Décris ton problème, on te répond ici.
      </p>
      <div className="flex flex-col gap-3">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Sujet"
          className="rounded-lg border border-border bg-gray-50 p-3 text-sm text-navy outline-none"
        />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="Décris ton problème…"
          className="rounded-lg border border-border bg-gray-50 p-3 text-sm text-navy outline-none"
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        <button
          onClick={() => void submit()}
          disabled={sending || !subject.trim() || !message.trim()}
          className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {sending ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Manual verification**

Run `pnpm dev`, navigate to `/app/help`. Confirm: the FAQ accordion + search box render unchanged; the contact card now shows a subject+message form instead of a `mailto:` link; submitting redirects to `/app/support/<id>` (Task 16).

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/app/help/page.tsx frontend/src/components/help/ContactSupportCard.tsx
git commit -m "feat(e11): replace mailto contact block with in-app ticket form"
```

---

### Task 16: Consumer UI — `/app/support` (list) + `/app/support/[id]` (thread)

**Files:**
- Create: `frontend/src/app/app/support/page.tsx`
- Create: `frontend/src/app/app/support/[id]/page.tsx`

**Interfaces:**
- Consumes: `api()`, `Badge`. Task 4-5's consumer routes.
- Produces: two reachable pages — `/app/support/[id]` is the redirect target from Task 15's form.

- [ ] **Step 1: List page**

Create `frontend/src/app/app/support/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';

interface TicketRow {
  id: string;
  subject: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
}

interface TicketListResponse {
  items: TicketRow[];
  nextCursor: string | null;
}

const STATUS_LABEL: Record<TicketRow['status'], string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En cours',
  RESOLVED: 'Résolu',
  CLOSED: 'Fermé',
};

const STATUS_TONE: Record<TicketRow['status'], 'primary' | 'warning' | 'success' | 'neutral'> = {
  OPEN: 'primary',
  IN_PROGRESS: 'warning',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

export default function MySupportTicketsPage(): React.JSX.Element {
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const res = await api<TicketListResponse>('/api/support-tickets?limit=50');
        setTickets(res.items);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
      }
    }
    void load();
  }, []);

  return (
    <div className="p-4 lg:p-8">
      <h1 className="mb-6 text-2xl font-bold text-navy">Mes demandes</h1>
      {error && <p className="text-sm text-danger">{error}</p>}
      {tickets === null ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : tickets.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune demande pour le moment.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tickets.map((t) => (
            <Link
              key={t.id}
              href={`/app/support/${t.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white p-4 transition-colors hover:bg-gray-50"
            >
              <span className="truncate text-sm font-medium text-navy">{t.subject}</span>
              <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Thread page**

Create `frontend/src/app/app/support/[id]/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';

interface TicketThread {
  ticket: { id: string; subject: string; status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'; createdAt: string };
  messages: { id: string; role: 'USER' | 'ADMIN'; body: string; createdAt: string; authorEmail: string }[];
}

const STATUS_LABEL: Record<TicketThread['ticket']['status'], string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En cours',
  RESOLVED: 'Résolu',
  CLOSED: 'Fermé',
};

function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Une erreur est survenue.';
  if (err.code === 'TICKET_CLOSED') return 'Cette demande est fermée.';
  return err.message;
}

export default function SupportTicketThreadPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<TicketThread | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<TicketThread>(`/api/support-tickets/${id}`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const closed = data?.ticket.status === 'RESOLVED' || data?.ticket.status === 'CLOSED';

  async function sendReply(): Promise<void> {
    if (!reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api(`/api/support-tickets/${id}/messages`, { method: 'POST', body: { message: reply } });
      setReply('');
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  if (!data) return <div className="p-4 lg:p-8 text-sm text-muted-foreground">Chargement…</div>;

  return (
    <div className="p-4 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">{data.ticket.subject}</h1>
        <Badge tone={closed ? 'neutral' : 'primary'}>{STATUS_LABEL[data.ticket.status]}</Badge>
      </div>

      <div className="mb-6 flex flex-col gap-3">
        {data.messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-lg border border-border p-3 text-sm ${m.role === 'ADMIN' ? 'bg-primary-soft' : 'bg-white'}`}
          >
            <div className="mb-1 text-xs font-semibold text-muted-foreground">
              {m.role === 'ADMIN' ? 'Équipe NAWIRA' : 'Toi'}
            </div>
            <p className="whitespace-pre-wrap text-navy">{m.body}</p>
          </div>
        ))}
      </div>

      {error && <p className="mb-3 text-xs text-danger">{error}</p>}

      {closed ? (
        <p className="text-sm text-muted-foreground">Cette demande est fermée.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder="Ta réponse…"
            className="rounded-lg border border-border bg-white p-3 text-sm text-navy outline-none"
          />
          <button
            onClick={() => void sendReply()}
            disabled={sending || !reply.trim()}
            className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? 'Envoi…' : 'Envoyer'}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Manual verification (end-to-end)**

Run `pnpm dev`. As a regular user: submit a request from `/app/help` (Task 15), confirm redirect to `/app/support/<id>` showing the message. Visit `/app/support`, confirm the ticket is listed. As an admin (different browser/session): open `/admin/support`, find the ticket, reveal the email, reply, confirm status flips to "En cours". Back as the user: confirm the reply appears in the thread. Mark the ticket `RESOLVED` as admin, confirm the consumer thread now shows "Cette demande est fermée" instead of a reply box.

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/app/support/
git commit -m "feat(e11): consumer support ticket list + thread pages"
```

---

### Task 17: Full validation gate

**Files:** none (verification only).

- [ ] **Step 1: Run the full gate**

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Expected: all green. If `pnpm build` fails on a route/page that compiled fine in isolation, check for a missing `export const runtime = 'nodejs'` (the runtime-enforcement test in `frontend/src/lib/server/observability/` would have already caught this in `pnpm test`, but `pnpm build` is the final real check) or an unused import flagged by ESLint's `--max-warnings=0`.

- [ ] **Step 2: Update `.planning/banani/STATUS.md`**

Add an entry noting E11 is now fully shipped (CMS + support tickets), and add the three hardcoded-content migration items (help FAQ, conception tips, Projet Bébé resources) to the "Pending" section as explicitly deferred future work, per this plan's spec §0 out-of-scope list.

- [ ] **Step 3: Final commit**

```bash
git add .planning/banani/STATUS.md
git commit -m "docs(e11): mark content CMS + support tickets shipped"
```
