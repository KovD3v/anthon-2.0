# Plan 025: Split public liveness from admin diagnostics

> **Executor instructions**: Follow the plan exactly and keep raw provider errors out of responses. The reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat 56c0a0a..HEAD -- src/app/api/health src/app/api/admin/health docs/api.md`

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `56c0a0a`, 2026-07-29

## Why this matters

Unauthenticated `/api/health` currently fans out to the database, OpenRouter, Clerk, and a Blob write/delete on every request, and returns raw provider messages. Keep public liveness cheap and move active diagnostics behind the established admin gate.

## Current state

- `src/app/api/health/route.ts` runs four checks in parallel and always returns their details.
- Blob health writes the fixed public object `health-check-test.txt`, then deletes it.
- `src/app/api/health/route.test.ts` codifies the current deep payload.
- `src/lib/admin.ts:getSystemHealth` is used directly by the admin dashboard and need not be rewired.
- `src/app/api/admin/rag/route.ts` demonstrates `requireAdmin`.

## Public interfaces

- `GET /api/health` returns `200`, `{ "status": "ok" }`, and `Cache-Control: no-store`; it imports no provider/database modules.
- New `GET /api/admin/health` requires admin and returns the existing four service keys with redacted statuses. Authorized partial failures still return `200` for diagnostic inspection.

## Scope

**In scope**:

- `src/app/api/health/route.ts`
- `src/app/api/health/route.test.ts`
- new `src/app/api/admin/health/route.ts`
- new `src/app/api/admin/health/route.test.ts`
- `docs/api.md`

**Out of scope**: admin dashboard, Proxy, external monitors, new secrets, provider retry policy.

## Git workflow

- Branch: `improve/025-health-split`
- Commit: `fix(health): separate liveness from admin diagnostics`
- Do not push or merge.

## Steps

### Step 1: Reduce public health to liveness

Return exactly `{status:"ok"}` with `Cache-Control: no-store`. Remove Prisma, Clerk, OpenRouter, and Blob imports.

**Verify**: public test proves the body/header and needs no provider mocks.

### Step 2: Add admin deep diagnostics

Move the four active checks to `/api/admin/health`, authorize before any work, use the project logger for internal errors, and return stable redacted messages. Use a collision-free Blob pathname and attempt deletion in `finally` after a successful upload.

**Verify**: admin tests cover 401/403 short-circuit, success, each provider failure, redaction, and Blob cleanup.

### Step 3: Update docs and run gates

Document public liveness and admin-only deep diagnostics separately.

**Verify**: `bunx vitest run src/app/api/health/route.test.ts src/app/api/admin/health/route.test.ts && bun run verify && git diff --check` exits 0.

## Done criteria

- [ ] Public health performs no dependency calls.
- [ ] Deep checks require database-backed admin authorization.
- [ ] Raw provider errors never reach clients.
- [ ] Blob probes use unique names and cleanup.
- [ ] Tests, docs, and full verification pass.

## STOP conditions

- A documented external consumer requires the old public payload.
- Blob cleanup cannot be guaranteed after upload.
- Admin authorization requires a new credential mechanism.
- Verification fails twice.

## Maintenance notes

Do not gradually add dependency checks back to public liveness. External readiness monitoring would require a separately designed operator credential.
