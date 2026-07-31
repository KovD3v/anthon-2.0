# Plan 029: Page chat history and use one intent-driven prefetch path

> **Executor instructions**: Follow each step and verification gate. Preserve
> create, rename, delete, active-chat, guest, and authenticated behavior. Stop
> instead of broadening the response contract or reintroducing a second chat
> cache. The reviewer maintains the plan index.
>
> **Drift check (run first)**:
> `git diff --stat 56c0a0a..HEAD -- src/lib/chat.ts src/app/api/chats/route.ts src/app/api/guest/chats/route.ts src/app/(chat)/chat/layout.tsx src/app/(chat)/chat/layout-client.tsx src/app/(chat)/components/ChatList.tsx src/app/(chat)/chat/[id]/chat-conversation-client.tsx src/types/chat.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `56c0a0a`, 2026-07-29

## Why this matters

The sidebar loads, serializes, mounts, and counts every chat in an account.
Every item forces full prefetch of a dynamic route, and hover additionally
requests the same 50-message chat through `/api/chats/:id` into a separate
20-chat client cache. Database work, RSC/API bytes, hydration, DOM size, and
prefetch traffic therefore grow with account age and hover activity.

The target is a totally ordered cursor-paginated sidebar and exactly one
intent-driven route-prefetch owner.

## Current state

- `src/lib/chat.ts:44-73` queries every chat ordered only by `updatedAt DESC`
  and caches the complete list for 60 seconds.
- `src/app/api/chats/route.ts:84-108` and
  `src/app/api/guest/chats/route.ts:29-58` also return complete lists.
- `src/app/(chat)/chat/layout.tsx:75-85` serializes the full shared list into
  the persistent client layout.
- `src/app/(chat)/components/ChatList.tsx:114-128` mounts every chat.
- `src/app/(chat)/components/ChatList.tsx:217-220` sets `prefetch={true}`.
- Local Next.js 16 docs at
  `.next-docs/01-app/03-api-reference/02-components/link.mdx:302-303` state that
  `true` fetches the full route for dynamic routes; default/auto fetches only
  the partial route to the nearest loading boundary.
- `src/app/(chat)/chat/layout-client.tsx:236-318` owns a second `Map` cache and,
  on hover, calls both `router.prefetch` and `/api/chats/:id`.
- `src/app/(chat)/chat/[id]/chat-conversation-client.tsx:311-353` synchronizes
  the second cache only after the server route already supplied initial data.
- `prisma/schema.prisma` has `[userId, updatedAt DESC]`; use `(updatedAt, id)` as
  the deterministic application order without adding a migration unless query
  evidence proves it necessary.

## Target contract

- Initial sidebar window: 30 chats plus one sentinel row for `hasMore`.
- Stable order: `(updatedAt DESC, id DESC)`.
- Cursor: opaque to the UI; the server decodes/validates it and returns
  `nextCursor`.
- Loading another page appends without duplicates and preserves the active chat.
- Create prepends the new chat; rename/delete reconcile all loaded pages.
- Refresh replaces the loaded window coherently rather than silently dropping
  an active chat.
- Link viewport prefetch is disabled; a deduplicated hover/focus handler calls
  only `router.prefetch`.
- The custom full-`ChatData` hover cache is removed.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Shared chat tests | `bunx vitest run src/lib/chat.test.ts` | all pass |
| Auth route tests | `bunx vitest run src/app/api/chats/route.test.ts` | all pass |
| Guest route tests | `bunx vitest run src/app/api/guest/chats/route.test.ts` | all pass |
| UI behavior | `bunx vitest run 'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx' 'src/app/(chat)/chat/layout.test.tsx'` | all pass |
| Full gate | `bun run verify` | exit 0 |
| Hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- `src/lib/chat.ts`
- `src/lib/chat.test.ts`
- `src/app/api/chats/route.ts`
- `src/app/api/chats/route.test.ts`
- `src/app/api/guest/chats/route.ts`
- `src/app/api/guest/chats/route.test.ts`
- `src/app/(chat)/chat/layout.tsx`
- `src/app/(chat)/chat/layout.test.tsx`
- `src/app/(chat)/chat/layout-client.tsx`
- `src/app/(chat)/components/ChatList.tsx`
- `src/app/(chat)/chat/[id]/chat-conversation-client.tsx`
- `src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx`
- `src/types/chat.ts`

**Out of scope**:

- Message pagination inside a chat.
- Search-dialog semantics.
- Database migrations without measured `EXPLAIN` evidence.
- Renaming, deleting, or changing visibility APIs beyond pagination adaptation.
- Prefetching multiple chats speculatively.
- Introducing another client cache library.

## Git workflow

- Branch: `improve/029-page-chat-sidebar`
- Commit: `perf(chat): page sidebar history`
- Do not push, merge, or open a PR unless instructed.

## Steps

### Step 1: Define one paginated server contract

Add a shared `ChatListPage` type with `chats`, `hasMore`, and `nextCursor`.
Implement a server-only helper in `src/lib/chat.ts` accepting a bounded limit
and optional cursor. Query `limit + 1` rows in
`[{updatedAt:"desc"},{id:"desc"}]` order and select only current sidebar
fields. Encode the cursor as an opaque versioned value; validate malformed
cursors as `400` in API routes.

Keep `getSharedChats` compatibility only if another caller requires it;
otherwise replace it with the paged helper and cache only the first page.

**Verify**:
`bunx vitest run src/lib/chat.test.ts` → tests cover first page, next page,
same-timestamp IDs, malformed cursor, and no duplicates.

### Step 2: Page authenticated and guest list routes

Update both list GET routes to accept `cursor` and a server-capped `limit`.
Return the same chat fields plus pagination metadata. Preserve guest migration,
ownership, serialization, and error behavior.

**Verify**:
the authenticated and guest route-test commands pass, including a 31-row
fixture that returns 30 rows and a cursor.

### Step 3: Render and load a bounded sidebar

Change `getChatSidebarData` and `LayoutClient` to receive the initial page.
Add a load-more affordance or intersection trigger to `ChatList` that:

- requests one page at a time;
- suppresses concurrent requests;
- appends by ID without duplicates;
- preserves ordering returned by the server;
- exposes retry after failure;
- keeps the current active chat visible if it falls outside a refreshed first
  page.

Creation, rename, deletion, and refresh must update the loaded collection
without assuming all account chats are resident.

**Verify**:
layout/UI tests cover initial bound, load more, deduplication, failure retry,
create, rename, delete, and active-chat preservation.

### Step 4: Remove duplicate prefetch and cache ownership

Set sidebar links to `prefetch={false}` so mounting/viewport visibility cannot
fan out full dynamic-route work. Keep a single deduplicated intent handler that
calls `router.prefetch('/chat/:id')` on mouse hover and keyboard focus.

Delete the full `ChatData` `Map`, `/api/chats/:id` hover fetch,
`getCachedChat`, and `updateCachedChat` from `ChatContextType`. Remove their
initialization/synchronization effects and test mocks from
`chat-conversation-client.tsx`; retain explicit refresh/pagination fetches used
for actual message state.

**Verify**:
`rg -n 'chatCacheRef|getCachedChat|updateCachedChat|MAX_CACHE_SIZE' 'src/app/(chat)'`
returns no matches, and UI tests prove one prefetch call for repeated hover/focus
on the same item.

### Step 5: Run full gates

**Verify**:
`bun run verify && git diff --check` → exit 0.

## Test plan

- Shared data tests: bounded query, tuple order, cursor continuation, malformed
  cursor, final page.
- Auth/guest route tests: response shape, server limit cap, migration/auth
  behavior unchanged.
- UI tests: load-more success/failure/concurrency, deduplication, mutations,
  active chat, hover/focus prefetch.
- Conversation-client tests: server `initialChatData` remains authoritative and
  explicit refresh/load-more still work after custom cache removal.

## Done criteria

- [ ] Initial server query, RSC payload, and mounted sidebar are capped at 30.
- [ ] Pagination has a deterministic `(updatedAt,id)` order with no duplicates.
- [ ] Guest and authenticated APIs expose the same pagination semantics.
- [ ] Mounting the sidebar triggers no full-chat prefetch fan-out.
- [ ] One intent-driven route prefetch occurs per chat; no second API fetch/cache remains.
- [ ] Create, rename, delete, refresh, and active-chat behavior are tested.
- [ ] Focused tests and `bun run verify` pass.
- [ ] Only in-scope files and the reviewer-owned plan index changed.

## STOP conditions

- Correct pagination requires a schema migration without query-plan evidence.
- Existing callers require the complete chat list for a non-sidebar contract.
- Removing the custom cache causes unsolved loss of edits or streaming state.
- Guest and authenticated routes cannot share cursor semantics safely.
- Work expands into message pagination or search redesign.
- Verification fails twice after a reasonable correction.

## Maintenance notes

Any future sidebar sorting field must become part of the total-order cursor.
Keep route prefetch and client API caching under one owner; never warm the same
chat through both RSC and JSON paths.
