# Plan 011: Consolidate channel conversation processing

> **Executor instructions**: Migrate one provider at a time after characterization tests; do not combine behavior changes.
>
> **Drift check**: `git diff --stat 79b6e8c..HEAD -- src/lib/channels/telegram src/lib/channels/whatsapp src/lib/channel-flow`

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/004-make-channel-connect-commands-retry-safe.md, plans/007-add-critical-persistence-integration-coverage.md
- **Category**: tech-debt
- **Planned at**: commit `79b6e8c`, 2026-07-11
- **Issue**: https://github.com/KovD3v/anthon-2.0/issues/37

## Why this matters

Telegram and WhatsApp each contain large, overlapping flows for idempotency, linking, identity resolution, guest creation, and message persistence. Parallel maintenance risks behavioral drift on a core product surface.

## Current state

- `src/lib/channels/telegram/webhook-handler.ts` is 920 lines; `src/lib/channels/whatsapp/webhook-handler.ts` is 817 lines.
- Both contain analogous inbound message setup near Telegram `:193-329` and WhatsApp `:245-320`.

## Scope

**In scope:** channel handlers, a new shared processing service, and characterization tests. **Out of scope:** provider parsing, outbound transport implementation, public channel UX.

## Steps

1. Lock current provider behavior with channel-level tests, including retry and media cases.
2. Define a normalized inbound envelope and provider adapter boundary.
3. Extract shared conversation processing; migrate one provider, verify parity, then migrate the second.
4. Keep parsing/sending at provider edges and remove duplicated logic only after parity passes.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Channel tests | `bunx vitest run src/app/api/webhooks/telegram/route.test.ts src/app/api/webhooks/whatsapp/route.test.ts src/lib/channel-flow/run.test.ts` | all pass |
| Verify | `bun run verify` | exit 0 |

## Done criteria

- [ ] Shared service owns normalized persistence/idempotency flow.
- [ ] Provider-specific parsing and sending remain at the edges.
- [ ] Characterization and channel tests demonstrate parity.

## STOP conditions

- Stop if a provider-specific behavior cannot be represented without leaking transport details into the shared service.

## Maintenance notes

Future channel additions should implement an adapter, not copy a handler.
