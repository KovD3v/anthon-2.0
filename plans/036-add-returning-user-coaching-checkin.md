# Plan 036: Turn returning visits into a coaching check-in

> **Executor instructions**: Follow this plan step by step. Build a
> deterministic launcher from data the user can inspect and correct; do not
> generate progress claims or summaries with AI. Plan 035 must be integrated
> first. The reviewer maintains the plan index.
>
> **Drift check (run first)**:
> `git diff --stat 4f17dd9..HEAD -- 'src/app/(chat)/chat/page.tsx' 'src/app/(chat)/chat/layout.tsx' 'src/app/(chat)/chat/layout-client.tsx' src/types/chat.ts src/lib/chat.ts`
> Then confirm Plan 035's coaching-context endpoint and UI exist. Missing Plan
> 035 is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 035
- **Category**: direction
- **Planned at**: commit `4f17dd9`, 2026-07-31

## Why this matters

The chat landing page gives every visitor the same three starter prompts.
Returning users see only a count telling them to use the sidebar. An AI mental
coach should help a returning person resume the thread or reflect on what
happened since the last session, without pretending to know that progress was
made.

This plan adds a small returning-user check-in card. New users and guests keep
the current starter experience.

## Current state

- `src/app/(chat)/chat/page.tsx:17-42` defines three fixed starter prompts.
- `src/app/(chat)/chat/page.tsx:64-132` renders the same greeting and cards for
  authenticated new and returning users.
- The only returning-state copy is a chat count below the generic launcher.
- `src/lib/chat.ts` returns chats ordered by `updatedAt` with title and message
  count.
- `src/types/chat.ts:155-162` already includes `updatedAt`.
- `LayoutClient` already provides chats and `createChat` through context.
- Plan 035 gives users a visible/correctable goal, but no progress state,
  commitment model, or reminder system exists.

## Target contract

- Guests and authenticated users with no chats retain the existing starter
  cards.
- Authenticated users with chats see one primary “Riprendi il percorso” card
  based on the most recently updated chat.
- The card offers:
  - **Riprendi**: navigate to the existing chat;
  - **Com'è andata?**: create a new chat with a neutral reflection prompt.
- The card may show the user-controlled goal from Plan 035 when present, but
  must not expose hidden notes or memories.
- Copy never asserts improvement, completion, adherence, or emotion.
- Recent chat selection is deterministic and requires no model call.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Page tests | `bunx vitest run 'src/app/(chat)/chat/page.test.tsx'` | all pass |
| Layout tests | `bunx vitest run 'src/app/(chat)/chat/layout.test.tsx'` | all pass |
| Full gate | `bun run verify` | exit 0 |
| Hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- A small server projection of the current user's coaching goal, reusing Plan
  035 validation/projection logic.
- `src/app/(chat)/chat/layout.tsx` and context props/types if needed.
- `src/app/(chat)/chat/page.tsx`.
- A new focused behavioral test for the landing page.

**Out of scope**:

- AI-generated recaps, progress scores, sentiment, or outcome claims.
- Commitment entities, streaks, reminders, push notifications, or calendars.
- New schema, RAG, embeddings, analytics funnels, or model calls.
- Sidebar redesign, chat pagination, or channel-specific launchers.
- Showing health memories, internal notes, or full prior messages.

## Git workflow

- Branch: `improve/036-returning-user-checkin`
- Commit: `feat(chat): add returning coaching check-in`
- Do not push, merge, or open a PR unless instructed.

## Steps

### Step 1: Add focused behavioral tests first

Create `src/app/(chat)/chat/page.test.tsx` using the repository's React/Vitest
patterns. Mock Clerk and chat context at their public boundaries. Cover:

- guest with chats still sees the guest starter experience;
- authenticated user with zero chats sees existing starter cards;
- authenticated returning user sees the newest chat by `updatedAt`;
- **Riprendi** calls `navigateToChat` with that chat ID;
- **Com'è andata?** creates one new chat with the exact neutral prompt/title;
- optional goal copy appears only when a non-empty user-controlled goal exists;
- no progress assertion appears.

Use two deliberately unsorted chat fixtures so the page, not incidental input
ordering, proves newest selection.

**Verify**:
the new returning-user tests fail against the current generic page.

### Step 2: Reuse a minimal coaching-goal projection

Extract from Plan 035 a server-only function that returns only the current
user's trimmed `goal`, or `null`. Call it alongside existing authenticated
sidebar data and pass the result through `LayoutClient` context. Guests must
never trigger this query.

Do not fetch the entire profile or memories and do not add a client waterfall.
Keep the goal optional so chat remains available if the profile query fails;
log the count-free failure through the existing logger and render without goal.

**Verify**:
layout tests prove authenticated projection, guest no-query behavior, and
graceful null fallback.

### Step 3: Build the deterministic returning card

In `chat/page.tsx`, distinguish:

1. guest;
2. authenticated new user (`chats.length === 0`);
3. authenticated returning user.

For the returning case, select the greatest `updatedAt`, with a stable ID
tie-breaker. Render the chat title, a locale-safe recent date, and optional
goal. **Riprendi** uses existing `navigateToChat`.

**Com'è andata?** calls `createChat` with neutral Italian copy such as:
“Vorrei fare un check-in sul mio percorso dall'ultima conversazione. Fammi una
domanda alla volta per capire cosa è successo, cosa ha funzionato e dove mi
sono bloccato.” Do not include the prior chat title or goal in the prompt, so
sensitive content is not duplicated into a new record.

Keep a secondary route to the three starter situations or a “Nuovo argomento”
action so returning users are not trapped in continuation. Reuse the current
visual language and preserve mobile keyboard/focus behavior.

**Verify**:
`bunx vitest run 'src/app/(chat)/chat/page.test.tsx'` passes.

### Step 4: Verify in the browser

Run the dev server and use the collaborative preview at desktop and mobile
widths. Check:

- new/guest state remains unchanged;
- returning card selects the most recent chat;
- **Riprendi** navigates without creating a chat;
- **Com'è andata?** creates exactly one chat;
- long titles/goals wrap without layout overflow;
- keyboard focus is visible.

Use only non-sensitive fixture text in screenshots.

**Verify**:
capture or report both empty/new and returning states. If safe authenticated
preview is unavailable, report it and rely on behavioral tests; do not add an
auth bypass.

### Step 5: Run repository gates

**Verify**:
`bun run verify && git diff --check` exits 0.

## Test plan

- Behavioral state matrix: guest, new authenticated, returning authenticated.
- Deterministic newest-chat selection and tie-break.
- Resume navigation versus one-time new check-in creation.
- Optional goal projection and failure fallback.
- No AI call, sensitive-context duplication, or progress claims.
- Desktop/mobile browser check when safe auth exists.

## Done criteria

- [ ] Returning users receive a clear resume/check-in choice.
- [ ] New users and guests retain the existing acquisition launcher.
- [ ] The card uses only recent chat metadata and optional user-controlled goal.
- [ ] No model call or ungrounded progress claim is introduced.
- [ ] Focused tests, browser check when available, full verify, and hygiene pass.

## STOP conditions

- Plan 035 is not integrated or its goal projection is not ownership-safe.
- Rendering requires exposing hidden notes, memories, or prior messages.
- The only browser verification path requires production data or an auth bypass.
- Chat ordering/creation contracts changed materially.
- Verification fails twice after a reasonable correction.

## Maintenance notes

If the product later gains explicit commitments or progress events, replace
chat-recency heuristics only after those records are user-visible and
correctable. Do not infer progress from sentiment, message count, or model
summaries.
