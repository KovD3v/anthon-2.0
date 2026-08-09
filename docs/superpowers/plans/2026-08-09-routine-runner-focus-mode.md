# Routine runner focus mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rifinire il `RoutineRunner` inline con una gerarchia focus step-by-step, progresso verificabile, timer/respirazione più leggibili e chiusura senza persistenza parziale.

**Architecture:** Il runner resta un componente locale della `RoutineCard`. Gli helper temporali e di progresso rimangono in `src/lib/coaching/routine-runner.ts`; `RoutineRunner` rende lo stato e notifica una richiesta di chiusura con l'indicazione di progresso parziale; `RoutineCard` mantiene il controllo del dialogo di conferma, del focus e della mutation di completamento. Nessun nuovo endpoint, modello Prisma o turno AI.

**Tech Stack:** TypeScript, React client components, Vitest + Testing Library, Radix AlertDialog tramite `ConfirmDialog`, Tailwind semantic tokens, Framer Motion già presente nel progetto.

## Global Constraints

- Il runner resta inline nella `RoutineCard`: non apre modali, pannelli, nuove chat o nuove pagine.
- Ogni stato mostra titolo, `Passo N di M`, barra di avanzamento discreta, fase corrente, widget e una sola azione primaria.
- Un timer a `00:00` richiede `Continua`; la respirazione avanza tra le fasi ma lo step successivo resta manuale.
- Il tempo deriva da timestamp e viene ricalcolato dopo background; non si usa il numero di intervalli come fonte di verità.
- La chiusura confermata scarta il progresso locale e non crea un tentativo; il completamento esplicito crea il tentativo una sola volta.
- Tutti i controlli hanno almeno 44 × 44 px; focus e `prefers-reduced-motion` devono restare accessibili senza dipendere dall'animazione.
- Nessuna migrazione Prisma, nuova API, persistenza di sessioni interrotte o turno AI aggiuntivo.
- Preservare le modifiche non correlate già presenti in `docs/user-plan-states.md` e `docs/superpowers/plans/2026-08-07-context-aware-rag-implementation.md`.

---

## File map

- Modify `src/lib/coaching/routine-runner.ts`: helper puri per il progresso globale e il progresso del passo temporizzato.
- Modify `src/lib/coaching/routine-runner.test.ts`: contratti RED/GREEN per progresso, timer e respirazione.
- Modify `src/app/(chat)/components/RoutineRunner.tsx`: layout focus, progressbar, controlli contestuali, richiesta di chiusura con progresso parziale.
- Modify `src/app/(chat)/components/RoutineRunner.test.tsx`: rendering, tastiera, background, motion reduction e chiusura.
- Modify `src/app/(chat)/components/RoutineCard.tsx`: dialogo di conferma, callback di chiusura e ritorno del focus.
- Modify `src/app/(chat)/components/RoutineCard.test.tsx`: chiusura annullata/confermata, assenza di mutation e completamento invariato.
- Modify `e2e/routine-loop.spec.ts`: smoke browser desktop/mobile del runner inline senza creare turni o tentativi parziali.

---

### Task 1: Add pure progress contracts

**Files:**
- Modify: `src/lib/coaching/routine-runner.ts`
- Test: `src/lib/coaching/routine-runner.test.ts`

**Interfaces:**
- Consumes: `RoutineRunnerState`, `RoutinePracticeStep`, `RoutineTimerStep`, `RoutineBreathingStep`, `getElapsedMs`, `getBreathingPhase`.
- Produces:
  ```ts
  export interface RoutineProgress {
    stepNumber: number;
    totalSteps: number;
    completedSteps: number;
    routinePercent: number;
    stepPercent: number | null;
  }

  export function getRoutineProgress(
    state: RoutineRunnerState,
    practiceSteps: readonly RoutinePracticeStep[],
    now: number,
  ): RoutineProgress;
  ```

- [ ] **Step 1: Write failing helper tests.**

  Add tests to `routine-runner.test.ts` that assert:

  ```ts
  expect(
    getRoutineProgress(createInitialRunnerState(), steps, now),
  ).toEqual({
    stepNumber: 1,
    totalSteps: 3,
    completedSteps: 0,
    routinePercent: 0,
    stepPercent: null,
  });
  ```

  Add a timer case with a five-second step paused at 2.5 seconds and assert
  `stepPercent` is `50`; add a completed state and assert `stepNumber` equals
  `totalSteps`, `completedSteps` equals `totalSteps`, and both percentages are
  `100`.

- [ ] **Step 2: Run the focused helper tests and verify RED.**

  Run:

  ```bash
  bunx vitest run src/lib/coaching/routine-runner.test.ts --reporter=dot
  ```

  Expected: the new import/function fails because `getRoutineProgress` is not
  yet exported.

- [ ] **Step 3: Implement the minimal pure helper.**

  In `routine-runner.ts`, derive `completedSteps` from `state.stepIndex` and
  clamp `routinePercent` to `[0, 100]`. For a timer use
  `getElapsedMs(state, now) / (durationSeconds * 1000)`; for breathing use the
  total duration of the validated phases multiplied by `cycles` and the same
  timestamp-derived elapsed time. For instructions return `stepPercent: null`.
  Return a completed result when `state.status === "completed"` or the step
  index is at the end. Never use interval count as input.

- [ ] **Step 4: Run the helper tests and the existing runner-domain suite.**

  Run:

  ```bash
  bunx vitest run src/lib/coaching/routine-runner.test.ts --reporter=dot
  ```

  Expected: all helper and pre-existing runner-domain tests pass.

- [ ] **Step 5: Commit the pure contract.**

  ```bash
  git add src/lib/coaching/routine-runner.ts src/lib/coaching/routine-runner.test.ts
  git commit -m "feat(coaching): add routine runner progress helpers"
  ```

### Task 2: Build the inline focus runner

**Files:**
- Modify: `src/app/(chat)/components/RoutineRunner.tsx`
- Test: `src/app/(chat)/components/RoutineRunner.test.tsx`

**Interfaces:**
- Consumes: `getRoutineProgress` from Task 1 and the existing runner callbacks.
- Produces: a `section` named by the routine title with an accessible
  `progressbar` and one primary action for the active step; `onCloseRequest` is
  called as `(hasProgress: boolean) => void` instead of closing unconditionally.

- [ ] **Step 1: Write failing component tests.**

  Extend `RoutineRunner.test.tsx` to assert:

  ```ts
  expect(screen.getByText("Passo 1 di 3")).toBeTruthy();
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
  ```

  Add a timer test that starts the five-second step, advances two seconds, and
  expects the progressbar value to be greater than `0` and less than `100`.
  Add a close test that clicks `Chiudi` before any action and expects
  `onCloseRequest(false)`, then advances one instruction and expects
  `onCloseRequest(true)`. Update the existing callback fixture from `onClose`
  to `onCloseRequest`.

- [ ] **Step 2: Run the component tests and verify RED.**

  Run:

  ```bash
  bunx vitest run 'src/app/(chat)/components/RoutineRunner.test.tsx' --reporter=dot
  ```

  Expected: failures for the missing progressbar, progress value and new close
  callback contract; existing timer/breathing behavior remains visible in the
  failure report.

- [ ] **Step 3: Implement the focus layout.**

  In `RoutineRunner.tsx`:

  - compute `progress = getRoutineProgress(state, practiceSteps, now)`;
  - render a semantic `<div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.routinePercent}>` with a tokenized track/fill and no width animation under reduced motion;
  - render `Passo ${progress.stepNumber} di ${progress.totalSteps}` above the active content;
  - keep only the current step body mounted and keep `Avvia`, `Pausa`, `Continua`,
    `Fatto` as the primary action depending on state;
  - use `progress.stepPercent` for timer/breathing secondary progress without
    inventing a completion percentage for instruction steps;
  - preserve the existing timestamp interval, visibility recalculation, wake
    lock and live announcements;
  - replace the immediate close callback with
    `onCloseRequest(state.stepIndex > 0 || state.elapsedMs > 0 || state.status !== "idle")`.

- [ ] **Step 4: Run focused UI tests and lint the touched files.**

  Run:

  ```bash
  bunx vitest run 'src/app/(chat)/components/RoutineRunner.test.tsx' --reporter=dot
  bunx biome check 'src/app/(chat)/components/RoutineRunner.tsx' 'src/app/(chat)/components/RoutineRunner.test.tsx'
  ```

  Expected: all runner tests pass and Biome reports no fixes.

- [ ] **Step 5: Commit the runner UI.**

  ```bash
  git add 'src/app/(chat)/components/RoutineRunner.tsx' 'src/app/(chat)/components/RoutineRunner.test.tsx'
  git commit -m "feat(coaching): focus routine runner inline"
  ```

### Task 3: Confirm interrupted runs in the card

**Files:**
- Modify: `src/app/(chat)/components/RoutineCard.tsx`
- Test: `src/app/(chat)/components/RoutineCard.test.tsx`

**Interfaces:**
- Consumes: `RoutineRunner`'s `onCloseRequest(hasProgress: boolean)` callback.
- Produces: an existing `ConfirmDialog` with Italian copy and a safe close
  path that never calls `onCreateAttempt`.

- [ ] **Step 1: Write failing card tests.**

  Add tests that:

  1. open the runner, advance the instruction, click `Chiudi`, and assert an
     alert dialog titled `Interrompere la routine?` is visible while the
     runner remains mounted;
  2. click `Annulla` and assert the dialog closes, the runner remains and
     `onCreateAttempt` is untouched;
  3. repeat the flow, click `Interrompi`, assert the runner disappears,
     `onCreateAttempt` is untouched, and the launch button receives focus;
  4. click `Chiudi` immediately before any progress and assert the runner
     closes without opening a dialog.

- [ ] **Step 2: Run the card tests and verify RED.**

  Run:

  ```bash
  bunx vitest run 'src/app/(chat)/components/RoutineCard.test.tsx' --reporter=dot
  ```

  Expected: the new confirmation assertions fail because the current runner
  closes immediately.

- [ ] **Step 3: Implement the confirmation boundary.**

  In `RoutineCard.tsx`, add the existing `useConfirm`/`ConfirmDialog` pattern
  with:

  ```ts
  {
    title: "Interrompere la routine?",
    description: "Il progresso di questa sessione non verrà salvato.",
    confirmText: "Interrompi",
    cancelText: "Continua",
  }
  ```

  The `onCloseRequest(false)` path calls the existing `setIsRunnerOpen(false)`
  immediately. The `true` path awaits `confirm`, and only a `true` result
  closes the runner. Pass `onCloseRequest={handleRunnerCloseRequest}` to the
  runner. Wire `ConfirmDialog.onOpenChange` to `handleCancel` when it closes so
  Escape, Cancel and backdrop dismissal resolve the confirmation instead of
  leaving a pending promise.

- [ ] **Step 4: Run card + runner regression tests and verify focus/mutations.**

  Run:

  ```bash
  bunx vitest run 'src/app/(chat)/components/RoutineRunner.test.tsx' 'src/app/(chat)/components/RoutineCard.test.tsx' --reporter=dot
  ```

  Expected: the focused runner/card suites pass; no interrupted path calls
  `onCreateAttempt`.

- [ ] **Step 5: Commit the card boundary.**

  ```bash
  git add 'src/app/(chat)/components/RoutineCard.tsx' 'src/app/(chat)/components/RoutineCard.test.tsx'
  git commit -m "feat(coaching): confirm interrupted routine runs"
  ```

### Task 4: Full regression and browser verification

**Files:**
- Modify only if a regression test needs an existing fixture: the focused
  runner/card test files from Tasks 1–3 and `e2e/routine-loop.spec.ts`.
- Do not modify Prisma schema, routes, or the unrelated documentation files.

**Interfaces:**
- Consumes: the final inline runner and card contracts from Tasks 1–3.
- Produces: verified desktop/mobile behavior with no new network mutation on
  start, pause, close or reset.

- [ ] **Step 1: Run the complete relevant unit set.**

  ```bash
  bunx vitest run \
    src/lib/coaching/routine-runner.test.ts \
    'src/app/(chat)/components/RoutineRunner.test.tsx' \
    'src/app/(chat)/components/RoutineCard.test.tsx' \
    'src/app/(chat)/components/RoutineCheckInForm.test.tsx' \
    'src/app/(chat)/components/RoutineHistory.test.tsx' \
    --reporter=dot
  ```

  Expected: all focused routine widget, check-in and history tests pass.

- [ ] **Step 2: Run project gates.**

  ```bash
  bun run test
  bun run typecheck
  bun run lint
  bun run build
  git diff --check
  ```

  Expected: unit, typecheck and build pass; if global lint reports the known
  generated `.impeccable/hook.cache.json` issue, leave that generated file
  untouched and report it separately.

- [ ] **Step 3: Run the routine E2E loop.**

  ```bash
  bun --env-file=.env.local run test:e2e -- e2e/routine-loop.spec.ts
  ```

  Add a non-mutating runner smoke to the existing saved-routine fixture and
  verify on desktop and mobile that the routine opens inline with `Passo 1 di
  3` and a semantic progressbar, starts without an AI turn, and can be closed
  first with `Continua` (the runner stays open) and then with `Interrompi` (the
  runner closes without creating an attempt). Keep the existing repeat,
  completion/check-in and refresh coverage; those tests verify that a fully
  completed run opens check-in and remains usable after refresh. Timer-specific
  continuation and timestamp/background behavior remain covered by the focused
  runner tests because the shared browser fixture uses instruction steps.

- [ ] **Step 4: Inspect the final diff and commit if any fixture-only change was needed.**

  ```bash
  git status --short
  git diff --stat
  git diff --check
  ```

  Expected: only the approved runner/card files and the new spec/plan are in
  the feature history; unrelated docs remain unstaged.
