# Task 1 report — versioned routine step contract

## Scope

Implemented the Task 1 typed-domain slice only. No AI tool wiring, channel
persistence changes, runner state machine, sidebar collection, or routine API
collection was added.

## RED evidence

Before implementation, `bunx vitest run src/lib/coaching/routine.test.ts`
reported the expected missing-v2 behavior:

```text
FAIL src/lib/coaching/routine.test.ts > routineProposalSchema > accepts a v2 proposal with typed practice steps and a terminal form
AssertionError: expected false to be true
Test Files  1 failed (1)
Tests  1 failed | 24 passed (25)
```

The expanded red coverage covers historical v1 string steps; a valid typed v2
routine; unknown `kind`; empty/over-limit practice steps; timer duration;
breathing cycle/second limits; non-terminal forms; option count; duplicate
outcomes; and duplicate step IDs.

## Implementation choices

- Added closed Zod discriminated step types: `instruction`, `timer`,
  `breathing`, and terminal `form`, with all specified numeric and text
  limits. Whitespace is trimmed and collapsed in persisted text and labels.
- Kept `routineProposalV1Schema` compatible with the historical JSON and
  introduced `routineProposalV2Schema` plus
  `storedRoutineProposalSchema` for persisted messages/cards.
- Added `normalizeRoutineProposal`. v1 strings become stable
  `instruction-1`… IDs; v2 IDs are unchanged; a terminal form is returned as
  `completionForm` and omitted from `practiceSteps`.
- Added card-level `formatVersion` and require it to agree with the stored
  proposal. Hydration continues to require the exact routine, source chat,
  source assistant message, and canonical proposal match.
- `AnthonUIMessage` and chat data-part validation now accept both stored
  versions. `routineProposalSchema` remains the compatibility union in this
  slice; Task 2 should wire `createRoutineProposalTool` directly to
  `routineProposalV2Schema` while also persisting `formatVersion: 2`.
- The existing card reads the normalized practice steps so typed v2 snapshots
  remain safely renderable before the dedicated runner arrives. It does not
  implement runner interaction.

## Migration

Added `prisma/migrations/20260808150000_add_routine_format_version/migration.sql`:

```sql
ALTER TABLE "Routine"
  ADD COLUMN IF NOT EXISTS "formatVersion" INTEGER NOT NULL DEFAULT 1;
```

`Routine.formatVersion Int @default(1)` matches the migration. The migration
is additive, gives existing records v1, and leaves the existing `SetNull`
relations unchanged.

Commands run:

```text
bunx prisma validate
The schema at prisma/schema.prisma is valid

bunx prisma generate
Generated Prisma Client (v7.9.1) to ./src/generated/prisma in 244ms
```

No `prisma migrate dev` or database mutation was run: this task supplies the
reviewable additive migration and does not select a development/production
database target.

## Files changed

- `prisma/schema.prisma`
- `prisma/migrations/20260808150000_add_routine_format_version/migration.sql`
- `src/lib/coaching/routine.ts`
- `src/lib/coaching/routine.test.ts`
- `src/lib/model-experiments/types.ts`
- `src/app/(chat)/chat/[id]/chat-conversation-client.tsx`
- `src/app/(chat)/components/RoutineCard.tsx`
- Typed routine fixtures in the chat/card/form tests needed to carry the new
  required `formatVersion` field.

## GREEN verification

```text
bunx vitest run src/lib/coaching/routine.test.ts 'src/app/(chat)/chat/[id]/page.test.tsx' 'src/app/(chat)/components/MessageList.behavior.test.tsx'
Test Files  3 passed (3)
Tests  62 passed (62)

bunx vitest run 'src/app/(chat)/components/RoutineCard.test.tsx' 'src/app/(chat)/components/RoutineCheckInForm.test.tsx' 'src/app/(chat)/chat/[id]/chat-conversation-client.behavior.test.tsx'
Test Files  3 passed (3)
Tests  79 passed (79)

bun run typecheck
$ next typegen && tsc --noEmit
Generating route types...
Types generated successfully

git diff --check
exit 0
```

`bunx biome check` on all modified TypeScript/TSX files completed with no
errors. The repository-wide `bun run lint` remains blocked by formatting in
the ignored, tool-generated `.impeccable/hook.cache.json`; it does not report
a source-file issue in this slice, and was left untouched.

## Concerns / handoff

- The v2 AI tool and persistence write are intentionally deferred to Task 2;
  until then, production-generated proposals remain v1 and the new DB default
  is therefore correct.
- The migration was validated syntactically and Prisma client generation is
  green, but was not applied to a database in this task because no migration
  target was authorized.
- Existing unrelated docs (`docs/user-plan-states.md` and
  `docs/superpowers/plans/2026-08-07-context-aware-rag-implementation.md`) are
  preserved and excluded from the task commit.
