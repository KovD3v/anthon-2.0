# Task 3 report: composable bounded RAG and web tools

## Status

Implemented and verified on the current feature branch. Only Task 3 files are staged for the commit; existing UI and documentation edits remain unstaged and unchanged.

## Changed files

- `src/lib/ai/tools/rag.ts`
  - Added the native `searchRag` tool with a closed `RagToolResult` contract.
  - Trims and validates a bounded query server-side, calls `getRagContext` once at most, and returns no raw retrieval diagnostics.
  - Uses the structured AI logger for retrieval failures.
- `src/lib/ai/tools/rag.test.ts`
  - Covers bounded input, empty results, one-call limit, exceptions, reported retrieval failures, and the closed result contract.
- `src/lib/ai/rag.ts`
  - Added the non-diagnostic `failed` status to `RagContext`.
  - Kept `searchDocuments()` compatible for the API route while allowing `getRagContext()` to distinguish an empty corpus match from embedding/database retrieval failure.
- `src/lib/ai/rag.test.ts`
  - Covers the safe failed retrieval status.
- `src/lib/ai/orchestrator.ts`
  - Adds `searchRag` only for an immutable agentic plan with `rag: true`.
  - Removes agentic RAG and direct TinyFish prefetching; legacy direct web prefetch remains unchanged.
  - Makes agentic RAG, web search, memory tools, and routine proposal composable. Web fetch is unavailable until a prior TinyFish search result contains an HTTP(S) candidate URL.
  - Keeps the global five-step agentic ceiling, one RAG call in the tool, and removes routine proposal from subsequent active-tool inventories.
  - Records a successful native RAG tool result in `ragUsed` and `ragChunksCount` metrics.
- `src/lib/ai/orchestrator.test.ts`
  - Covers agentic RAG/web inventory, no hidden prefetch, fetch URL gating, no forced routine, tool composition, and native RAG metrics.

## Decisions

- RAG is a native tool rather than TinyFish/web behavior. It only delegates to the existing `getRagContext` boundary.
- The RAG tool result contains exactly `success`, `chunkCount`, and `context`; vectors, IDs, rows, and diagnostic payloads cannot reach the model.
- A retrieval error is marked by the shared `RagContext.failed` boolean. This preserves the existing `searchDocuments()` response contract for the RAG API route while allowing the tool to return a safe failure.
- Agentic mode has no hidden web/RAG prefetch. Legacy mode retains the previous direct brief-search optimization.
- The agentic prepare step selects an available inventory rather than forcing a tool. It removes used RAG/routine/search tools, and admits fetch only after a valid search URL.

## TDD evidence

RED commands and observed output:

1. `bunx vitest run src/lib/ai/tools/rag.test.ts`
   - Failed: `Cannot find module .../src/lib/ai/tools/rag`; all six initial tests failed because `searchRag` did not exist.
2. `bunx vitest run src/lib/ai/tools/rag.test.ts src/lib/ai/orchestrator.test.ts`
   - Failed: 11 tests. The existing behavior eagerly called `getRagContext`, prefetched TinyFish in agentic mode, forced `proposeRoutine`, and had no native RAG tool.
3. `bunx vitest run src/lib/ai/orchestrator.test.ts`
   - Failed: the new metric regression showed `ragUsed: false` and `ragChunksCount: 0` after a successful `searchRag` result.
4. `bunx vitest run src/lib/ai/tools/rag.test.ts src/lib/ai/rag.test.ts`
   - Failed: two tests. A database failure was flattened to an ordinary empty result and the native tool reported success instead of a safe failure.

GREEN commands and output:

1. `bunx vitest run src/lib/ai/tools/rag.test.ts src/lib/ai/rag.test.ts`
   - Passed: 29 tests.
2. `bunx vitest run src/lib/ai/orchestrator.test.ts`
   - Passed: 68 tests.
3. `bunx vitest run src/lib/ai/tools/rag.test.ts src/lib/ai/orchestrator.test.ts src/lib/ai/rag.test.ts`
   - Passed: 3 test files, 97 tests.
4. `bunx biome check src/lib/ai/rag.ts src/lib/ai/rag.test.ts src/lib/ai/tools/rag.ts src/lib/ai/tools/rag.test.ts src/lib/ai/orchestrator.ts src/lib/ai/orchestrator.test.ts`
   - Passed: six files checked, no fixes needed.
5. `git diff --check` plus `git diff --no-index --check` for both new files
   - Passed with exit code 0.

## Self-review

- Verified that only agentic `rag: true` adds `searchRag`; guest returns before RAG inventory construction, benchmark uses an empty tool set, and prepared comparison generation remains read-only.
- Verified that TinyFish tools stay independently capability-gated: RAG does not enable web and web does not enable RAG.
- Verified deterministic controls: RAG has an internal one-call counter, TinyFish retains its one-call limits, the routine proposal disappears after it is called, fetch requires a valid HTTP(S) search result, and agentic turns retain the five-step ceiling.
- Verified no production `console` logging was added.

## Concerns

- No test hung.
- Vitest emits pre-existing Vite/module-type warnings about native config loading and `postcss.config.ts`; the focused suites still exited successfully. They are outside Task 3 scope.
- The full repository suite was not run; the approved Task 3 focused suite, scoped Biome, and diff checks were run.
