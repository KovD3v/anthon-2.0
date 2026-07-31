# Plan 032: Make guest signup a lossless continuation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before continuing. Read
> the relevant local Next.js 16 docs before changing the sign-up page or
> `searchParams`. Do not invent a Clerk prop: verify the installed
> `@clerk/nextjs` types first. The reviewer maintains the plan index.
>
> **Drift check (run first)**:
> `git diff --stat 4f17dd9..HEAD -- 'src/app/(chat)/chat/layout.tsx' 'src/app/(chat)/chat/layout-client.tsx' 'src/app/sign-up/[[...sign-up]]/page.tsx' src/app/api/chats/route.ts src/lib/guest-auth.ts src/lib/guest-migration.ts`
> If the guest conversion or post-auth redirect contract changed, reconcile
> this plan with live code before editing. Semantic drift is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `4f17dd9`, 2026-07-31

## Why this matters

The guest experience lets a person establish context before registering, but
the first authenticated render reads the new account's chats before guest data
is migrated. Migration currently happens only when `/api/chats` is fetched,
and a failed attempt still destroys the guest cookie. Registration can
therefore appear to erase the conversation that convinced the person to sign
up.

The product contract is simple: registering from a guest conversation returns
the user to that conversation, and the conversation is already owned by the
authenticated account when the page renders.

## Current state

- `src/app/(chat)/chat/layout-client.tsx:68-118` links the guest banner to the
  generic `/sign-up`, with no continuation target.
- `src/app/sign-up/[[...sign-up]]/page.tsx:1-11` renders `<SignUp />` without
  forwarding a safe post-sign-up route.
- `src/app/(chat)/chat/layout.tsx:89-129` reads authenticated chats immediately
  through `getSharedChats`; it does not perform guest conversion first.
- `src/app/api/chats/route.ts:27-113` owns the only conversion trigger.
- `src/app/api/chats/route.ts:76-80` clears the guest cookie after both success
  and failure, preventing a transient failure from being retried.
- `src/lib/guest-migration.ts` already provides the transactional migration and
  `src/lib/guest-migration.test.ts` covers its data movement.
- `e2e/guest-chat.spec.ts` verifies guest chat continuity, but ends before
  registration.

## Target contract

- The registration link carries only a validated same-origin relative return
  path for the current `/chat` or `/chat/:id` location.
- After Clerk completes sign-up, the browser returns to that path.
- On the first authenticated server render, conversion runs before chat and
  usage reads.
- Conversion is idempotent when the cookie is stale, already converted, maps
  to the authenticated user, or is retried.
- The guest cookie is cleared only after success or a terminal no-op. A
  migration failure preserves it for a later retry.
- No auth bypass, token in a URL, new database schema, or client-side copying
  of chat data is introduced.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Find Next.js docs | `rg -n 'searchParams|Page Props' .next-docs` | relevant Next.js 16 page contract found |
| Verify Clerk API | `rg -n 'forceRedirectUrl|fallbackRedirectUrl' node_modules/@clerk -g '*.d.ts'` | supported installed prop identified |
| Focused tests | `bunx vitest run src/lib/guest-conversion.test.ts src/lib/guest-migration.test.ts src/app/api/chats/route.test.ts 'src/app/(chat)/chat/layout.test.tsx'` | all pass |
| Full gate | `bun run verify` | exit 0 |
| Hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- A shared server-only guest-conversion helper and colocated tests.
- `src/app/(chat)/chat/layout.tsx` and its tests.
- `src/app/(chat)/chat/layout-client.tsx` and a focused test for the link.
- `src/app/api/chats/route.ts` and its route tests.
- `src/app/sign-up/[[...sign-up]]/page.tsx` and a focused route/component test.

**Out of scope**:

- A new onboarding questionnaire.
- Changes to Clerk plans, billing, auth middleware, or production Clerk config.
- Copying messages in the browser.
- Account linking across two authenticated users.
- Marketing, pricing, RAG, model routing, or channel flows.

## Git workflow

- Branch: `improve/032-lossless-guest-signup`
- Commit: `fix(auth): preserve guest conversation through signup`
- Do not push, merge, or open a PR unless instructed.

## Steps

### Step 1: Extract an idempotent server conversion boundary

Create `src/lib/guest-conversion.ts` with one server-only function accepting
the authenticated user ID. It must:

1. read and hash the guest cookie through existing helpers;
2. find only an unconverted guest by the hash;
3. call `migrateGuestToUser` only when guest and authenticated IDs differ;
4. return a typed outcome such as `no_cookie`, `stale_cookie`,
   `already_owned`, `migrated`, or `retryable_failure`;
5. clear the cookie for every terminal outcome, but not
   `retryable_failure`;
6. use the existing structured logger without logging the raw cookie.

Keep database migration logic in `guest-migration.ts`; this helper owns only
lookup, outcome classification, cookie lifecycle, and cache invalidation.
Invalidate the authenticated chat and usage cache tags after a successful
migration, using the same tag factories/contracts as the current shared reads.

**Verify**:
`bunx vitest run src/lib/guest-conversion.test.ts src/lib/guest-migration.test.ts`
passes cases for no cookie, stale cookie, same user, success, and retryable
failure. The failure case asserts that `clearGuestCookie` was not called.

### Step 2: Convert before the first authenticated sidebar read

Call the helper in `getChatSidebarData()` after authentication succeeds and
before `getSharedChats` or `getSharedUsageData`. A retryable conversion failure
must not crash the authenticated page; it should be logged and leave the
cookie available for the next request.

Extend `src/app/(chat)/chat/layout.test.tsx` to prove call ordering: conversion
resolves before the first chat query, and the returned sidebar includes the
migrated chat fixture.

**Verify**:
`bunx vitest run 'src/app/(chat)/chat/layout.test.tsx'` passes.

### Step 3: Reuse the helper in `/api/chats`

Replace the duplicated lookup/migration/cookie block in
`src/app/api/chats/route.ts` with the shared helper. Preserve the route's
existing response shape and authorization behavior. Update route tests so a
failed migration preserves the cookie while success, stale token, and
same-user outcomes clear it.

**Verify**:
`bunx vitest run src/app/api/chats/route.test.ts` passes, and
`rg -n 'migrateGuestToUser|hashGuestToken' src/app/api/chats/route.ts` returns
no duplicated orchestration.

### Step 4: Preserve a safe continuation target

Build the guest banner URL from `usePathname()`. Permit only `/chat` and
`/chat/<single encoded id>`; fall back to `/chat` for anything else. Encode it
as one query parameter, without cookies, IDs from storage, or external origins.

After reading the local Next.js docs and installed Clerk typings, update the
sign-up page to parse and validate that parameter server-side and pass it to
the supported Clerk post-sign-up redirect prop. Do not accept `//host`,
schemes, backslashes, encoded path traversal, or non-chat routes.

Put validation in a small pure helper so hostile and valid inputs can be unit
tested without mounting Clerk.

**Verify**:
focused tests cover `/chat`, a chat ID path, missing input, absolute URLs,
protocol-relative URLs, malformed encoding, and unrelated local routes.

### Step 5: Verify the complete handoff

Run the focused suite and `bun run verify`. If a safe local/preview Clerk test
fixture already exists, manually:

1. create a guest chat and copy only its non-secret ID for comparison;
2. click **Registrati**;
3. complete registration;
4. confirm the browser returns to the same chat and its messages render;
5. reload and confirm the chat remains in the authenticated sidebar.

Do not add a test-only authentication bypass. If no safe fixture exists,
report the live auth check as unavailable while retaining automated coverage.

**Verify**:
`bun run verify && git diff --check` exits 0.

## Test plan

- Unit: conversion outcome and cookie lifecycle.
- Unit: return-path validation rejects open redirects and malformed paths.
- Route: `/api/chats` preserves its response and delegates conversion.
- Server component: migration happens before authenticated sidebar reads.
- UI: banner points to a validated encoded continuation.
- Optional E2E: guest chat → signup → same authenticated chat → reload.

## Done criteria

- [ ] Registration from a guest chat returns to the same chat route.
- [ ] Conversion completes before the first authenticated chat list read.
- [ ] Transient migration failure does not destroy the retry token.
- [ ] Terminal outcomes clear stale guest state.
- [ ] No open redirect or secret-bearing URL is possible.
- [ ] Focused tests, `bun run verify`, and `git diff --check` pass.
- [ ] Only in-scope files and the reviewer-owned plan index changed.

## STOP conditions

- Installed Clerk does not support a safe post-sign-up redirect contract.
- A test-only auth bypass or production account is required.
- Conversion cannot be made idempotent with the current schema.
- Chat/usage cache ownership cannot be identified from live code.
- In-scope semantics drifted materially from the current-state section.
- Verification fails twice after a reasonable correction.

## Maintenance notes

Keep conversion callable from any authenticated entry point, but retain one
implementation. Future OAuth/social sign-up flows must use the same validated
continuation contract. Never clear retryable guest state merely to avoid a
duplicate attempt.
