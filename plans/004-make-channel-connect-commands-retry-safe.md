# Plan 004: Make channel connect commands retry-safe

> **Executor instructions**: Preserve retry semantics; do not extract shared code in this plan.
>
> **Drift check**: `git diff --stat 79b6e8c..HEAD -- src/lib/channels/telegram/webhook-handler.ts src/lib/channels/whatsapp/webhook-handler.ts src/app/api/webhooks/*/route.test.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/001-reject-unsigned-whatsapp-webhook-posts.md
- **Category**: bug
- **Planned at**: commit `79b6e8c`, 2026-07-11
- **Issue**: https://github.com/KovD3v/anthon-2.0/issues/30

## Why this matters

Both handlers check the inbound-message marker before their connect-command branch, then return without writing one. Retried delivery can generate new linking tokens and duplicate responses.

## Current state

- `src/lib/channels/telegram/webhook-handler.ts:193-251` checks `externalMessageId` then returns from the connect branch.
- `src/lib/channels/whatsapp/webhook-handler.ts:245-260` has the same pattern; link creation is in `:740-782`.
- Use existing Telegram and WhatsApp route tests as patterns.

## Scope

**In scope:** both webhook handlers and their route tests.

**Out of scope:** shared-handler extraction, link UX, provider API changes.

## Steps

1. Define an atomic persisted claim/marker policy for connect messages that prevents duplicates while allowing a safe retry after a failed side effect.
2. Apply the same semantic policy to both providers while retaining provider-specific IDs.
3. Add duplicate-delivery and concurrent-delivery regression tests.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tests | `bunx vitest run src/app/api/webhooks/telegram/route.test.ts src/app/api/webhooks/whatsapp/route.test.ts` | all pass |
| Lint | `bun run lint` | exit 0 |

## Done criteria

- [ ] Duplicate connect delivery creates at most one active link/token and one outbound response.
- [ ] A documented failed-side-effect policy has test coverage.
- [ ] Targeted tests and lint pass.

## STOP conditions

- Stop if no uniqueness primitive can safely claim an inbound provider ID.

## Maintenance notes

This is characterization-first groundwork for Plan 011.
