# Plan 030: Refresh usage from events instead of unconditional polling

> **Executor instructions**: Preserve quota/paywall correctness while removing
> redundant requests. Follow each verification gate and stop if the UI cannot
> obtain a fresh post-turn snapshot without broad polling. The reviewer
> maintains the plan index.
>
> **Drift check (run first)**:
> `git diff --stat 56c0a0a..HEAD -- src/app/(chat)/chat/layout-client.tsx src/app/(chat)/chat/[id]/chat-conversation-client.tsx src/app/(chat)/chat/layout-client.behavior.test.tsx src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/027-add-authenticated-chat-performance-gate.md`
- **Category**: perf
- **Planned at**: commit `56c0a0a`, 2026-07-29

## Why this matters

The chat layout receives a server-rendered usage snapshot and immediately
refetches it, then polls every 30 seconds even in hidden tabs and also refreshes
on focus and visibility. Each authenticated request can perform several
database/entitlement operations and a stale-billing Clerk synchronization.
Open tabs therefore create continuous backend work when usage has not changed.

The target is a single deduplicated refresh owner triggered by actual
usage-changing chat completion plus a stale-on-focus safety refresh.

## Current state

- `src/app/(chat)/chat/layout.tsx:75-83` supplies `initialUsageData`.
- `src/app/(chat)/chat/layout-client.tsx:173-212` immediately fetches with
  `cache: "no-store"`, starts a 30-second interval, and listens to both focus
  and visibility.
- `src/app/api/usage/route.ts:35-70` loads the full user, may synchronize Clerk
  billing, reads daily usage, and resolves entitlements.
- `src/app/(chat)/chat/[id]/chat-conversation-client.tsx:201` owns the AI SDK
  `onFinish` callback, the natural point after a successful turn may have
  changed usage.
- `src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx` is the
  existing jsdom behavior-test pattern.

## Target contract

- No immediate mount refetch when valid SSR usage exists.
- No fixed 30-second polling interval.
- A successful completed assistant turn requests one refresh.
- Focus/visible refresh occurs only when the snapshot is older than a named
  freshness budget (default five minutes).
- Concurrent triggers share one in-flight request.
- Hidden documents do not refresh.
- Failed requests retain the last good snapshot and become retryable.
- Guest and authenticated endpoints retain their current response contracts.
- Billing or subscription-changing UI can explicitly force a refresh.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Layout behavior | `bunx vitest run 'src/app/(chat)/chat/layout-client.behavior.test.tsx'` | all pass |
| Conversation behavior | `bunx vitest run 'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx'` | all pass |
| Usage routes | `bunx vitest run src/app/api/usage/route.test.ts src/app/api/guest/usage/route.test.ts` | all pass |
| Full gate | `bun run verify` | exit 0 |
| Hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- `src/app/(chat)/chat/layout-client.tsx`
- new `src/app/(chat)/chat/layout-client.behavior.test.tsx`
- `src/app/(chat)/chat/[id]/chat-conversation-client.tsx`
- `src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx`

**Out of scope**:

- Usage API response shape or rate-limit accounting.
- Clerk subscription synchronization policy.
- Optimistic local token/cost calculation.
- A new state-management or polling dependency.
- Service workers, cross-device real-time synchronization, or WebSockets.

## Git workflow

- Branch: `improve/030-event-driven-usage-refresh`
- Commit: `perf(chat): replace usage polling`
- Do not push, merge, or open a PR unless instructed.

## Steps

### Step 1: Define one refresh owner in the layout

In `layout-client.tsx`, replace the interval effect with a stable
`refreshUsageData({force?: boolean})` callback and refs for:

- last successful snapshot time, initialized from `initialUsageData`;
- the current in-flight promise or abort controller;
- the five-minute stale threshold.

Return the existing in-flight promise for concurrent triggers. Skip non-forced
refresh while hidden or still fresh. On failure retain current state and clear
the in-flight marker.

Do not append `?t=${Date.now()}`; `cache: "no-store"` already expresses the
request contract.

**Verify**:
layout behavior tests prove no mount fetch, request deduplication, stale/fresh
focus behavior, hidden-tab suppression, and retry after failure.

### Step 2: Trigger refresh after usage-changing turns

Expose a narrow context method such as `refreshUsage({force:true})`. Call it
from the conversation client's existing successful `onFinish` path after the
server stream completes. Do not call it for aborted/failed turns.

Use the context method rather than a global stringly typed browser event unless
the existing component boundary makes a context call impossible. If an event
is necessary, centralize its constant and payload type in one in-scope file.

**Verify**:
conversation behavior tests prove one refresh after successful finish and none
after error/abort.

### Step 3: Coalesce focus and visibility

Keep one shared handler for focus and transition to visible. It calls the stale
refresh without force; back-to-back browser events therefore share one request
or skip while fresh. Remove `setInterval` entirely.

**Verify**:
fake-timer tests advance below/above the stale threshold and assert exact fetch
counts.

### Step 4: Run focused and full gates

**Verify**:
all four commands above pass and `rg -n 'setInterval\\(refreshUsageData'
'src/app/(chat)/chat/layout-client.tsx'` returns no matches.

## Test plan

Add jsdom tests for:

- SSR snapshot avoids immediate fetch;
- no interval requests after several simulated minutes;
- successful chat finish forces one refresh;
- repeated finish/focus/visibility events deduplicate;
- fresh focus skips; stale focus refreshes;
- hidden state skips until visible;
- failed fetch keeps previous data and permits retry;
- component unmount aborts or ignores a late response.

## Done criteria

- [ ] No fixed usage polling interval remains.
- [ ] No redundant mount fetch occurs with SSR data.
- [ ] Successful completed turns refresh usage once.
- [ ] Focus/visibility refresh only stale data and coalesce.
- [ ] Hidden tabs make no usage requests.
- [ ] Failure and unmount behavior are tested.
- [ ] Focused tests and `bun run verify` pass.
- [ ] Plan-027 comparison shows lower idle request volume with no stale post-turn UI.
- [ ] Only in-scope files and the reviewer-owned plan index changed.

## STOP conditions

- Successful stream completion cannot distinguish billed from failed turns.
- Correctness would require optimistic client-side usage accounting.
- Another subscription/billing surface depends on the 30-second interval and
  cannot explicitly trigger refresh within scope.
- Plan 027 cannot provide a safe authenticated validation environment.
- Verification fails twice after a reasonable correction.

## Maintenance notes

Any future usage-changing action should explicitly call the shared refresh
owner. Keep the freshness interval a named policy, not a hidden timer, and
continue treating server usage as authoritative.
