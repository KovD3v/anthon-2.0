// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutineCardData } from "@/lib/coaching/routine";
import { RoutineCollectionPage } from "./RoutineCollectionPage";

const mocks = vi.hoisted(() => ({
  useChatContext: vi.fn(),
  getRoutineCheckInHref: (routine: { id: string }) =>
    `/chat?checkInRoutineId=${routine.id}`,
}));

vi.mock("../chat/layout-client", () => ({
  useChatContext: mocks.useChatContext,
  getRoutineCheckInHref: mocks.getRoutineCheckInHref,
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
    navigateToRoutine: vi.fn(),
    ...overrides,
  });
}

beforeEach(() => {
  setContext();
});

describe("RoutineCollectionPage", () => {
  it("shows the collection entry point and a responsive routine card", () => {
    render(<RoutineCollectionPage />);

    expect(
      screen.getByRole("heading", { name: "Le tue routine" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Torna alla chat" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Reset rapido/ })).toBeTruthy();
    expect(screen.getByText("1 attiva")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Reset rapido/ }).className,
    ).toContain("md:grid");
  });

  it("filters archived routines and navigates through the context owner-safe action", async () => {
    const user = userEvent.setup();
    const navigateToRoutine = vi.fn();
    setContext({ navigateToRoutine });
    render(<RoutineCollectionPage />);

    await user.click(screen.getByRole("button", { name: /Archiviate/ }));

    const archivedLink = screen.getByRole("link", {
      name: /Routine archiviata/,
    });
    expect(archivedLink).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Reset rapido/ })).toBeNull();
    await user.click(archivedLink);
    expect(navigateToRoutine).toHaveBeenCalledWith(
      expect.objectContaining({ id: "archived-1" }),
    );
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
    expect(screen.queryByRole("link", { name: /Reset rapido/ })).toBeNull();
  });
});
