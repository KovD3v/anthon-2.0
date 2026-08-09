// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutineCardData } from "@/lib/coaching/routine";
import { RoutineCollectionPage } from "./RoutineCollectionPage";

const mocks = vi.hoisted(() => ({
  useChatContext: vi.fn(),
  createRoutineChat: vi.fn(),
  createRoutineAttempt: vi.fn(),
  saveRoutineOutcome: vi.fn(),
  archiveRoutine: vi.fn(),
  fetchRoutineAttempts: vi.fn(),
}));

vi.mock("../chat/layout-client", () => ({
  useChatContext: mocks.useChatContext,
}));
vi.mock("@/lib/coaching/routine-client", () => ({
  archiveRoutine: mocks.archiveRoutine,
  createRoutineAttempt: mocks.createRoutineAttempt,
  fetchRoutineAttempts: mocks.fetchRoutineAttempts,
  RoutineClientError: class RoutineClientError extends Error {
    status: number | null;

    constructor(message: string, status: number | null) {
      super(message);
      this.status = status;
    }
  },
  saveRoutineOutcome: mocks.saveRoutineOutcome,
}));

afterEach(cleanup);

const v1Proposal = {
  title: "Reset rapido",
  trigger: "Dopo un errore",
  durationLabel: "60 secondi",
  steps: ["Fermati", "Espira"],
  completionCue: "Riparti",
};

function routine(
  id: string,
  status: "ACTIVE" | "ARCHIVED" = "ACTIVE",
): RoutineCardData {
  return {
    id,
    sourceChatId: status === "ACTIVE" ? "chat-source" : null,
    sourceAssistantMessageId: status === "ACTIVE" ? "message-source" : null,
    status,
    formatVersion: 1,
    proposal: {
      ...v1Proposal,
      title: status === "ACTIVE" ? "Reset rapido" : "Routine archiviata",
    },
    archivedAt: status === "ARCHIVED" ? "2026-08-08T10:00:00.000Z" : null,
    latestAttempt: null,
  };
}

function setContext(overrides: Record<string, unknown> = {}) {
  mocks.useChatContext.mockReturnValue({
    isGuest: false,
    routineCollection: {
      routines: [routine("active-1"), routine("archived-1", "ARCHIVED")],
      active: { total: 1, nextCursor: null },
      archived: { total: 1, nextCursor: null },
    },
    routineCollectionError: null,
    isRoutineCollectionLoading: false,
    routineCollectionLoadingMoreStatus: null,
    refreshRoutineCollection: vi.fn(),
    loadMoreRoutineCollection: vi.fn(),
    createRoutineChat: mocks.createRoutineChat,
    ...overrides,
  });
}

beforeEach(() => {
  setContext();
  mocks.createRoutineChat.mockReset().mockResolvedValue("new-chat");
  mocks.createRoutineAttempt.mockReset();
  mocks.saveRoutineOutcome.mockReset();
  mocks.archiveRoutine.mockReset();
  mocks.fetchRoutineAttempts.mockReset().mockResolvedValue({
    attempts: [],
    nextCursor: null,
  });
});

describe("RoutineCollectionPage", () => {
  it("shows the collection entry point and a responsive routine card", () => {
    render(<RoutineCollectionPage />);

    expect(
      screen.getByRole("heading", { name: "Le tue routine" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Torna alla chat" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Reset rapido" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ripeti" })).toBeTruthy();
    expect(screen.getByText("1 attiva")).toBeTruthy();
    expect(screen.getByTestId("routine-card-active-1").className).toContain(
      "bg-card/80",
    );
  });

  it("filters archived routines and keeps modification in a new chat", async () => {
    const user = userEvent.setup();
    render(<RoutineCollectionPage />);

    await user.click(screen.getByRole("button", { name: /Archiviate/ }));

    expect(
      screen.getByRole("heading", { name: "Routine archiviata" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ripeti" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Modifica" }));
    expect(mocks.createRoutineChat).toHaveBeenCalledWith(
      expect.objectContaining({ id: "archived-1" }),
      "adapt",
    );
  });

  it("creates a repeat chat and starts a check-in without opening the source chat", async () => {
    const pendingRoutine = {
      ...routine("active-1"),
      latestAttempt: {
        id: "attempt-1",
        attemptedAt: "2026-08-09T10:00:00.000Z",
        outcome: null,
        outcomeNote: null,
        outcomeRecordedAt: null,
      },
    } satisfies RoutineCardData;
    mocks.createRoutineAttempt.mockResolvedValue(pendingRoutine);
    const refreshRoutineCollection = vi.fn().mockResolvedValue(undefined);
    setContext({
      routineCollection: {
        routines: [routine("active-1")],
        active: { total: 1, nextCursor: null },
        archived: { total: 0, nextCursor: null },
      },
      refreshRoutineCollection,
    });
    const user = userEvent.setup();
    render(<RoutineCollectionPage />);

    await user.click(screen.getByRole("button", { name: "Ripeti" }));
    expect(mocks.createRoutineChat).toHaveBeenCalledWith(
      expect.objectContaining({ id: "active-1" }),
      "repeat",
    );

    await user.click(screen.getByRole("button", { name: "Com'è andata?" }));
    expect(mocks.createRoutineAttempt).toHaveBeenCalledWith(
      "active-1",
      expect.stringContaining("active-1:collection:"),
    );
    expect(refreshRoutineCollection).toHaveBeenCalled();
    expect(
      screen.getByRole("textbox", { name: "Nota facoltativa" }),
    ).toBeTruthy();
  });

  it("requires confirmation before archiving an active routine", async () => {
    mocks.archiveRoutine.mockResolvedValue({
      ...routine("active-1"),
      status: "ARCHIVED",
      archivedAt: "2026-08-09T11:00:00.000Z",
    });
    const refreshRoutineCollection = vi.fn().mockResolvedValue(undefined);
    setContext({ refreshRoutineCollection });
    const user = userEvent.setup();
    render(<RoutineCollectionPage />);

    await user.click(screen.getByRole("button", { name: "Archivia" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Archivia routine" }));

    expect(mocks.archiveRoutine).toHaveBeenCalledWith("active-1");
    expect(refreshRoutineCollection).toHaveBeenCalled();
  });

  it("handles loading, errors, and a paginated segment", async () => {
    const user = userEvent.setup();
    const loadMoreRoutineCollection = vi.fn();
    setContext({
      routineCollection: {
        routines: [routine("active-1")],
        active: { total: 13, nextCursor: "active-next" },
        archived: { total: 0, nextCursor: null },
      },
      isRoutineCollectionLoading: true,
      routineCollectionError: "failed",
      loadMoreRoutineCollection,
    });
    render(<RoutineCollectionPage />);

    expect(screen.getByText("Aggiornamento routine in corso…")).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    const loadMore = screen.getByRole("button", {
      name: "Carica altre routine",
    });
    await user.click(loadMore);
    expect(loadMoreRoutineCollection).toHaveBeenCalledWith("ACTIVE");
  });

  it("asks guests to register before showing private routines", () => {
    setContext({ isGuest: true });
    render(<RoutineCollectionPage />);

    expect(
      screen.getByText("Registrati per salvare e ritrovare le tue routine."),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Registrati" }).getAttribute("href"),
    ).toBe("/sign-up?redirect_url=%2Fchat%2Froutines");
    expect(screen.queryByRole("heading", { name: "Reset rapido" })).toBeNull();
  });
});
