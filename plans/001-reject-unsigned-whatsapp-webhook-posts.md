# Plan 001: Reject unsigned WhatsApp webhook posts

> **Executor instructions**: Follow this plan step by step. Run every verification command. If a STOP condition occurs, stop and report; do not improvise.
>
> **Drift check**: `git diff --stat 79b6e8c..HEAD -- src/lib/channels/whatsapp/utils.ts src/app/api/webhooks/whatsapp/route.test.ts`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `79b6e8c`, 2026-07-11
- **Issue**: https://github.com/KovD3v/anthon-2.0/issues/27

## Why this matters

`verifySignature` currently accepts every POST when `WHATSAPP_APP_SECRET` is absent. A missing production secret therefore makes the public webhook unauthenticated before it schedules message processing.

## Current state

- `src/lib/channels/whatsapp/utils.ts:7-17` reads `WHATSAPP_APP_SECRET`, returns `true` when absent, otherwise verifies the HMAC.
- `src/lib/channels/whatsapp/webhook-handler.ts:159-164` trusts that boolean before parsing or processing the payload.
- Tests follow the route-level pattern in `src/app/api/webhooks/whatsapp/route.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit tests | `bunx vitest run src/app/api/webhooks/whatsapp/route.test.ts` | all pass |
| Lint | `bun run lint` | exit 0 |

## Scope

**In scope:** `src/lib/channels/whatsapp/utils.ts`, `src/app/api/webhooks/whatsapp/route.test.ts`.

**Out of scope:** secrets, deployment configuration, Telegram behavior, and changing webhook response shapes other than rejection of invalid configuration.

## Steps

1. Change signature validation to fail closed when the secret is missing. Preserve a test-only bypass only if an existing, explicitly environment-gated convention already exists.
2. Add tests for missing secret, missing signature, invalid signature, and a valid signature. Never include real secret values.

## Done criteria

- [ ] Unsigned requests with no configured app secret receive 401.
- [ ] Valid signed requests retain current success behavior.
- [ ] Targeted tests and `bun run lint` pass.

## STOP conditions

- Stop if production intentionally supports unsigned WhatsApp posts and that policy is documented outside this repository.
- Stop if the route tests cannot set environment variables without leaking state across tests.

## Maintenance notes

Treat a missing signing secret as a deployment error. Future webhook providers should use the same fail-closed convention.
