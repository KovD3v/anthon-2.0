# Task 4 implementer report

Status: complete with verification concerns noted below.

## Changed files

- `prisma/schema.prisma`
- `prisma/migrations/20260809120000_add_memory_approvals/migration.sql`
- `src/lib/ai/memory-approval.ts`
- `src/lib/ai/memory-approval.test.ts`
- `src/lib/ai/tools/memory.ts`
- `src/lib/ai/tools/memory.test.ts`
- `src/lib/ai/memory-extractor.ts`
- `src/lib/ai/memory-extractor.test.ts`
- `src/lib/ai/capability-arbitration.ts`
- `src/lib/ai/orchestrator.ts`
- `src/lib/ai/orchestrator.test.ts`
- `src/lib/channel-flow/types.ts`
- `src/lib/channel-flow/run.ts`
- `src/lib/channel-flow/run.test.ts`
- `src/lib/channel-flow/persistence.ts`
- `src/lib/channel-flow/persistence.test.ts`
- `.superpowers/sdd/2026-08-09-autonomous-ai-capabilities-implementation/task-4-report.md`

The orchestrator and capability-arbitration changes are the narrow integration needed to expose the Task 4 tools in agentic mode while preserving the Task 3 native RAG/web tool contract. Unrelated modified documentation was preserved and excluded from this task.

## Schema and approval decisions

- Added the exact `MemoryApprovalStatus` enum, `MemoryApproval` model, indexes, and `User`/`Message` relations required by the brief.
- Approval lifetime is 15 minutes. Approval creation validates that the source message is an inbound message owned by the same user.
- Approval lookup and resolution are server-owned and user-scoped. They verify the conversation, the current inbound message, the source assistant response, expiry, pending status, and that the current message is the immediate follow-up.
- A generic or unrelated confirmation is stale. Natural persistence confirmation such as `Sì, puoi salvarlo in memoria` is accepted only when all server-side attribution checks pass.
- Resolution uses a conditional status transition and the memory upsert in one transaction. Repeated, expired, cross-user, or unrelated resolution cannot write memory. Rejection changes only the approval status.
- Low-risk facts above the existing confidence threshold use the unique `[userId, key]` upsert contract. Create/update/overwrite remain one capability and invalidate the prompt cache after an actual write.
- Sensitive health, diagnosis, trauma, intimate, and other high-impact facts create an approval instead of writing directly.
- Deletion receives the exact server-planned stable key only. Wildcards, categories, broad targets, and model-supplied replacement keys are denied; results are limited to `deleted`, `not_found`, or `ambiguous`.
- In `agentic` planner mode, memory tools are the only memory-write path for the turn. In `legacy`, the existing extractor scheduling remains active, with its prompt tightened to facts explicitly declared by the user.
- No approval authority is accepted from channel clients. Web, Telegram, and WhatsApp all enter through the shared server-side channel flow.

## TDD evidence

### RED

1. `bunx vitest run src/lib/ai/memory-approval.test.ts`
   - Exit 1: the new service module did not exist; 0 tests ran.
2. `bunx vitest run src/lib/ai/tools/memory.test.ts src/lib/ai/memory-extractor.test.ts src/lib/channel-flow/persistence.test.ts`
   - Exit 1: 15 failed, 21 passed. Failures covered the new bounded save/delete shape, missing approval tools, explicit-only extractor wording, and agentic scheduling suppression.
3. `bunx vitest run src/lib/channel-flow/run.test.ts src/lib/ai/orchestrator.test.ts`
   - Exit 1: 5 failed, 99 passed. Failures showed that server approval context was not loaded and guarded memory tools were not exposed.
4. After replacing a canonical confirmation with `Sì, puoi salvarlo in memoria`, the service test failed with `stale` instead of `approved`; the confirmation matcher was corrected and the service suite then passed 11/11.

### GREEN

1. Required focused gate, rerun immediately before commit:

   ```text
   bunx prisma validate && bunx prisma generate && bunx vitest run src/lib/ai/memory-approval.test.ts src/lib/ai/tools/memory.test.ts src/lib/ai/memory-extractor.test.ts src/lib/channel-flow/persistence.test.ts && git diff --check
   ```

   Exit 0: Prisma schema valid; Prisma Client v7.9.1 generated; 4 test files and 47 tests passed; diff check clean. Vite emitted only existing module-format/plugin deprecation warnings.
2. `bunx vitest run src/lib/channel-flow/run.test.ts src/lib/ai/orchestrator.test.ts src/lib/ai/capability-arbitration.test.ts`
   - Exit 0: 117/117 tests passed.
3. Scoped Biome check over the 14 Task 4 TypeScript/schema files at that stage.
   - Exit 0: 14 files checked, no diagnostics.
4. `bunx tsc --project /tmp/anthon-task4-tsconfig.json --noEmit --pretty false`
   - Exit 0: scoped Task 4 TypeScript check passed.
5. `bun run typecheck`
   - Exit 2 because of one pre-existing unrelated fixture error: `src/lib/model-experiments/eligibility.test.ts(36,3)` is missing `routineProposal` and `voiceOutput`.

## Migration verification

- Ran `bunx prisma validate` and `bunx prisma generate` successfully after the schema change.
- Generated a SQL migration from the committed pre-change schema to the validated current schema with `prisma migrate diff`.
- Compared the generated SQL byte-for-byte with `prisma/migrations/20260809120000_add_memory_approvals/migration.sql`; `diff -u` exited 0.
- Inspected the SQL: it creates only the enum, approval table, two indexes, and the two cascading foreign keys specified by the schema.
- Did not apply the migration to production, a shared database, or any live database. Application remains deferred to the verified Task 8 development/integration path.

## Self-review

- Preserved `CapabilityDecision`, `TurnPlan.memoryDeleteTarget`, exact stable-key deletion validation, and the Task 3 RAG/web contracts.
- Confirmed memory side effects are silent tool operations and no approval payload is trusted from the client.
- Confirmed cache invalidation occurs only after successful write, approval, or deletion.
- Confirmed legacy extraction persists messages before scheduling and agentic mode suppresses that second write path.
- Reviewed the final diff for unrelated formatting or documentation changes; only Task 4 files are intended for staging.
- Did not implement Tasks 5-8.

## Concerns

- The repository-wide typecheck is not green because of the unrelated pre-existing model-experiment fixture error above; the scoped Task 4 typecheck is green.
- The complete unit/integration suite was not rerun after the user's immediate-finalize instruction. The required 47-test gate and the expanded 117-test channel/orchestrator/capability gate are green.
- No live database integration test was run and the migration was intentionally not applied, as required by the brief.
