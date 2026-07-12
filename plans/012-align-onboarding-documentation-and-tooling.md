# Plan 012: Align onboarding documentation and tooling

> **Executor instructions**: Match actual repository commands and installed versions; do not alter runtime dependencies.
>
> **Drift check**: `git diff --stat 79b6e8c..HEAD -- README.md docs/getting-started.md package.json`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/003-establish-non-mutating-verification-gate.md
- **Category**: docs
- **Planned at**: commit `79b6e8c`, 2026-07-11
- **Issue**: https://github.com/KovD3v/anthon-2.0/issues/38

## Why this matters

The README describes Vercel AI SDK v6 while the manifest installs `ai ^7.0.8`; setup lists Node but omits Bun despite Bun commands. The Prisma seed script also uses `npx` contrary to the repository convention.

## Current state

- `README.md:54-62` says AI SDK v6.
- `docs/getting-started.md:5-25` lists prerequisites then uses `bun install`.
- `package.json:25-27` configures seed with `npx tsx`.

## Scope

**In scope:** README, getting-started guide, package seed command. **Out of scope:** dependency upgrades and environment secret values.

## Steps

1. Document the supported Bun runtime and any required Node compatibility accurately.
2. Update SDK-major-version references to match the manifest.
3. Align the seed command with Bun conventions and check all copied quick-start commands.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Docs review | `rg -n "AI SDK v6|npx tsx" README.md docs package.json` | no stale matches |
| Lint | `bun run lint` | exit 0 |

## Done criteria

- [ ] Documentation and scripts agree on Bun and installed AI SDK major version.
- [ ] No real credential values are added to docs.
- [ ] Lint passes.

## STOP conditions

- Stop if the supported Bun version cannot be established from repository or deployment configuration.

## Maintenance notes

Update setup docs as part of every runtime or package-manager migration.
