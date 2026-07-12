# Plan 008: Bound admin funnel analytics

> **Executor instructions**: Preserve current session semantics before optimizing.
>
> **Drift check**: `git diff --stat 79b6e8c..HEAD -- src/app/api/admin/analytics/route.ts src/app/api/admin/analytics/route.test.ts prisma/schema.prisma`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/007-add-critical-persistence-integration-coverage.md
- **Category**: perf
- **Planned at**: commit `79b6e8c`, 2026-07-11
- **Issue**: https://github.com/KovD3v/anthon-2.0/issues/34

## Why this matters

Funnel analytics loads every user message into JS and retains timestamp arrays per user to calculate session progress. Admin-request latency and memory grow with lifetime message volume.

## Current state

- `src/app/api/admin/analytics/route.ts:281-325` fetches all users and all user-message timestamps.
- `:262-275` calculates the third valid session from per-user arrays.

## Scope

**In scope:** analytics route/tests and a migration only if schema evidence proves an index is required. **Out of scope:** changing funnel definitions or dashboard response shape.

## Steps

1. Add characterization cases for session-boundary timestamps.
2. Move countable aggregation/session boundary computation to bounded database work, preserving current results.
3. Add a migration only when query-plan evidence supports a missing index.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tests | `bunx vitest run src/app/api/admin/analytics/route.test.ts` | all pass |
| Integration | `bun run test:integration` | all pass if DB configured |

## Done criteria

- [ ] The endpoint no longer loads lifetime user-message rows into memory.
- [ ] Boundary characterization tests match previous funnel results.
- [ ] Relevant tests pass.

## STOP conditions

- Stop if SQL/window-function behavior differs from the existing session algorithm on characterization cases.

## Maintenance notes

Document any SQL semantics beside the funnel definition.
