# Plan 005: Bound attachment-cleanup work

> **Executor instructions**: Preserve retention policy and per-item error accounting.
>
> **Drift check**: `git diff --stat 79b6e8c..HEAD -- src/app/api/cron/cleanup-attachments/route.ts src/app/api/cron/cleanup-attachments/route.test.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/003-establish-non-mutating-verification-gate.md
- **Category**: perf
- **Planned at**: commit `79b6e8c`, 2026-07-11
- **Issue**: https://github.com/KovD3v/anthon-2.0/issues/31

## Why this matters

The cleanup loads all users, queries attachments once per user, then deletes each Blob and row serially. Runtime grows without a page or concurrency bound.

## Current state

- `src/app/api/cron/cleanup-attachments/route.ts:51-109` loads all users and performs a per-user attachment query.
- `:112-133` serially deletes Blob and database records.

## Scope

**In scope:** cleanup route and its tests. **Out of scope:** retention-policy values and Blob provider replacement.

## Steps

1. Preserve exact retention calculation while processing users/attachments in bounded pages.
2. Use controlled concurrency for independent Blob deletes and only remove DB rows after a successful or already-absent Blob outcome.
3. Add scale and partial-failure tests, including retained error statistics.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tests | `bunx vitest run src/app/api/cron/cleanup-attachments/route.test.ts` | all pass |
| Lint | `bun run lint` | exit 0 |

## Done criteria

- [ ] No unbounded all-user scan or serial attachment pipeline remains.
- [ ] Failed Blob deletions retain DB rows and are counted.
- [ ] Targeted tests and lint pass.

## STOP conditions

- Stop if attachment ownership cannot be queried without URL-derived user matching.

## Maintenance notes

Keep batch limits configurable and observable in cron logs.
