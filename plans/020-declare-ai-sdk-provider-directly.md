# Plan 020: Declare the imported AI SDK provider package directly

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 51d595c..HEAD -- package.json bun.lock src/lib/ai/providers/openrouter-routing.ts`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dependencies
- **Planned at**: commit `51d595c`, 2026-07-15

## Why this matters

Production code imports `JSONObject` from `@ai-sdk/provider`, but `package.json` does not declare that package. The import currently succeeds only because other AI SDK packages hoist version `4.0.1`; a lockfile/layout change could break typechecking even though the source import did not change. Declaring the exact compatible package makes ownership explicit and lets dependency tooling reason about it correctly.

## Current state

- `src/lib/ai/providers/openrouter-routing.ts:1` contains `import type { JSONObject } from "@ai-sdk/provider";`.
- `package.json:31-77` declares `@ai-sdk/devtools`, `@ai-sdk/react`, and `ai`, but not `@ai-sdk/provider`.
- `bun.lock:91` already resolves `@ai-sdk/provider@4.0.1`; current AI SDK packages also depend on that version.
- Match the sorted `@ai-sdk/*` dependency grouping and keep this as a runtime dependency because production TypeScript source imports its public type.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Add dependency | `bun add @ai-sdk/provider@4.0.1` | exit 0; manifest and lockfile updated |
| Dependency check | `bun run knip` | exit 0; no unused/duplicate dependency finding for `@ai-sdk/provider` |
| Full gate | `bun run verify` | exit 0 |

## Scope

**In scope**:

- `package.json`
- `bun.lock`

**Out of scope**:

- Source imports, AI SDK upgrades, OpenRouter routing behavior, overrides, and provider type refactors.
- Updating any other direct or transitive dependency.

## Git workflow

- Branch: `advisor/020-direct-ai-sdk-provider`.
- Conventional commit: `build(deps): declare ai sdk provider`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Add the compatible direct dependency

Run `bun add @ai-sdk/provider@4.0.1`. Ensure it appears in `dependencies` (not `devDependencies`) and that Bun reuses the existing `4.0.1` resolution. Do not run a broad upgrade.

**Verify**: `bun pm ls @ai-sdk/provider && rg -n '"@ai-sdk/provider"' package.json bun.lock` → the root manifest lists exactly `4.0.1` and the lockfile resolves `4.0.1` without introducing a new root version.

### Step 2: Verify dependency ownership and repository health

Run dependency analysis, then the normal gate.

**Verify**: `bun run knip && bun run verify && git diff --check` → all commands exit 0; Knip does not report `@ai-sdk/provider` as unused or unlisted.

### Step 3: Confirm the diff is dependency-only

Inspect the manifest and lockfile diff. It should add one root dependency entry and the corresponding root lockfile relationship; existing transitive resolutions may be reused.

**Verify**: `git diff -- package.json bun.lock && git status --short` → no package other than `@ai-sdk/provider@4.0.1` is intentionally upgraded and no source file is modified.

## Test plan

- No new test is required because runtime behavior is unchanged.
- `bun run typecheck` inside `bun run verify` proves the direct type import resolves.
- `bun run knip` proves dependency declaration/import alignment.

## Done criteria

- [ ] `package.json` directly declares `@ai-sdk/provider` at compatible version `4.0.1`.
- [ ] `bun.lock` records the direct root dependency without an unrelated upgrade.
- [ ] `bun run knip`, `bun run verify`, and `git diff --check` exit 0.
- [ ] Only `package.json`, `bun.lock`, and the index status row are modified.

## STOP conditions

- Bun attempts to resolve a version other than `4.0.1` for the root dependency.
- Adding the package requires upgrading `ai`, `@ai-sdk/react`, or another SDK package.
- Knip reports the package as unused despite the live import at `openrouter-routing.ts:1`.
- Any verification fails twice after a reasonable correction.

## Maintenance notes

When the AI SDK is upgraded, update `@ai-sdk/provider` in the same dependency change and confirm the public `JSONObject` type remains compatible. Reviewers should reject a lockfile diff that upgrades unrelated packages under this plan.
