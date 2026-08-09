# Routine runner focus mode — final fix report

## Scope

- `src/app/(chat)/components/RoutineCard.tsx`: the card now renders mutually exclusive summary and inline-runner branches. While the runner is open, the summary, controls, and history are unmounted; confirmed interruption restores them and returns focus to the launch control.
- `src/app/(chat)/components/RoutineRunner.tsx`: the breathing indicator receives `animate-pulse` only while its runner state is `running`; idle and paused states retain the textual phase and reduced-motion behavior.
- `src/components/ui/confirm-dialog.tsx`: both actions in the opt-in `dismissOnOutside` path now have `min-h-11` (44px minimum). Existing AlertDialog callers are unchanged.
- `RoutineCard.test.tsx` and `RoutineRunner.test.tsx`: regression coverage for the exclusive focus surface, confirmed restoration, breathing idle/running/paused animation, reduced-motion class, and both dismissible dialog actions.

## TDD evidence

The new focused tests were run before production changes and failed as expected:

- Card focus test: `Quando` remained mounted during the inline runner.
- Dialog action test: `Continua` had the default `h-9` class and no `min-h-11`.
- Breathing test: idle indicator already had `animate-pulse`.

After the production changes:

```text
bunx vitest run 'src/app/(chat)/components/RoutineCard.test.tsx' 'src/app/(chat)/components/RoutineRunner.test.tsx' --reporter=dot
Test Files  2 passed (2)
Tests  38 passed (38)
```

## Verification

```text
bunx vitest run src/lib/coaching/routine-runner.test.ts 'src/app/(chat)/components/RoutineRunner.test.tsx' 'src/app/(chat)/components/RoutineCard.test.tsx' 'src/app/(chat)/components/RoutineCheckInForm.test.tsx' 'src/app/(chat)/components/RoutineHistory.test.tsx' --reporter=dot
Test Files  5 passed (5)
Tests  66 passed (66)

bunx biome check [five touched source/test files]
Checked 5 files. No fixes applied.

git diff --check
exit 0
```

## Concerns

- `bun run typecheck` currently exits 2 for unrelated AI work: `src/lib/ai/orchestrator.test.ts` calls a value inferred as `{}`, and `src/lib/model-experiments/eligibility.test.ts` lacks the new `routineProposal` and `voiceOutput` properties.
- `bun run lint` currently exits 1 on unrelated AI files and generated `.impeccable/hook.cache.json`; this final fix's five touched code/test files pass targeted Biome. The cache file was deliberately not reformatted.
- Vitest emits existing Vite/ESM configuration warnings, but all focused routine suites pass.
