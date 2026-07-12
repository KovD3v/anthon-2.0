# Plan 006: Characterize account-deletion failures

> **Executor instructions**: Add tests only; do not redesign deletion consistency in this plan.
>
> **Drift check**: `git diff --stat 79b6e8c..HEAD -- src/app/api/user/me/route.ts src/app/api/user/me/route.test.ts`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/003-establish-non-mutating-verification-gate.md
- **Category**: tests
- **Planned at**: commit `79b6e8c`, 2026-07-11
- **Issue**: https://github.com/KovD3v/anthon-2.0/issues/32

## Why this matters

Account deletion removes Clerk first and the local user second. The irreversible route has no test coverage for authorization or partial failure.

## Current state

- `src/app/api/user/me/route.ts:14-42` authenticates, calls Clerk deletion, then Prisma deletion and returns a generic 500 on error.

## Scope

**In scope:** create `src/app/api/user/me/route.test.ts`; make only testability-neutral route changes if required. **Out of scope:** changing Clerk/DB ordering or recovery design.

## Steps

1. Follow nearby API route mock conventions.
2. Test unauthenticated request, success order, Clerk failure, database failure after Clerk success, and logger redaction.
3. Record current partial-failure behavior explicitly in test names.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tests | `bunx vitest run src/app/api/user/me/route.test.ts` | all pass |
| Lint | `bun run lint` | exit 0 |

## Done criteria

- [ ] Every listed outcome has a meaningful assertion.
- [ ] No credential or account-sensitive data is asserted in logs.
- [ ] Targeted tests and lint pass.

## STOP conditions

- Stop if the route cannot be imported under the existing route-test harness.

## Maintenance notes

A later product decision should address compensating action for the Clerk-success/DB-failure case.
