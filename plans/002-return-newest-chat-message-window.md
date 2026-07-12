# Plan 002: Return the newest chat-message window

> **Executor instructions**: Follow this plan step by step and run every verification command. Stop and report on drift.
>
> **Drift check**: `git diff --stat 79b6e8c..HEAD -- src/app/api/chat/messages/route.ts src/app/api/chat/messages/route.test.ts`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `79b6e8c`, 2026-07-11
- **Issue**: https://github.com/KovD3v/anthon-2.0/issues/28

## Why this matters

The endpoint promises the last 100 messages but requests ascending rows with `take: 100`; chats longer than that omit their active tail.

## Current state

- `src/app/api/chat/messages/route.ts:48-64` uses `orderBy: { createdAt: "asc" }` and `take: 100`.
- Use the existing colocated route test style in `src/app/api/chat/messages/route.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit tests | `bunx vitest run src/app/api/chat/messages/route.test.ts` | all pass |
| Lint | `bun run lint` | exit 0 |

## Scope

**In scope:** `src/app/api/chat/messages/route.ts`, `src/app/api/chat/messages/route.test.ts`.

**Out of scope:** response schema, pagination API design, chat ownership rules.

## Steps

1. Query the newest deterministic 100-message window, using a stable timestamp/ID ordering if the Prisma schema supports it.
2. Return that selected window in chronological order without changing the response shape.
3. Add a >100-message regression test that asserts newest-window selection and ascending response order.

## Done criteria

- [ ] A 101+ message chat returns the most recent 100 messages in chronological order.
- [ ] Existing owner and no-chat behavior is unchanged.
- [ ] Targeted test and lint pass.

## STOP conditions

- Stop if callers rely on reverse chronological output.

## Maintenance notes

If cursor pagination is introduced later, retain the chronological client contract.
