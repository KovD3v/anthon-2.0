// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoutineCardData } from "@/lib/coaching/routine";
import { RoutineClientError } from "@/lib/coaching/routine-client";
import { RoutineCard } from "./RoutineCard";

const mocks = vi.hoisted(() => ({ trackRoutineAnalytics: vi.fn() }));

vi.mock("@/lib/coaching/routine-analytics-client", () => ({
  trackRoutineAnalytics: mocks.trackRoutineAnalytics,
}));

const proposal = {
  title: "Reset dopo un errore",
  trigger: "Quando commetti un errore in gara",
  durationLabel: "60 secondi",
  steps: ["Fermati", "Espira lentamente", "Scegli il prossimo gesto"],
  completionCue: "Riparti con lo sguardo sul compito successivo",
};

const activeRoutine: RoutineCardData = {
  id: "routine-1",
  sourceChatId: "chat-1",
  sourceAssistantMessageId: "assistant-1",
  status: "ACTIVE",
  formatVersion: 1,
  proposal,
  archivedAt: null,
  latestAttempt: null,
};

const interactiveProposal = {
  formatVersion: 2 as const,
  title: "Reset dopo un errore",
  trigger: "Quando commetti un errore in gara",
  durationLabel: "60 secondi",
  completionCue: "Riparti con lo sguardo sul compito successivo",
  steps: [
    {
      id: "ground",
      kind: "instruction" as const,
      text: "Porta l'attenzione al prossimo gesto.",
    },
    {
      id: "outcome",
      kind: "form" as const,
      question: "Quanto ti è stata utile questa routine?",
      mode: "choice" as const,
      options: [
        { label: "Mi ha aiutato", outcome: "HELPFUL" as const },
        { label: "In parte", outcome: "PARTIALLY_HELPFUL" as const },
        { label: "Non mi ha aiutato", outcome: "NOT_HELPFUL" as const },
      ],
      noteEnabled: true,
    },
  ],
};

const interactiveRoutine: RoutineCardData = {
  ...activeRoutine,
  formatVersion: 2,
  proposal: interactiveProposal,
};

function deferredRoutine() {
  let resolve: (routine: RoutineCardData) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<RoutineCardData>((resolver, rejecter) => {
    resolve = resolver;
    reject = rejecter;
  });
  return { promise, resolve, reject };
}

function renderProposal(
  overrides: Partial<React.ComponentProps<typeof RoutineCard>> = {},
) {
  const props: React.ComponentProps<typeof RoutineCard> = {
    proposal,
    routine: null,
    sourceAssistantMessageId: "assistant-1",
    isGuest: false,
    registrationHref: "/sign-up?redirect_url=%2Fchat%2Fchat-1",
    onSave: vi.fn().mockResolvedValue(activeRoutine),
    onCreateAttempt: vi.fn().mockResolvedValue(activeRoutine),
    onSaveOutcome: vi.fn().mockResolvedValue(activeRoutine),
    onArchive: vi.fn().mockResolvedValue(activeRoutine),
    onTryNow: vi.fn(),
    onAdapt: vi.fn(),
    ...overrides,
  };

  return { ...render(<RoutineCard {...props} />), props };
}

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  mocks.trackRoutineAnalytics.mockReset();
  vi.useRealTimers();
});

describe("RoutineCard proposal", () => {
  it("tracks a proposal once across a card remount", () => {
    const first = renderProposal();
    expect(mocks.trackRoutineAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({ event: "routine_proposed" }),
    );
    first.unmount();
    renderProposal();
    expect(
      mocks.trackRoutineAnalytics.mock.calls.filter(
        ([event]) => event.event === "routine_proposed",
      ),
    ).toHaveLength(1);
  });

  it("renders the actionable coaching snapshot without claiming it is active", () => {
    renderProposal();

    expect(screen.getByText("Routine proposta")).toBeTruthy();
    expect(screen.getByRole("heading", { name: proposal.title })).toBeTruthy();
    expect(screen.getByText(proposal.trigger)).toBeTruthy();
    expect(screen.getByText(proposal.durationLabel)).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(proposal.completionCue)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salva routine" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "La provo ora" })).toBeTruthy();
    expect(screen.queryByText("Routine attiva")).toBeNull();
  });

  it("gates guest persistence behind registration without invoking a mutation", async () => {
    const onSave = vi.fn();
    renderProposal({ isGuest: true, onSave });

    const registration = screen.getByRole("link", { name: "Salva routine" });
    expect(registration.getAttribute("href")).toBe(
      "/sign-up?redirect_url=%2Fchat%2Fchat-1",
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByText("Routine attiva")).toBeNull();
  });

  it("prevents duplicate saves and shows active state only after parent data updates", async () => {
    const pending = deferredRoutine();
    const onSave = vi.fn().mockReturnValue(pending.promise);
    const user = userEvent.setup();
    const view = renderProposal({ onSave });
    const save = screen.getByRole<HTMLButtonElement>("button", {
      name: "Salva routine",
    });

    await user.click(save);
    await user.click(save);

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith("assistant-1");
    expect(save.disabled).toBe(true);
    expect(screen.getByText("Salvataggio routine…")).toBeTruthy();
    expect(screen.queryByText("Routine attiva")).toBeNull();

    await act(async () => {
      pending.resolve(activeRoutine);
      await pending.promise;
    });
    view.rerender(<RoutineCard {...view.props} routine={activeRoutine} />);

    await waitFor(() =>
      expect(screen.getByText("Routine attiva")).toBeTruthy(),
    );
  });

  it("announces a recoverable error and never leaves a false saved state", async () => {
    const user = userEvent.setup();
    renderProposal({
      onSave: vi.fn().mockRejectedValue(new Error("unprocessable")),
    });

    await user.click(screen.getByRole("button", { name: "Salva routine" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Non siamo riusciti a salvare la routine. Riprova.",
    );
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Salva routine" })
        .disabled,
    ).toBe(false);
    expect(screen.queryByText("Routine attiva")).toBeNull();
  });

  it("preserves status-aware routine client copy", async () => {
    const user = userEvent.setup();
    renderProposal({
      onSave: vi
        .fn()
        .mockRejectedValue(
          new RoutineClientError(
            "La proposta non è più valida. Aggiorna la chat e riprova.",
            422,
          ),
        ),
    });

    await user.click(screen.getByRole("button", { name: "Salva routine" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "La proposta non è più valida. Aggiorna la chat e riprova.",
    );
  });

  it("prefills the composer without creating an attempt", async () => {
    const user = userEvent.setup();
    const onTryNow = vi.fn();
    const onCreateAttempt = vi.fn();
    renderProposal({ onTryNow, onCreateAttempt });

    await user.click(screen.getByRole("button", { name: "La provo ora" }));

    expect(onTryNow).toHaveBeenCalledOnce();
    expect(onCreateAttempt).not.toHaveBeenCalled();
  });
});

describe("RoutineCard active lifecycle", () => {
  it("starts a runner inline without recording an attempt until the routine finishes", async () => {
    const user = userEvent.setup();
    const onCreateAttempt = vi.fn().mockResolvedValue({
      ...interactiveRoutine,
      latestAttempt: {
        id: "attempt-1",
        attemptedAt: "2026-08-08T10:00:00.000Z",
        outcome: null,
        outcomeNote: null,
        outcomeRecordedAt: null,
      },
    });
    renderProposal({
      proposal: interactiveProposal,
      routine: interactiveRoutine,
      onCreateAttempt,
    });

    await user.click(screen.getByRole("button", { name: "Avvia routine" }));

    expect(
      screen.getAllByRole("region", { name: interactiveProposal.title }),
    ).toHaveLength(2);
    expect(onCreateAttempt).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Fatto" }));

    expect(onCreateAttempt).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Ho completato la routine" }),
    );
    await waitFor(() =>
      expect(onCreateAttempt).toHaveBeenCalledWith("routine-1"),
    );
    expect(onCreateAttempt).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("group", {
        name: "Quanto ti è stata utile questa routine?",
      }),
    ).toBeTruthy();
  });

  it("asks for confirmation when a progressed inline runner is closed", async () => {
    const user = userEvent.setup();
    renderProposal({
      proposal: interactiveProposal,
      routine: interactiveRoutine,
    });

    await user.click(screen.getByRole("button", { name: "Avvia routine" }));
    await user.click(screen.getByRole("button", { name: "Fatto" }));
    await user.click(screen.getByRole("button", { name: "Chiudi" }));

    expect(
      screen.getByRole("alertdialog", { name: "Interrompere la routine?" }),
    ).toBeTruthy();
    expect(screen.getByText("Routine guidata")).toBeTruthy();
  });

  it("keeps a progressed runner open when its interruption is cancelled", async () => {
    const user = userEvent.setup();
    const onCreateAttempt = vi.fn();
    renderProposal({
      proposal: interactiveProposal,
      routine: interactiveRoutine,
      onCreateAttempt,
    });

    await user.click(screen.getByRole("button", { name: "Avvia routine" }));
    await user.click(screen.getByRole("button", { name: "Fatto" }));
    await user.click(screen.getByRole("button", { name: "Chiudi" }));
    await user.click(screen.getByRole("button", { name: "Continua" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("Routine guidata")).toBeTruthy();
    expect(onCreateAttempt).not.toHaveBeenCalled();
  });

  it("interrupts a progressed runner without creating an attempt and restores launch focus", async () => {
    const user = userEvent.setup();
    const onCreateAttempt = vi.fn();
    renderProposal({
      proposal: interactiveProposal,
      routine: interactiveRoutine,
      onCreateAttempt,
    });
    const launch = screen.getByRole<HTMLButtonElement>("button", {
      name: "Avvia routine",
    });

    await user.click(launch);
    await user.click(screen.getByRole("button", { name: "Fatto" }));
    await user.click(screen.getByRole("button", { name: "Chiudi" }));
    await user.click(screen.getByRole("button", { name: "Interrompi" }));

    expect(screen.queryByText("Routine guidata")).toBeNull();
    const restoredLaunch = screen.getByRole("button", {
      name: "Avvia routine",
    });
    await waitFor(() => expect(document.activeElement).toBe(restoredLaunch));
    expect(onCreateAttempt).not.toHaveBeenCalled();
  });

  it("closes an idle runner immediately without requesting confirmation", async () => {
    const user = userEvent.setup();
    renderProposal({
      proposal: interactiveProposal,
      routine: interactiveRoutine,
    });
    const launch = screen.getByRole<HTMLButtonElement>("button", {
      name: "Avvia routine",
    });

    await user.click(launch);
    await user.click(screen.getByRole("button", { name: "Chiudi" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByText("Routine guidata")).toBeNull();
    const restoredLaunch = screen.getByRole("button", {
      name: "Avvia routine",
    });
    await waitFor(() => expect(document.activeElement).toBe(restoredLaunch));
  });

  it("keeps the completed runner open and retries its authoritative attempt after a failure", async () => {
    const user = userEvent.setup();
    const onCreateAttempt = vi
      .fn()
      .mockRejectedValueOnce(new RoutineClientError("Conflitto routine", 409))
      .mockResolvedValueOnce({
        ...interactiveRoutine,
        latestAttempt: {
          id: "attempt-1",
          attemptedAt: "2026-08-08T10:00:00.000Z",
          outcome: null,
          outcomeNote: null,
          outcomeRecordedAt: null,
        },
      });
    renderProposal({
      proposal: interactiveProposal,
      routine: interactiveRoutine,
      onCreateAttempt,
    });

    await user.click(screen.getByRole("button", { name: "Avvia routine" }));
    await user.click(screen.getByRole("button", { name: "Fatto" }));

    expect(onCreateAttempt).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Ho completato la routine" }),
    );

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Conflitto routine",
    );
    expect(
      screen.getByRole("heading", { name: "Ho completato la routine" }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Riprova" }));

    await waitFor(() => expect(onCreateAttempt).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole("group", {
        name: "Quanto ti è stata utile questa routine?",
      }),
    ).toBeTruthy();
  });

  it("does not open a return check-in without an authoritative pending attempt", async () => {
    const view = renderProposal({
      routine: activeRoutine,
      openCheckIn: true,
    });

    expect(
      screen.queryByRole("group", { name: "Esito del tentativo" }),
    ).toBeNull();

    view.rerender(
      <RoutineCard
        {...view.props}
        routine={activeRoutine}
        openCheckIn={false}
      />,
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("group", { name: "Esito del tentativo" }),
      ).toBeNull(),
    );

    view.rerender(
      <RoutineCard
        {...view.props}
        routine={activeRoutine}
        openCheckIn={false}
      />,
    );
    expect(
      screen.queryByRole("group", { name: "Esito del tentativo" }),
    ).toBeNull();
  });

  it("does not expose the legacy attempt marker as a substitute for starting", () => {
    renderProposal({ routine: activeRoutine });

    expect(
      screen.queryByRole("button", { name: "Segna un tentativo" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Avvia routine" })).toBeTruthy();
  });

  it("opens the structured check-in only for an authoritative pending attempt", () => {
    const pendingAttemptRoutine: RoutineCardData = {
      ...activeRoutine,
      latestAttempt: {
        id: "attempt-1",
        attemptedAt: "2026-08-08T09:00:00.000Z",
        outcome: null,
        outcomeNote: null,
        outcomeRecordedAt: null,
      },
    };
    renderProposal({
      routine: pendingAttemptRoutine,
      openCheckIn: true,
    });

    expect(
      screen.getByRole("group", { name: "Esito del tentativo" }),
    ).toBeTruthy();
  });

  it("distinguishes a pending attempt and prioritizes check-in and adaptation", () => {
    const pendingAttemptRoutine: RoutineCardData = {
      ...activeRoutine,
      latestAttempt: {
        id: "attempt-1",
        attemptedAt: "2026-08-08T09:00:00.000Z",
        outcome: null,
        outcomeNote: null,
        outcomeRecordedAt: null,
      },
    };

    renderProposal({ routine: pendingAttemptRoutine });

    expect(screen.getByText("Tentativo segnato")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Com'è andata?" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Adatta la routine" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Segna un tentativo" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Archivia routine" }),
    ).toBeNull();
  });

  it("distinguishes a recorded outcome and adapts without mutating the routine", async () => {
    const completedRoutine: RoutineCardData = {
      ...activeRoutine,
      latestAttempt: {
        id: "attempt-1",
        attemptedAt: "2026-08-08T09:00:00.000Z",
        outcome: "HELPFUL",
        outcomeNote: "Mi sono sentito presente",
        outcomeRecordedAt: "2026-08-08T09:05:00.000Z",
      },
    };
    const onAdapt = vi.fn();
    const onCreateAttempt = vi.fn();
    const onSaveOutcome = vi.fn();
    const user = userEvent.setup();

    renderProposal({
      routine: completedRoutine,
      onAdapt,
      onCreateAttempt,
      onSaveOutcome,
    });

    expect(screen.getByText("Esito registrato")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Com'è andata?" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Segna un tentativo" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Archivia routine" }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Adatta la routine" }));

    expect(onAdapt).toHaveBeenCalledOnce();
    expect(onCreateAttempt).not.toHaveBeenCalled();
    expect(onSaveOutcome).not.toHaveBeenCalled();
  });

  it.each([
    ["7 giorni", "2026-08-03T10:00:00.000Z", 7],
    ["14 giorni", "2026-07-31T10:00:00.000Z", 14],
  ])(
    "permits an explicit repeat and emits a content-free restart event within %s",
    async (_label, attemptedAt, temporalWindowDays) => {
      vi.spyOn(Date, "now").mockReturnValue(
        new Date("2026-08-10T10:00:00.000Z").getTime(),
      );
      const user = userEvent.setup();
      renderProposal({
        routine: {
          ...activeRoutine,
          latestAttempt: {
            id: "attempt-1",
            attemptedAt,
            outcome: "HELPFUL",
            outcomeNote: "Nota privata",
            outcomeRecordedAt: attemptedAt,
          },
        },
      });

      await user.click(screen.getByRole("button", { name: "Ripeti routine" }));

      expect(mocks.trackRoutineAnalytics).toHaveBeenCalledWith({
        event: "routine_restarted_within_14d",
        routineId: "routine-1",
        formatVersion: 1,
        widgetKind: "routine_card",
        temporalWindowDays,
        technicalState: "success",
      });
      expect(
        JSON.stringify(mocks.trackRoutineAnalytics.mock.calls),
      ).not.toMatch(/Nota privata|trigger|steps/i);
    },
  );

  it("does not emit a restart event outside the 14-day window", async () => {
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2026-08-20T10:00:00.000Z").getTime(),
    );
    const user = userEvent.setup();
    renderProposal({
      routine: {
        ...activeRoutine,
        latestAttempt: {
          id: "attempt-1",
          attemptedAt: "2026-08-01T10:00:00.000Z",
          outcome: "NOT_HELPFUL",
          outcomeNote: "Privata",
          outcomeRecordedAt: "2026-08-01T10:00:00.000Z",
        },
      },
    });

    await user.click(screen.getByRole("button", { name: "Ripeti routine" }));

    expect(mocks.trackRoutineAnalytics).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "routine_restarted_within_14d" }),
    );
  });

  it("closes a successful check-in but preserves the note and form after failure", async () => {
    const onSaveOutcome = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        ...activeRoutine,
        latestAttempt: {
          id: "attempt-1",
          attemptedAt: "2026-08-08T09:00:00.000Z",
          outcome: "PARTIALLY_HELPFUL",
          outcomeNote: "  Ho perso il ritmo  ",
          outcomeRecordedAt: "2026-08-08T09:05:00.000Z",
        },
      });
    const pendingAttemptRoutine: RoutineCardData = {
      ...activeRoutine,
      latestAttempt: {
        id: "attempt-1",
        attemptedAt: "2026-08-08T09:00:00.000Z",
        outcome: null,
        outcomeNote: null,
        outcomeRecordedAt: null,
      },
    };
    const user = userEvent.setup();
    renderProposal({ routine: pendingAttemptRoutine, onSaveOutcome });

    await user.click(screen.getByRole("button", { name: "Com'è andata?" }));
    await user.click(screen.getByRole("button", { name: "Aggiungi dettagli" }));
    const note = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Racconta com'è andata",
    });
    await user.type(note, "Ho perso il ritmo");
    await user.click(screen.getByRole("button", { name: "In parte" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(note.value).toBe("Ho perso il ritmo");
    expect(
      screen.getByRole("group", { name: "Esito del tentativo" }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "In parte" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("group", { name: "Esito del tentativo" }),
      ).toBeNull(),
    );
  });

  it("gives every routine action a mobile-sized target", () => {
    renderProposal({ routine: activeRoutine });

    for (const name of ["Avvia routine", "Archivia routine"]) {
      expect(screen.getByRole("button", { name }).className).toContain(
        "min-h-11",
      );
    }
  });
});
