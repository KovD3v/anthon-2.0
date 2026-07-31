# Plan 022: Admin-gate the legacy global RAG API

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving on. If a STOP condition occurs, stop and report; do not improvise. The reviewer maintains `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 56c0a0a..HEAD -- src/app/api/rag/documents/route.ts src/app/api/rag/documents/route.test.ts docs/api.md`
> If an in-scope file changed, compare it with the current-state excerpts below; semantic mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `56c0a0a`, 2026-07-29

## Why this matters

`RagDocument` is a global, unowned corpus whose retrieved text is injected into chat prompts. The legacy route currently lets any signed-in user list, add, delete, or re-embed that corpus. Preserve its existing contract for compatibility, but require the same database-backed admin role used by the UI-facing RAG API.

## Current state

- `src/app/api/rag/documents/route.ts` calls Clerk `auth()` separately in GET, POST, DELETE, and PATCH and accepts any non-null `userId`.
- Each method then calls one of `listDocuments`, `addDocument`, `deleteDocument`, or `updateMissingEmbeddings`.
- `src/app/api/admin/rag/route.ts:23-24` is the authorization exemplar:

```ts
const { errorResponse } = await requireAdmin();
if (errorResponse) return errorResponse;
```

- `src/lib/auth.ts:258-300` returns `401` for unauthenticated callers and `403` for signed-in non-admin callers.
- `docs/api.md:122-130` documents the legacy endpoint without an authorization note.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Focused tests | `bunx vitest run src/app/api/rag/documents/route.test.ts` | all pass |
| Full gate | `bun run verify` | exit 0 |
| Diff hygiene | `git diff --check` | no output |

## Scope

**In scope**:

- `src/app/api/rag/documents/route.ts`
- `src/app/api/rag/documents/route.test.ts`
- `docs/api.md`

**Out of scope**:

- `/api/admin/rag`, `/api/rag/search`, RAG schema, embeddings, parsing, response bodies, and corpus ownership redesign
- deleting or redirecting the legacy route

## Git workflow

- Branch: `improve/022-admin-gate-rag`
- Commit: `fix(rag): require admin for legacy corpus api`
- Do not push or merge.

## Steps

### Step 1: Replace signed-in checks with `requireAdmin`

Remove the direct Clerk import. At the start of every handler, call `requireAdmin()` and immediately return `errorResponse` when present. Authorization must happen before request parsing, parameter validation, or RAG calls. Preserve authorized success and error behavior.

**Verify**: focused tests pass after mocks are updated.

### Step 2: Characterize every denied method

Mock `@/lib/auth`. Add table-driven coverage for GET, POST, DELETE, and PATCH proving both `401` and `403` are returned unchanged and all four RAG operations remain uncalled. Retain authorized validation, success, and downstream-error tests.

**Verify**: `bunx vitest run src/app/api/rag/documents/route.test.ts` exits 0.

### Step 3: Correct the API documentation

Mark all legacy corpus-management methods admin-only and identify `/api/admin/rag` as the UI-facing API. Do not claim that semantic search is admin-only.

**Verify**: `rg -n "admin|/api/rag/documents|/api/admin/rag" docs/api.md` shows the distinction.

### Step 4: Run repository gates

**Verify**: `bun run verify && git diff --check` exits 0.

## Test plan

- Unauthenticated and non-admin denial for all four methods.
- Denial happens before malformed POST/missing DELETE ID validation.
- No corpus operation runs after denial.
- Authorized behavior and response shapes remain unchanged.

## Done criteria

- [ ] Every legacy corpus-management method uses `requireAdmin`.
- [ ] `401`/`403` coverage exists for every method.
- [ ] Denied requests cause zero corpus reads or writes.
- [ ] Documentation distinguishes legacy admin-only management from search.
- [ ] Focused and full gates pass; only in-scope files changed.

## STOP conditions

- A non-admin in-app or documented external caller is discovered.
- `requireAdmin` no longer provides both authentication and database role checks.
- Preserving the route requires changing its public success/error contract.
- Verification fails twice after a reasonable correction.

## Maintenance notes

Any future global-corpus mutation endpoint must use a database-backed admin gate inside the handler; Proxy matching alone is not authorization.
