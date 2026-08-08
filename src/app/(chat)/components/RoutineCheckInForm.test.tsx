// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoutineCardData } from "@/lib/coaching/routine";
import { RoutineClientError } from "@/lib/coaching/routine-client";
import { RoutineCheckInForm } from "./RoutineCheckInForm";

const routine: RoutineCardData = {
  id: "routine-1",
  sourceChatId: "chat-1",
  sourceAssistantMessageId: "assistant-1",
  status: "ACTIVE",
  formatVersion: 1,
  proposal: {
    title: "Reset dopo un errore",
    trigger: "Quando commetti un errore in gara",
    durationLabel: "60 secondi",
    steps: ["Fermati", "Espira lentamente", "Scegli il prossimo gesto"],
    completionCue: "Riparti con lo sguardo sul compito successivo",
  },
  archivedAt: null,
  latestAttempt: null,
};

const interactiveRoutine: RoutineCardData = {
  ...routine,
  formatVersion: 2,
  proposal: {
    formatVersion: 2,
    title: "Reset dopo un errore",
    trigger: "Quando commetti un errore in gara",
    durationLabel: "60 secondi",
    completionCue: "Riparti con lo sguardo sul compito successivo",
    steps: [
      {
        id: "ground",
        kind: "instruction",
        text: "Porta l'attenzione al prossimo gesto.",
      },
      {
        id: "outcome",
        kind: "form",
        question: "Cosa ti ha lasciato la routine?",
        mode: "choice",
        options: [
          { label: "Mi ha centrato", outcome: "HELPFUL" },
          { label: "Solo in parte", outcome: "PARTIALLY_HELPFUL" },
          { label: "Non ha inciso", outcome: "NOT_HELPFUL" },
        ],
        noteEnabled: true,
      },
    ],
  },
};

function renderForm(
  currentRoutine: RoutineCardData = routine,
  overrides: Partial<React.ComponentProps<typeof RoutineCheckInForm>> = {},
) {
  const props: React.ComponentProps<typeof RoutineCheckInForm> = {
    routine: currentRoutine,
    onCreateAttempt: vi.fn().mockResolvedValue(currentRoutine),
    onSaveOutcome: vi.fn().mockResolvedValue(currentRoutine),
    ...overrides,
  };
  return { ...render(<RoutineCheckInForm {...props} />), props };
}

afterEach(cleanup);

describe("RoutineCheckInForm", () => {
  it("uses the terminal routine form and preserves the selected outcome and note after a PATCH failure", async () => {
    const pendingRoutine: RoutineCardData = {
      ...interactiveRoutine,
      latestAttempt: {
        id: "attempt-1",
        attemptedAt: "2026-08-08T09:00:00.000Z",
        outcome: null,
        outcomeNote: null,
        outcomeRecordedAt: null,
      },
    };
    const user = userEvent.setup();
    const { props } = renderForm(pendingRoutine, {
      onSaveOutcome: vi.fn().mockRejectedValue(new Error("offline")),
    });

    expect(
      screen.getByRole("group", { name: "Cosa ti ha lasciato la routine?" }),
    ).toBeTruthy();
    const note = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Nota facoltativa",
    });
    await user.type(note, "Ho perso il ritmo");
    await user.click(screen.getByRole("button", { name: "Solo in parte" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(note.value).toBe("Ho perso il ritmo");
    expect(
      screen
        .getByRole("button", { name: "Solo in parte" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(props.onSaveOutcome).toHaveBeenCalledWith(
      "attempt-1",
      "PARTIALLY_HELPFUL",
      "Ho perso il ritmo",
    );
  });

  it("renders no outcome controls or creation path without an authoritative pending attempt", () => {
    const { props } = renderForm();

    expect(
      screen.queryByRole("textbox", { name: "Nota facoltativa" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Mi ha aiutato" })).toBeNull();
    expect(props.onCreateAttempt).not.toHaveBeenCalled();
    expect(props.onSaveOutcome).not.toHaveBeenCalled();
  });

  it("focuses and reports readiness only once across parent rerenders", async () => {
    const onFocused = vi.fn();
    const focusSpy = vi.spyOn(HTMLTextAreaElement.prototype, "focus");
    const pendingRoutine: RoutineCardData = {
      ...routine,
      latestAttempt: {
        id: "attempt-1",
        attemptedAt: "2026-08-08T09:00:00.000Z",
        outcome: null,
        outcomeNote: null,
        outcomeRecordedAt: null,
      },
    };
    const { rerender, props } = renderForm(pendingRoutine, { onFocused });

    await screen.findByRole("textbox", { name: "Nota facoltativa" });

    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Nota facoltativa" }),
    );
    expect(onFocused).toHaveBeenCalledOnce();
    expect(focusSpy).toHaveBeenCalledOnce();

    rerender(<RoutineCheckInForm {...props} onFocused={vi.fn()} />);
    expect(onFocused).toHaveBeenCalledOnce();
    expect(focusSpy).toHaveBeenCalledOnce();
  });

  it("patches the newest pending attempt instead of creating another one", async () => {
    const pendingAttemptRoutine: RoutineCardData = {
      ...routine,
      latestAttempt: {
        id: "attempt-1",
        attemptedAt: "2026-08-08T09:00:00.000Z",
        outcome: null,
        outcomeNote: null,
        outcomeRecordedAt: null,
      },
    };
    const user = userEvent.setup();
    const { props } = renderForm(pendingAttemptRoutine);

    await user.click(screen.getByRole("button", { name: "In parte" }));

    expect(props.onSaveOutcome).toHaveBeenCalledWith(
      "attempt-1",
      "PARTIALLY_HELPFUL",
      null,
    );
    expect(props.onCreateAttempt).not.toHaveBeenCalled();
  });

  it("uses the same three canonical PATCH mappings for a structured scale form", async () => {
    const interactiveProposal = interactiveRoutine.proposal as Extract<
      RoutineCardData["proposal"],
      { formatVersion: 2 }
    >;
    const scaleRoutine: RoutineCardData = {
      ...interactiveRoutine,
      proposal: {
        ...interactiveProposal,
        steps: interactiveProposal.steps.map((step) =>
          step.kind === "form" ? { ...step, mode: "scale" as const } : step,
        ),
      },
      latestAttempt: {
        id: "attempt-scale",
        attemptedAt: "2026-08-08T09:00:00.000Z",
        outcome: null,
        outcomeNote: null,
        outcomeRecordedAt: null,
      },
    };
    const user = userEvent.setup();
    const { props } = renderForm(scaleRoutine);

    expect(screen.queryByRole("slider")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Non ha inciso" }));

    expect(props.onSaveOutcome).toHaveBeenCalledWith(
      "attempt-scale",
      "NOT_HELPFUL",
      null,
    );
    expect(props.onCreateAttempt).not.toHaveBeenCalled();
  });

  it("renders no outcome controls when the latest attempt already has an outcome", () => {
    const completedAttemptRoutine: RoutineCardData = {
      ...routine,
      latestAttempt: {
        id: "attempt-complete",
        attemptedAt: "2026-08-08T09:00:00.000Z",
        outcome: "HELPFUL",
        outcomeNote: null,
        outcomeRecordedAt: "2026-08-08T09:05:00.000Z",
      },
    };
    const { props } = renderForm(completedAttemptRoutine);

    expect(screen.queryByRole("button", { name: "Non ha aiutato" })).toBeNull();
    expect(props.onCreateAttempt).not.toHaveBeenCalled();
    expect(props.onSaveOutcome).not.toHaveBeenCalled();
  });

  it("announces failure and restores all outcome actions for retry", async () => {
    const user = userEvent.setup();
    const pendingRoutine: RoutineCardData = {
      ...routine,
      latestAttempt: {
        id: "attempt-1",
        attemptedAt: "2026-08-08T09:00:00.000Z",
        outcome: null,
        outcomeNote: null,
        outcomeRecordedAt: null,
      },
    };
    renderForm(pendingRoutine, {
      onSaveOutcome: vi.fn().mockRejectedValue(new Error("offline")),
    });

    await user.click(screen.getByRole("button", { name: "Mi ha aiutato" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Non siamo riusciti a registrare l'esito. Riprova.",
    );
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Mi ha aiutato",
      }).disabled,
    ).toBe(false);
  });

  it("preserves status-aware conflict copy", async () => {
    const user = userEvent.setup();
    const pendingRoutine: RoutineCardData = {
      ...routine,
      latestAttempt: {
        id: "attempt-1",
        attemptedAt: "2026-08-08T09:00:00.000Z",
        outcome: null,
        outcomeNote: null,
        outcomeRecordedAt: null,
      },
    };
    renderForm(pendingRoutine, {
      onSaveOutcome: vi
        .fn()
        .mockRejectedValue(
          new RoutineClientError(
            "La routine non è più attiva. Aggiorna la chat e riprova.",
            409,
          ),
        ),
    });

    await user.click(screen.getByRole("button", { name: "Mi ha aiutato" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "La routine non è più attiva. Aggiorna la chat e riprova.",
    );
  });

  it("gives each outcome a mobile-sized action target", () => {
    renderForm({
      ...routine,
      latestAttempt: {
        id: "attempt-1",
        attemptedAt: "2026-08-08T09:00:00.000Z",
        outcome: null,
        outcomeNote: null,
        outcomeRecordedAt: null,
      },
    });

    for (const name of ["Mi ha aiutato", "In parte", "Non ha aiutato"]) {
      expect(screen.getByRole("button", { name }).className).toContain(
        "min-h-11",
      );
    }
  });
});
