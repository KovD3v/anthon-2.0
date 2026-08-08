import { describe, expect, it } from "vitest";
import type {
  RoutineBreathingStep,
  RoutinePracticeStep,
  RoutineTimerStep,
} from "./routine";
import {
  advanceRunner,
  createInitialRunnerState,
  getBreathingPhase,
  getElapsedMs,
  getRemainingMs,
  getRoutinePracticeSteps,
  pauseRunner,
  resetRunner,
  startRunner,
} from "./routine-runner";

const instruction: RoutinePracticeStep = {
  id: "ground",
  kind: "instruction",
  text: "Porta l'attenzione al prossimo gesto.",
};

const timer: RoutineTimerStep = {
  id: "reset",
  kind: "timer",
  label: "Reset",
  instruction: "Espira lentamente.",
  durationSeconds: 5,
};

const practiceSteps = [instruction, timer] as const;

describe("routine runner state machine", () => {
  it("keeps elapsed time from timestamps across start, pause, and reset", () => {
    const started = startRunner(createInitialRunnerState(), 1_000);
    const paused = pauseRunner(started, 2_250);

    expect(paused).toMatchObject({
      stepIndex: 0,
      status: "paused",
      elapsedMs: 1_250,
      startedAt: null,
    });
    expect(startRunner(paused, 10_000)).toMatchObject({
      status: "running",
      elapsedMs: 1_250,
      startedAt: 10_000,
    });
    expect(resetRunner(paused)).toEqual({
      stepIndex: 0,
      status: "idle",
      elapsedMs: 0,
      startedAt: null,
    });
  });

  it("advances an instruction only after its explicit action", () => {
    const next = advanceRunner(createInitialRunnerState(), practiceSteps, 0);

    expect(next).toEqual({
      stepIndex: 1,
      status: "idle",
      elapsedMs: 0,
      startedAt: null,
    });
  });

  it("does not advance a completed timer without a manual continue", () => {
    const runningTimer = {
      ...createInitialRunnerState(),
      stepIndex: 1,
      status: "running" as const,
      startedAt: 1_000,
    };

    expect(getRemainingMs(runningTimer, timer, 6_000)).toBe(0);
    expect(advanceRunner(runningTimer, practiceSteps, 6_000)).toEqual({
      stepIndex: 2,
      status: "completed",
      elapsedMs: 0,
      startedAt: null,
    });
  });

  it("does not allow an unfinished timer to advance", () => {
    const runningTimer = {
      ...createInitialRunnerState(),
      stepIndex: 1,
      status: "running" as const,
      startedAt: 1_000,
    };

    expect(advanceRunner(runningTimer, practiceSteps, 5_999)).toEqual(
      runningTimer,
    );
  });

  it("returns practice steps from legacy and typed routine proposals", () => {
    expect(
      getRoutinePracticeSteps({
        title: "Reset",
        trigger: "Dopo un errore",
        durationLabel: null,
        steps: ["Fermati", "Respira"],
        completionCue: "Riparti.",
      }),
    ).toEqual([
      { id: "instruction-1", kind: "instruction", text: "Fermati" },
      { id: "instruction-2", kind: "instruction", text: "Respira" },
    ]);
    expect(
      getRoutinePracticeSteps({
        formatVersion: 2,
        title: "Reset",
        trigger: "Dopo un errore",
        durationLabel: null,
        steps: [instruction, timer],
        completionCue: "Riparti.",
      }),
    ).toEqual(practiceSteps);
  });
});

describe("breathing phase contract", () => {
  const breathing: RoutineBreathingStep = {
    id: "breath",
    kind: "breathing",
    label: "Respiro",
    instruction: "Segui il ritmo.",
    inhaleSeconds: 2,
    holdAfterInhaleSeconds: 1,
    exhaleSeconds: 3,
    holdAfterExhaleSeconds: 1,
    cycles: 2,
  };

  it("derives a bounded textual phase from elapsed time without intervals", () => {
    expect(getBreathingPhase(breathing, 2_500)).toEqual({
      cycle: 1,
      label: "Pausa",
      phase: "hold-after-inhale",
      remainingMs: 500,
    });
    expect(getBreathingPhase(breathing, 7_000)).toEqual({
      cycle: 2,
      label: "Inspira",
      phase: "inhale",
      remainingMs: 2_000,
    });
    expect(getBreathingPhase(breathing, 14_000)).toBeNull();
  });

  it("uses timestamps for phase boundaries, pauses, and a bounded number of cycles", () => {
    const running = startRunner(createInitialRunnerState(), 1_000);

    expect(
      getBreathingPhase(breathing, getElapsedMs(running, 3_000)),
    ).toMatchObject({
      cycle: 1,
      phase: "hold-after-inhale",
      label: "Pausa",
    });
    const paused = pauseRunner(running, 3_000);
    expect(
      getBreathingPhase(breathing, getElapsedMs(paused, 100_000)),
    ).toMatchObject({
      cycle: 1,
      phase: "hold-after-inhale",
    });
    const resumed = startRunner(paused, 100_000);
    expect(
      getBreathingPhase(breathing, getElapsedMs(resumed, 108_000)),
    ).toMatchObject({
      cycle: 2,
      phase: "exhale",
      label: "Espira",
      remainingMs: 3_000,
    });
    expect(
      getBreathingPhase(breathing, getElapsedMs(resumed, 112_000)),
    ).toBeNull();
  });

  it("allows manual advance only after the guided breathing step has finished", () => {
    const running = startRunner(createInitialRunnerState(), 1_000);

    expect(advanceRunner(running, [breathing, instruction], 14_999)).toBe(
      running,
    );
    expect(advanceRunner(running, [breathing, instruction], 15_000)).toEqual({
      stepIndex: 1,
      status: "idle",
      elapsedMs: 0,
      startedAt: null,
    });
  });
});
