// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoutineCardData } from "@/lib/coaching/routine";
import { RoutineClientError } from "@/lib/coaching/routine-client";
import { RoutineCard } from "./RoutineCard";

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
  proposal,
  archivedAt: null,
  latestAttempt: null,
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

afterEach(cleanup);

describe("RoutineCard proposal", () => {
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
  it("closes a consumed return check-in and does not reopen it on a later reveal", async () => {
    const view = renderProposal({
      routine: activeRoutine,
      openCheckIn: true,
    });

    expect(
      screen.getByRole("group", { name: "Esito del tentativo" }),
    ).toBeTruthy();

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

  it("marks one explicit attempt and exposes an accessible pending status", async () => {
    const pending = deferredRoutine();
    const onCreateAttempt = vi.fn().mockReturnValue(pending.promise);
    const user = userEvent.setup();
    renderProposal({ routine: activeRoutine, onCreateAttempt });
    const markAttempt = screen.getByRole<HTMLButtonElement>("button", {
      name: "Segna un tentativo",
    });

    await user.click(markAttempt);
    await user.click(markAttempt);

    expect(onCreateAttempt).toHaveBeenCalledOnce();
    expect(onCreateAttempt).toHaveBeenCalledWith("routine-1");
    expect(markAttempt.disabled).toBe(true);
    expect(screen.getByText("Registro il tentativo…")).toBeTruthy();

    pending.resolve(activeRoutine);
    expect(await screen.findByText("Tentativo segnato")).toBeTruthy();
  });

  it("opens the structured check-in and delegates archiving", async () => {
    const onArchive = vi.fn().mockResolvedValue({
      ...activeRoutine,
      status: "ARCHIVED",
      archivedAt: "2026-08-08T10:00:00.000Z",
    });
    const user = userEvent.setup();
    renderProposal({ routine: activeRoutine, onArchive });

    await user.click(screen.getByRole("button", { name: "Com'è andata?" }));
    expect(
      screen.getByRole("group", { name: "Esito del tentativo" }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Archivia routine" }));
    expect(onArchive).toHaveBeenCalledWith("routine-1");
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

  it("closes a successful check-in but preserves the note and form after failure", async () => {
    const onCreateAttempt = vi
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
    const user = userEvent.setup();
    renderProposal({ routine: activeRoutine, onCreateAttempt });

    await user.click(screen.getByRole("button", { name: "Com'è andata?" }));
    const note = screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Nota facoltativa",
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

    for (const name of [
      "Segna un tentativo",
      "Com'è andata?",
      "Archivia routine",
    ]) {
      expect(screen.getByRole("button", { name }).className).toContain(
        "min-h-11",
      );
    }
  });
});
