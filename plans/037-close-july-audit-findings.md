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
- **State**: IN PROGRESS

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

- [ ] Prisma schema formats, validates, generates, and the additive migration
  deploys on a disposable production clone.
- [ ] Focused security, retry, quota, stream, webhook, experiment, and RAG tests
  pass.
- [ ] Unit coverage, integration, E2E, lint, typecheck, Knip, and production
  build pass.
- [ ] The CI workflow exposes database/auth secrets only to first-party test
  steps and never to dependency-install or third-party Action steps.
- [ ] Documentation describes idempotency keys, reservation semantics, upload
  quotas, guest abuse controls, and durable attachment ownership.
- [ ] `git diff --check` is clean and all work is committed on the isolated
  branch.

## Promotion contract

Hand back the isolated branch and commit list. The repository owner decides
whether to merge or push it. Preserve unrelated untracked benchmark artifacts
in the primary checkout.
