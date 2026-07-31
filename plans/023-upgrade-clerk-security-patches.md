# Plan 023: Upgrade Clerk beyond the advisory ranges

> **Executor instructions**: Follow this plan exactly, verify every command, and stop on any listed condition. The reviewer maintains the plan index.
>
> **Drift check (run first)**: `git diff --stat 56c0a0a..HEAD -- package.json bun.lock src/proxy.ts`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: dependencies
- **Planned at**: commit `56c0a0a`, 2026-07-29

## Why this matters

The app pins `@clerk/nextjs` 6.36.5 and uses `createRouteMatcher` in `src/proxy.ts`. That version is affected by the critical route-matcher bypass fixed in 6.39.2 and is also inside the combined-authorization advisory range fixed in 6.39.3. Upgrade to the final vetted patch in the same major without mixing in a Clerk 7 migration.

## Current state

- `package.json:36`: `"@clerk/nextjs": "6.36.5"`.
- `bun.lock` resolves the same root version.
- `src/proxy.ts:1,6` imports and invokes `createRouteMatcher`.
- No affected combined `has()` or `auth.protect()` object was found during planning, but re-check before upgrading.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Upgrade | `bun add --exact @clerk/nextjs@6.39.6` | manifest/lock update only |
| Auth tests | `bunx vitest run src/lib/auth.test.ts` | all pass |
| Full gate | `bun run verify` | exit 0 |

## Scope

**In scope**: `package.json`, `bun.lock`.

**Out of scope**: Clerk 7, Proxy/auth rewrites, route-matcher changes, unrelated dependency upgrades, live Clerk configuration.

## Git workflow

- Branch: `improve/023-clerk-security-patches`
- Commit: `build(deps): patch clerk authorization bypasses`
- Do not push or merge.

## Steps

### Step 1: Reconfirm applicable usage

Search for `createRouteMatcher`, `auth.protect`, and `has(`. If a combined authorization object is found, stop and report because source changes need a separate scope.

**Verify**: record the search result in the executor report.

### Step 2: Upgrade only Clerk Next.js

Run `bun add --exact @clerk/nextjs@6.39.6`. Inspect both diffs and reject unrelated intentional upgrades.

**Verify**: `bun pm ls @clerk/nextjs` reports exactly 6.39.6; `rg -n '"@clerk/nextjs"' package.json bun.lock` contains no 6.36.5 root resolution.

### Step 3: Run auth and repository gates

**Verify**: `bunx vitest run src/lib/auth.test.ts && bun run verify && git diff --check` exits 0.

## Test plan

No source behavior changes are expected. Existing auth tests and the full gate cover API compatibility and type resolution. Report authenticated browser verification as skipped if Clerk credentials are unavailable; do not weaken production code.

## Done criteria

- [ ] Root Clerk package is exactly 6.39.6.
- [ ] No unrelated dependency was intentionally upgraded.
- [ ] Auth tests and full verification pass.
- [ ] Only `package.json` and `bun.lock` changed.

## STOP conditions

- 6.39.6 is unavailable or incompatible with current Next/React peers.
- Bun requires Clerk 7 or unrelated SDK upgrades.
- An affected combined authorization call is discovered.
- Verification fails twice after a reasonable correction.

## Maintenance notes

Treat a future Clerk 7 upgrade as a separate migration with its codemod and authenticated browser checks.
