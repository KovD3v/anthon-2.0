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
- The complete unit suite was rerun during fix-round finalization and is green. Database-backed integration coverage remains deferred as described below.
- No live database integration test was run and the migration was intentionally not applied, as required by the brief.

## Fix round 1 — 2026-08-09

Status: complete. All six reviewer blockers are fixed at shared server boundaries.

### Fixes

- Added `src/lib/ai/tool-privacy.ts` as the closed telemetry/stream boundary. Collected calls, step callbacks, traces, `Message.toolCalls`, private technical history responses, and live UI tool chunks retain only tool name plus `completed`/`failed`; arguments, results, values, keys, categories, approval payloads, memory IDs, approval IDs, and unknown future tool chunks are removed. Routine proposals are validated into their dedicated product payload before telemetry is redacted, preserving routine cards without persisting raw tool arguments.
- Bound approval resolution to the full server-loaded `PendingMemoryApproval` closure. The model schema now accepts only `approve` or `reject`; no approval ID can be provided by the model or channel client, and tool results do not expose approval or resolution IDs.
- Tightened approval authorization so an immediate follow-up must either directly and naturally refer to the pending save or semantically overlap the pending fact. An unrelated command such as `Ricorda che preferisco allenarmi al mattino` cannot approve a pending health fact. Unrelated turns no longer query the approval table.
- Added user-scoped exact deletion-target resolution in the shared channel flow for Web, Telegram, and WhatsApp. It reads current memories, returns only one validated stable key, rejects ties/no-match/generic requests, preserves the existing broad-target guard, and does not misread coaching instructions such as `Elimina la tensione` as memory deletion.
- Added a server-owned sensitivity policy over category, stable key, and value. Model-provided category/sensitivity can increase protection but cannot downgrade health, diagnosis, trauma, intimate, medical, injury, medication, or similar high-impact facts into direct writes.
- Updated capability classification to permit conservative high-confidence, low-risk durable facts without explicit save wording. Agentic mode can therefore infer ordinary facts through `saveMemory`; low confidence remains rejected and sensitive inferences remain approval-gated. Legacy extractor behavior is unchanged.
- Added defense-in-depth redaction for historical technical chat payloads in both `src/lib/chat.ts` and `src/app/api/chats/[id]/route.ts`.

### TDD and regression evidence

RED:

- Initial fix-round gate: 14 failed, 160 passed. Failures reproduced missing privacy utility, leaked step/persistence payloads, generic-save approval, model-owned approval ID, model-downgraded sensitivity, missing shared deletion resolution, and explicit-only classifier prompting.
- Added technical-history boundary regressions: 9 failed, 120 passed across orchestrator, shared chat, App Router chat history, and deletion targeting.
- The first repository-wide unit run exposed 29 Web/Telegram/WhatsApp failures caused by unconditional approval lookup in shared flow tests. A focused regression proved unrelated authenticated turns must not query pending approvals before the intent gate was added.
- Additional fail-closed regressions proved unknown future tool chunks must be dropped, coaching language must not be treated as a delete request, and equally scored stored memories must not resolve to an arbitrary deletion target.

GREEN:

- `bun run test`: 214 files passed, 1 skipped; 2,074 tests passed, 4 skipped.
- Focused Task 4 suite: 11 files and 219 tests passed, covering approval, memory tools, target resolution, privacy, classifier, orchestrator, shared channel flow, persistence, shared chat, cost metrics, and legacy extraction.
- Focused technical API boundary suite: 5 files and 77 tests passed across chat messages, chat detail, admin user detail, and AI trace list/detail routes.
- `bunx prisma validate` and `bunx prisma generate`: passed with Prisma Client v7.9.1. No migration was applied.
- Scoped Biome over the final Task 4 TypeScript files and `/tmp/anthon-task4-fix-tsconfig.json` TypeScript checks: passed.
- Next.js 16.3/Turbopack runtime verification: `get_compilation_issues` and `get_errors` returned no issues; the real local `/chat/[id]` route rendered. The restored browser session was a guest, so the authenticated-only `/api/chats/[id]` endpoint correctly returned 401; authorized redaction is covered by the route-handler tests.
- `git diff --check`: passed.

### Remaining concerns

- Repository-wide `bun run typecheck` still fails only at the pre-existing unrelated `src/lib/model-experiments/eligibility.test.ts(36,3)` fixture, which lacks `routineProposal` and `voiceOutput`. The expanded Task 4 scoped typecheck is green.
- No live database migration or live approval-row integration test was run, per the explicit instruction not to apply a migration. The existing Prisma migration contract was preserved unchanged.
- Runtime browser verification used the restored guest session; authenticated technical-history payload behavior is verified at the real route-handler boundary in unit tests rather than with a live signed-in account.

## Focused review fixes — 2026-08-09

Status: complete. The two focused review findings are closed at the shared approval and live-stream boundaries.

### Fixes

- Removed semantic token overlap from approval attribution. A pending approval can now resolve only from the immediate server-attributed follow-up using a standalone natural decision (`Sì`, `Va bene`, `No`) or a bounded anaphoric form such as `Sì, salvalo in memoria`, `Salvalo`, or `No, non salvarlo`. Proposition-bearing commands such as `Ricorda che preferisco allenarmi al mattino` and changed overlapping facts such as `Salva il mio dolore al ginocchio destro` fail closed.
- Kept approval authority server-owned. No model/client approval identifier or raw approval payload was introduced.
- Changed the live stream redactor from pass-through-by-default to an explicit UI-protocol allowlist. Reasoning, message metadata, provider/custom/source/file/data, and unknown chunks are dropped; text, start, finish, abort, error, and tool chunks retain only their required safe fields. Message, text-part, and tool-call identifiers are replaced with stream-local synthetic identifiers; error text and tool inputs/results are replaced with bounded generic values.
- The shared channel flow now requests `sendReasoning: false` and still independently redacts every received chunk. Existing text and sanitized tool lifecycle chunks continue to reach the client, while the durable finish remains server-generated after persistence.

### TDD and verification evidence

RED:

- `bunx vitest run src/lib/ai/memory-approval.test.ts src/lib/ai/tool-privacy.test.ts src/lib/channel-flow/run.test.ts`
  - Exit 1: 10 failed and 54 passed. The failures reproduced standalone yes/no not resolving, `Salvalo` not resolving, the changed right-knee fact approving through token overlap, reasoning/provider metadata passing through, upstream text IDs leaking, and missing `sendReasoning: false`.

GREEN:

- Focused suite: 3 files and 64 tests passed.
- Full unit suite (`bun run test`): 214 files passed, 1 skipped; 2,082 tests passed, 4 skipped.
- Scoped Biome check over the six owned TypeScript source/test files: passed with no diagnostics.
- Scoped TypeScript check (`bunx tsc --project /tmp/anthon-task4-fix-tsconfig.json --noEmit --pretty false`): passed.
- `git diff --check`: passed.
- The test runner emitted only the existing Vite native-config, `vite-tsconfig-paths`, and typeless `postcss.config.ts` warnings.
