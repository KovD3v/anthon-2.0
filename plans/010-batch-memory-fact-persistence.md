# Plan 010: Batch memory fact persistence

> **Executor instructions**: Preserve composite-key semantics and explicit failure behavior.
>
> **Drift check**: `git diff --stat 79b6e8c..HEAD -- src/lib/ai/memory-extractor.ts src/lib/ai/memory-extractor.test.ts`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/003-establish-non-mutating-verification-gate.md
- **Category**: perf
- **Planned at**: commit `79b6e8c`, 2026-07-11
- **Issue**: https://github.com/KovD3v/anthon-2.0/issues/36

## Why this matters

Accepted memory facts are persisted by sequential awaits, adding one database round trip per fact after model extraction.

## Current state

- `src/lib/ai/memory-extractor.ts:113-147` filters facts, upserts each fact in a loop, then invalidates the cache.

## Scope

**In scope:** memory extractor and tests. **Out of scope:** extractor prompt, fact schema, user activity semantics.

## Steps

1. Define behavior for duplicate keys and one failed write.
2. Persist independent upserts concurrently with a conservative bound or a suitable transaction.
3. Invalidate prompt cache only under the documented success policy; add tests.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tests | `bunx vitest run src/lib/ai/memory-extractor.test.ts` | all pass |
| Lint | `bun run lint` | exit 0 |

## Done criteria

- [ ] Multiple facts are not serialized without a reason.
- [ ] Duplicate and partial-failure behavior is tested.
- [ ] Targeted tests and lint pass.

## STOP conditions

- Stop if parallel upserts violate a database constraint or known ordering contract.

## Maintenance notes

Keep concurrency bounded; extraction is non-critical background work.
