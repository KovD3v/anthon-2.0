import {
  type NormalizedRoutineProposal,
  normalizeRoutineProposal,
  type RoutineBreathingStep,
  type RoutinePracticeStep,
  type RoutineTimerStep,
  type StoredRoutineProposal,
} from "./routine";

export type RoutineRunnerStatus = "idle" | "running" | "paused" | "completed";

export interface RoutineRunnerState {
  stepIndex: number;
  status: RoutineRunnerStatus;
  elapsedMs: number;
  startedAt: number | null;
}

export interface BreathingPhase {
  cycle: number;
  label: "Inspira" | "Espira" | "Pausa";
  phase: "inhale" | "hold-after-inhale" | "exhale" | "hold-after-exhale";
  remainingMs: number;
}

export type RoutineRunnerInput =
  | StoredRoutineProposal
  | Pick<NormalizedRoutineProposal, "practiceSteps">;

export function getRoutinePracticeSteps(
  routine: RoutineRunnerInput,
): RoutinePracticeStep[] {
  return "practiceSteps" in routine
    ? routine.practiceSteps
    : normalizeRoutineProposal(routine).practiceSteps;
}

export function createInitialRunnerState(): RoutineRunnerState {
  return {
    stepIndex: 0,
    status: "idle",
    elapsedMs: 0,
    startedAt: null,
  };
}

export function startRunner(
  state: RoutineRunnerState,
  now: number,
): RoutineRunnerState {
  if (state.status === "completed" || state.status === "running") return state;

  return {
    ...state,
    status: "running",
    startedAt: now,
  };
}

export function pauseRunner(
  state: RoutineRunnerState,
  now: number,
): RoutineRunnerState {
  if (state.status !== "running" || state.startedAt === null) return state;

  return {
    ...state,
    status: "paused",
    elapsedMs: state.elapsedMs + Math.max(0, now - state.startedAt),
    startedAt: null,
  };
}

export function resetRunner(state: RoutineRunnerState): RoutineRunnerState {
  if (state.status === "completed") return state;

  return {
    ...state,
    status: "idle",
    elapsedMs: 0,
    startedAt: null,
  };
}

export function getElapsedMs(state: RoutineRunnerState, now: number): number {
  if (state.status !== "running" || state.startedAt === null) {
    return state.elapsedMs;
  }

  return state.elapsedMs + Math.max(0, now - state.startedAt);
}

export function getRemainingMs(
  state: RoutineRunnerState,
  step: RoutineTimerStep,
  now: number,
): number {
  return Math.max(0, step.durationSeconds * 1_000 - getElapsedMs(state, now));
}

export function getBreathingPhase(
  step: RoutineBreathingStep,
  elapsedMs: number,
): BreathingPhase | null {
  const phases = [
    {
      phase: "inhale" as const,
      label: "Inspira" as const,
      durationMs: step.inhaleSeconds * 1_000,
    },
    {
      phase: "hold-after-inhale" as const,
      label: "Pausa" as const,
      durationMs: step.holdAfterInhaleSeconds * 1_000,
    },
    {
      phase: "exhale" as const,
      label: "Espira" as const,
      durationMs: step.exhaleSeconds * 1_000,
    },
    {
      phase: "hold-after-exhale" as const,
      label: "Pausa" as const,
      durationMs: step.holdAfterExhaleSeconds * 1_000,
    },
  ].filter((phase) => phase.durationMs > 0);
  const cycleDurationMs = phases.reduce(
    (total, phase) => total + phase.durationMs,
    0,
  );
  const boundedElapsedMs = Math.max(0, elapsedMs);
  const totalDurationMs = cycleDurationMs * step.cycles;

  if (boundedElapsedMs >= totalDurationMs) return null;

  const cycle = Math.floor(boundedElapsedMs / cycleDurationMs) + 1;
  let elapsedInCycleMs = boundedElapsedMs % cycleDurationMs;

  for (const phase of phases) {
    if (elapsedInCycleMs < phase.durationMs) {
      return {
        cycle,
        label: phase.label,
        phase: phase.phase,
        remainingMs: phase.durationMs - elapsedInCycleMs,
      };
    }
    elapsedInCycleMs -= phase.durationMs;
  }

  return null;
}

export function advanceRunner(
  state: RoutineRunnerState,
  practiceSteps: readonly RoutinePracticeStep[],
  now: number,
): RoutineRunnerState {
  if (state.status === "completed") return state;

  const currentStep = practiceSteps[state.stepIndex];
  if (!currentStep) {
    return {
      ...state,
      stepIndex: practiceSteps.length,
      status: "completed",
      elapsedMs: 0,
      startedAt: null,
    };
  }

  if (
    currentStep.kind === "timer" &&
    getRemainingMs(state, currentStep, now) > 0
  ) {
    return state;
  }

  if (
    currentStep.kind === "breathing" &&
    getBreathingPhase(currentStep, getElapsedMs(state, now)) !== null
  ) {
    return state;
  }

  const nextStepIndex = state.stepIndex + 1;
  return {
    stepIndex: nextStepIndex,
    status: nextStepIndex === practiceSteps.length ? "completed" : "idle",
    elapsedMs: 0,
    startedAt: null,
  };
}
