# Plan 009: Separate migrations from application builds

> **Executor instructions**: Do not change production deployment ordering without an explicit documented path.
>
> **Drift check**: `git diff --stat 79b6e8c..HEAD -- package.json README.md docs .github`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: plans/003-establish-non-mutating-verification-gate.md
- **Category**: migration
- **Planned at**: commit `79b6e8c`, 2026-07-11
- **Issue**: https://github.com/KovD3v/anthon-2.0/issues/35

## Why this matters

The build script runs `prisma migrate deploy` with retries before Next compilation. Artifact construction therefore mutates database state and fails when database connectivity is unavailable.

## Current state

- `package.json:7` combines Prisma generation, migration deployment with sleeps, and `next build`.

## Scope

**In scope:** package scripts, deployment workflow/configuration, and deployment docs. **Out of scope:** destructive schema changes and applying a migration to production.

## Steps

1. Make `build` artifact-only: generate Prisma client and compile the app.
2. Add a dedicated serialized migration command/job with environment gating.
3. Document expand/contract migration ordering and verify preview/production paths separately.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Artifact build | `bun run build` | compile succeeds without migration command |
| Migration | `bun run migrate:deploy` | only runs in intended deployment job |

## Done criteria

- [ ] Routine build command does not run migrations.
- [ ] Migrations have one documented, serialized deployment owner.
- [ ] Deployment docs state compatibility ordering.

## STOP conditions

- Stop if hosting infrastructure has no independently runnable migration stage; report the required platform decision.

## Maintenance notes

Review all future migrations for backward compatibility during rolling deploys.
