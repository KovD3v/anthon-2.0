# Plan 018: Page and throttle maintenance fan-out

> **Executor instructions**: Follow every step and gate. Stop on STOP conditions. Update the index row when done unless a reviewer owns it.
>
> **Drift check (run first)**: `git diff --stat 51d595c..HEAD -- src/app/api/cron/trigger/route.ts src/app/api/cron/trigger/route.test.ts src/lib/qstash.ts src/lib/qstash.test.ts`

## Status

- **Execution status**: BLOCKED on 2026-07-15 — no caller follows a returned cursor, `/api/cron/trigger` is not registered in `vercel.json`, and profile analysis can append duplicate notes on replay. Product/operations must choose a continuation owner and authorize replay-idempotency work before this plan can resume.
- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `51d595c`, 2026-07-15

## Why this matters

The maintenance trigger loads every eligible user and launches one or two QStash publishes per user through a single `Promise.allSettled`. Runtime, memory, sockets, and provider pressure therefore grow without a bound. Page users, cap concurrent publishes, and make continuation/retry behavior explicit.

## Current state

- `src/app/api/cron/trigger/route.ts:20-28` fetches all non-guest, non-deleted users without `take` or cursor.
- `:37-75` maps the full list into concurrent publishes; `job=all` creates two publishes per user.
- `:77-100` retains every result and returns aggregate counts. Authentication correctly fails closed on missing/mismatched `CRON_SECRET`; preserve it.
- `src/app/api/cron/cleanup-attachments/route.ts:206-239` is the repo exemplar for bounded cursor-page responses.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `bunx vitest run src/app/api/cron/trigger/route.test.ts src/lib/qstash.test.ts` | all pass |
| Full gate | `bun run verify` | exit 0 |
| Hygiene | `git diff --check` | no output |

## Scope

**In scope**: `src/app/api/cron/trigger/route.ts`, `src/app/api/cron/trigger/route.test.ts`, and `src/lib/qstash.ts`/test only if a reusable bounded-publish helper is necessary.

**Out of scope**: downstream consolidate/archive/analyze job behavior, schedules, QStash replacement, rate-limit policy, or secret configuration.

## Git workflow

- Branch: `advisor/018-page-maintenance-fanout`
- Conventional commit: `perf(maintenance): bound cron fanout`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Define bounded configuration and cursor contract

Add conservative default/max page size and publish concurrency constants with clamped configuration. Accept an opaque/stable user cursor and fetch `limit + 1` ordered IDs. Return `hasMore` and `nextCursor` with counts. Reject unknown `job` values before querying users.

**Verify**: route tests cover missing secret, invalid job, default/clamped bounds, first page, and final page.

### Step 2: Throttle publication and preserve accounting

Replace full-set `Promise.allSettled` with a small worker pool over only the selected page. Preserve per-user structured failure logs and exact `jobsPublished`; do not log secrets or payload bodies. Ensure one failed publish does not block other users in the page.

**Verify**: tests instrument active mock calls and prove concurrency never exceeds the configured cap for `all`, while partial failures retain correct counts.

### Step 3: Make continuation operationally safe

Choose one explicit continuation owner: either the scheduler repeatedly calls the returned cursor or the route self-publishes a continuation with authenticated internal semantics. Use the existing deployment/runbook convention; do not implement both. Document that duplicate page execution is allowed only because downstream jobs are idempotent, and add evidence/tests for that assumption or STOP.

**Verify**: a multi-page test visits each user once in the normal path; replaying a page does not violate the documented downstream contract.

### Step 4: Run gates

**Verify**: `bunx vitest run src/app/api/cron/trigger/route.test.ts src/lib/qstash.test.ts && bun run verify && git diff --check` -> all exit 0.

## Test plan

- Use mocked Prisma pages and QStash publishing; no network or real secrets.
- Cover zero users, `all` producing two jobs/user, each single job type, partial failures, concurrency cap, cursor continuation, and replay.
- Assert user IDs remain structured metadata and errors are safely logged.

## Done criteria

- [ ] Each invocation queries and retains only one bounded user page.
- [ ] Concurrent publishes never exceed the configured maximum.
- [ ] Continuation, invalid job handling, partial failures, and counts are tested.
- [ ] Downstream idempotency is evidenced or the plan stops before enabling replay.
- [ ] Focused/full gates and diff hygiene pass; only in-scope files/index changed.

## STOP conditions

- Downstream jobs are not idempotent and page replay can duplicate destructive work.
- No reliable continuation owner exists in the deployment model.
- Stable cursor paging conflicts with active soft deletion/user creation semantics.
- Completing the change requires altering schedules or external infrastructure without operator approval.

## Maintenance notes

Track page duration, publish failures, and continuation lag. Tune page size separately from concurrency and revisit both as QStash quotas or user volume change.
