# Plan 003: Establish a non-mutating verification gate

> **Executor instructions**: Follow each step and report failures instead of weakening checks.
>
> **Drift check**: `git diff --stat 79b6e8c..HEAD -- package.json src/lib/ai/orchestrator.test.ts .github`

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `79b6e8c`, 2026-07-11
- **Issue**: https://github.com/KovD3v/anthon-2.0/issues/29

## Why this matters

There is no `typecheck` script or CI workflow. `build` runs database migrations before compilation, so it is unsafe as a routine verification command. A direct `tsc --noEmit` currently fails in two tests because a one-argument fetch mock is read as a two-argument call.

## Current state

- `package.json:5-23` has lint and test scripts, but no typecheck or verify script; `build` runs `prisma migrate deploy`.
- `src/lib/ai/orchestrator.test.ts:1254-1261` and `1337-1345` index `fetchSpy.mock.calls` at `[1]` despite its inferred one-item tuple.
- `.github/` has no workflow files.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Verify | `bun run verify` | lint, typecheck, unit tests pass |

## Scope

**In scope:** `package.json`, `src/lib/ai/orchestrator.test.ts`, `.github/workflows/verify.yml`.

**Out of scope:** production migration execution and live integration tests.

## Steps

1. Correct the test mock typing without changing production behavior.
2. Add non-mutating `typecheck` and `verify` scripts using Bun conventions.
3. Add a Bun-cached GitHub workflow that runs `verify`; keep database-backed integration tests separate.

## Done criteria

- [ ] `bun run typecheck` exits 0.
- [ ] `bun run verify` exits 0 without migrations.
- [ ] CI does not require production credentials.

## STOP conditions

- Stop if the project has an external required CI policy that conflicts with a Bun workflow.

## Maintenance notes

Add new fast checks to `verify`; keep live-provider and database jobs explicitly gated.
