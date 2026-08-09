// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeRoutineProposal } from "@/lib/coaching/routine";
import { RoutineRunner } from "./RoutineRunner";

const routine = normalizeRoutineProposal({
  formatVersion: 2,
  title: "Reset dopo l'errore",
  trigger: "Dopo un errore in gara",
  durationLabel: "5 secondi",
  completionCue: "Riparti sul gesto successivo.",
  steps: [
    {
      id: "ground",
      kind: "instruction",
      text: "Porta l'attenzione al prossimo gesto.",
    },
    {
      id: "reset",
      kind: "timer",
      label: "Reset",
      instruction: "Espira lentamente.",
      durationSeconds: 5,
    },
    {
      id: "outcome",
      kind: "form",
      question: "Quanto ti è stata utile?",
      mode: "choice",
      options: [
        { label: "Mi ha aiutato", outcome: "HELPFUL" },
        { label: "In parte", outcome: "PARTIALLY_HELPFUL" },
        { label: "Non mi ha aiutato", outcome: "NOT_HELPFUL" },
      ],
      noteEnabled: true,
    },
  ],
});

const focusRoutine = normalizeRoutineProposal({
  formatVersion: 2,
  title: "Routine di focus",
  trigger: "Prima di allenarti",
  durationLabel: "5 minuti",
  completionCue: "Porta con te questa attenzione.",
  steps: [
    {
      id: "prepare",
      kind: "instruction",
      text: "Scegli un'intenzione per l'allenamento.",
    },
    {
      id: "focus-timer",
      kind: "timer",
      label: "Focus",
      instruction: "Resta con il respiro.",
      durationSeconds: 5,
    },
    {
      id: "finish",
      kind: "instruction",
      text: "Nota come ti senti.",
    },
  ],
});

function renderRunner(
  overrides: Partial<React.ComponentProps<typeof RoutineRunner>> = {},
) {
  const props: React.ComponentProps<typeof RoutineRunner> = {
    routine,
    completionForm: routine.completionForm,
    onComplete: vi.fn(),
    onCloseRequest: vi.fn(),
    ...overrides,
  };

  return { ...render(<RoutineRunner {...props} />), props };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: undefined,
  });
});

describe("RoutineRunner", () => {
  it("renders the routine progress from the first step", () => {
    renderRunner({
      routine: focusRoutine,
      completionForm: focusRoutine.completionForm,
    });

    expect(screen.getByText("Passo 1 di 3")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "0",
    );
  });

  it("updates routine progress while a timer is running", () => {
    vi.useFakeTimers({ now: new Date("2026-08-08T10:00:00.000Z") });
    renderRunner({
      routine: focusRoutine,
      completionForm: focusRoutine.completionForm,
    });

    fireEvent.click(screen.getByRole("button", { name: "Fatto" }));
    fireEvent.click(screen.getByRole("button", { name: "Avvia" }));
    act(() => vi.advanceTimersByTime(2_000));

    const progress = Number(
      screen.getByRole("progressbar").getAttribute("aria-valuenow"),
    );
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(100);
  });

  it("requests close with whether the runner has progress", () => {
    const { props } = renderRunner();

    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(props.onCloseRequest).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "Fatto" }));
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(props.onCloseRequest).toHaveBeenLastCalledWith(true);
  });

  it("keeps completion explicit: an ended timer waits for Continua and never renders the terminal form", () => {
    vi.useFakeTimers({ now: new Date("2026-08-08T10:00:00.000Z") });
    const { props } = renderRunner();

    fireEvent.click(screen.getByRole("button", { name: "Fatto" }));
    expect(
      screen
        .getAllByText("Passo 2 di 2")
        .some((element) => element.getAttribute("role") !== "status"),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Avvia" }));
    act(() => vi.advanceTimersByTime(5_000));

    expect(screen.getByRole("button", { name: "Continua" })).toBeTruthy();
    expect(props.onComplete).not.toHaveBeenCalled();
    expect(screen.queryByText("Quanto ti è stata utile?")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Continua" }));
    expect(props.onComplete).not.toHaveBeenCalled();
    const complete = screen.getByRole("button", {
      name: "Ho completato la routine",
    });
    fireEvent.click(complete);
    fireEvent.click(complete);
    expect(props.onComplete).toHaveBeenCalledOnce();
  });

  it("derives remaining time after a background visibility change without live-announcing every tick", () => {
    vi.useFakeTimers({ now: new Date("2026-08-08T10:00:00.000Z") });
    renderRunner({
      routine: { ...routine, practiceSteps: [routine.practiceSteps[1]] },
    });

    fireEvent.click(screen.getByRole("button", { name: "Avvia" }));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => vi.advanceTimersByTime(5_000));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));

    expect(screen.getByRole("button", { name: "Continua" })).toBeTruthy();
    expect(screen.getByText("00:00").getAttribute("aria-live")).toBeNull();
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  });

  it("derives guided breathing phases from time, stops at the cycle limit, and advances only after completion", () => {
    vi.useFakeTimers({ now: new Date("2026-08-08T10:00:00.000Z") });
    const { props } = renderRunner({
      routine: {
        ...routine,
        practiceSteps: [
          {
            id: "breath",
            kind: "breathing",
            label: "Respiro",
            instruction: "Segui il ritmo che preferisci.",
            inhaleSeconds: 2,
            holdAfterInhaleSeconds: 1,
            exhaleSeconds: 3,
            holdAfterExhaleSeconds: 0,
            cycles: 2,
          },
        ],
      },
    });

    expect(screen.getByText("Respirazione guidata")).toBeTruthy();
    expect(screen.getByTestId("breathing-phase").textContent).toContain(
      "Inspira",
    );
    expect(screen.getByText("Ciclo 1 di 2")).toBeTruthy();
    expect(screen.getByTestId("breathing-indicator").className).toContain(
      "motion-reduce:hidden",
    );
    expect(screen.queryByRole("button", { name: "Fatto" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Avvia" }));
    expect(screen.getByText("Inspira, ciclo 1")).toBeTruthy();
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByTestId("breathing-phase").textContent).toContain(
      "Pausa",
    );
    expect(screen.getByText("Pausa, ciclo 1")).toBeTruthy();
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByTestId("breathing-phase").textContent).toContain(
      "Espira",
    );
    expect(screen.getByText("Espira, ciclo 1")).toBeTruthy();
    act(() => vi.advanceTimersByTime(9_000));

    expect(props.onComplete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continua" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Ho completato la routine" }),
    );
    expect(props.onComplete).toHaveBeenCalledOnce();
  });

  it("recalculates breathing from timestamps after the document returns from background", () => {
    vi.useFakeTimers({ now: new Date("2026-08-08T10:00:00.000Z") });
    renderRunner({
      routine: {
        ...routine,
        practiceSteps: [
          {
            id: "breath",
            kind: "breathing",
            label: "Respiro",
            instruction: "Segui il ritmo.",
            inhaleSeconds: 2,
            holdAfterInhaleSeconds: 1,
            exhaleSeconds: 3,
            holdAfterExhaleSeconds: 0,
            cycles: 2,
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Avvia" }));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => vi.advanceTimersByTime(3_000));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    act(() => document.dispatchEvent(new Event("visibilitychange")));

    expect(screen.getByTestId("breathing-phase").textContent).toContain(
      "Espira",
    );
    expect(
      screen.getByTestId("breathing-phase").getAttribute("aria-live"),
    ).toBeNull();
  });

  it("stops ticking and releases Wake Lock when a timer reaches zero", async () => {
    vi.useFakeTimers({ now: new Date("2026-08-08T10:00:00.000Z") });
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release });
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request },
    });
    renderRunner({
      routine: { ...routine, practiceSteps: [routine.practiceSteps[1]] },
    });

    fireEvent.click(screen.getByRole("button", { name: "Avvia" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(request).toHaveBeenCalledWith("screen");
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    act(() => vi.advanceTimersByTime(5_000));
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "Continua" })).toBeTruthy();
    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });

  it("supports keyboard actions, 44px controls, and focus return on close", async () => {
    const user = userEvent.setup();
    const launch = document.createElement("button");
    launch.textContent = "Avvia routine";
    document.body.append(launch);
    launch.focus();
    const { props } = renderRunner();

    expect(document.activeElement).toBe(
      screen.getByRole("region", { name: routine.title }),
    );
    expect(
      screen.getByRole("region", { name: routine.title }).className,
    ).toContain("motion-reduce:transition-none");
    for (const name of ["Chiudi", "Fatto"]) {
      expect(screen.getByRole("button", { name }).className).toContain(
        "min-h-11",
      );
    }

    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Chiudi" }),
    );
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Fatto" }),
    );
    await user.keyboard("{Enter}");
    for (const name of ["Avvia", "Ripristina"]) {
      expect(screen.getByRole("button", { name }).className).toContain(
        "min-h-11",
      );
    }

    screen.getByRole<HTMLButtonElement>("button", { name: "Chiudi" }).focus();
    await user.keyboard("{Enter}");

    expect(props.onCloseRequest).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(launch);
    launch.remove();
  });
});
