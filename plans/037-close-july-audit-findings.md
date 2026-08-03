# Plan 037: Close the July 31 reliability audit

> **Executor instructions**: Integrate the already approved Plans 022-025,
> implement every actionable engineering finding from the 2026-07-31 audit,
> and keep the separately proposed product-direction ideas out of scope. Use an
> isolated worktree, additive migrations, disposable Neon branches, and a
> no-push handoff.

## Status

- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH
- **Depends on**: 022, 023, 024, 025
- **Category**: security, reliability, performance, verification
- **Planned at**: commit `a5e4105`, 2026-07-31
- **State**: DONE

## Scope

- Promote Plans 022-025 without merging or rewriting their verified commits.
- Bound and authenticate multimodal inputs, canonicalize attachment bytes, and
  preserve OpenRouter routing options at the wire level.
- Remove prompt/response content from PostHog generation telemetry.
- Add atomic guest-abuse, AI-usage, upload-quota, web-idempotency, and
  external-inbound delivery state.
- Make assistant persistence a successful-stream barrier with retry recovery.
- Characterize and serialize model-experiment lifecycle/cadence mutations.
- Remove duplicate RAG retrieval and full response-body result reads.
- Add trusted persistence CI, repair coverage/Knip scripts, and refresh stale
  contributor guidance.
- Apply supported security and compatibility upgrades, including Next.js and
  Clerk patches.

## Explicit exclusions

- Product-direction proposals DIR-01 through DIR-04 remain separate decisions,
  not implied implementation authority.
- ANN/RAG expansion remains blocked until a representative corpus, query set,
  and recall floor exist (Plans 016-017).
- No production deployment, branch merge, or push is authorized by this plan.
- No broad major-version upgrade is required solely to suppress transitive
  development-tool advisories.

## Acceptance gates

- [x] Prisma schema formats, validates, generates, and the additive migration
  deploys on a disposable production clone.
- [x] Focused security, retry, quota, stream, webhook, experiment, and RAG tests
  pass.
- [x] Unit coverage, integration, E2E, lint, typecheck, Knip, and production
  build pass.
- [x] The CI workflow exposes database/auth secrets only to first-party test
  steps and never to dependency-install or third-party Action steps.
- [x] Documentation describes idempotency keys, reservation semantics, upload
  quotas, guest abuse controls, and durable attachment ownership.
- [x] `git diff --check` is clean and all work is committed on the isolated
  branch.

## Verification

Completed on 2026-07-31 from the isolated
`improve/037-all-audit-findings` branch:

- `bun install --frozen-lockfile`, `prisma format`, `prisma validate`, and
  `prisma generate` passed with Prisma 7.9.1.
- `bun run lint`, `bun run typecheck`, `bun run knip`, and the Next.js 16.2.12
  production build passed; the build generated all 48 static pages.
- Unit coverage passed with 156 files passing and one skipped, 1,426 tests
  passing and four skipped, and 75.65% branch coverage (5,950/7,865).
- The disposable-development-branch integration suite passed 15 files and 42
  tests. The desktop/mobile Playwright suite passed all four tests, including
  interruption and immediate retry. Both ephemeral branches were deleted.
- `prisma migrate deploy` was rehearsed on an isolated child of the default
  primary `production` Neon branch. Both new migration rows and the
  `AiUsageReservation`, `DailyUploadUsage`, and `GuestAbuseBucket` tables were
  verified before the child branch was deleted.
- The repository now has the five CI secret names required by the trusted
  persistence job. The workflow injects them only into first-party preflight,
  integration, and E2E run steps.
- Supported dependency updates and safe top-level overrides reduced
  `bun audit` from 65 advisories to 12 (six high, six moderate). The remaining
  findings are pinned or incompatible transitives under Next.js, Prisma
  Studio, AI SDK devtools, Knip, and Vitest; no unsafe cross-major override was
  forced.

## Promotion contract

Hand back the isolated branch and commit list. The repository owner decides
whether to merge or push it. Preserve unrelated untracked benchmark artifacts
in the primary checkout.
