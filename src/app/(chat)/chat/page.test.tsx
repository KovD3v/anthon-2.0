// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutineCardData } from "@/lib/coaching/routine";
import type { Chat } from "@/types/chat";
import ChatPage from "./page";

const mocks = vi.hoisted(() => ({
  createChat: vi.fn(),
  navigateToChat: vi.fn(),
  openRoutineCheckIn: vi.fn(),
  updateActiveRoutine: vi.fn(),
  refreshActiveRoutine: vi.fn(),
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  archiveRoutine: vi.fn(),
  RoutineClientError: class RoutineClientError extends Error {},
  createRoutineAttempt: vi.fn(),
  saveRoutineOutcome: vi.fn(),
  searchParams: new URLSearchParams(),
  context: {
    chats: [] as Chat[],
    coachingGoal: null as string | null,
    isGuest: false,
    activeRoutine: null as RoutineCardData | null,
    chatNavigationEpoch: 0,
  },
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: { firstName: "Luca" } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.routerPush,
    replace: mocks.routerReplace,
  }),
  useSearchParams: () => mocks.searchParams,
}));
vi.mock("@/lib/coaching/routine-client", () => ({
  archiveRoutine: mocks.archiveRoutine,
  createRoutineAttempt: mocks.createRoutineAttempt,
  RoutineClientError: mocks.RoutineClientError,
  saveRoutineOutcome: mocks.saveRoutineOutcome,
}));
vi.mock("./layout-client", () => ({
  useChatContext: () => ({
    ...mocks.context,
    createChat: mocks.createChat,
    navigateToChat: mocks.navigateToChat,
    openRoutineCheckIn: mocks.openRoutineCheckIn,
    updateActiveRoutine: mocks.updateActiveRoutine,
    refreshActiveRoutine: mocks.refreshActiveRoutine,
  }),
}));

const chat = (id: string, title: string, updatedAt: string): Chat => ({
  id,
  title,
  updatedAt,
  createdAt: updatedAt,
  visibility: "PRIVATE",
  messageCount: 2,
});

const activeRoutine: RoutineCardData = {
  id: "routine-1",
  sourceChatId: "chat-1",
  sourceAssistantMessageId: "assistant-1",
  status: "ACTIVE",
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

describe("chat landing page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context.chats = [];
    mocks.context.coachingGoal = null;
    mocks.context.isGuest = false;
    mocks.context.activeRoutine = null;
    mocks.searchParams = new URLSearchParams();
    mocks.context.chatNavigationEpoch = 0;
    mocks.archiveRoutine.mockResolvedValue({
      ...activeRoutine,
      status: "ARCHIVED",
      archivedAt: "2026-08-08T11:00:00.000Z",
    });
    mocks.createRoutineAttempt.mockResolvedValue(activeRoutine);
    mocks.saveRoutineOutcome.mockResolvedValue(activeRoutine);
    mocks.refreshActiveRoutine.mockResolvedValue(activeRoutine);
  });

  afterEach(cleanup);

  it("builds only known internal routes for source and orphan check-ins", async () => {
    const { getRoutineCheckInHref } =
      await vi.importActual<typeof import("./layout-client")>(
        "./layout-client",
      );

    expect(getRoutineCheckInHref(activeRoutine)).toBe(
      "/chat/chat-1?checkInRoutineId=routine-1",
    );
    expect(
      getRoutineCheckInHref({
        ...activeRoutine,
        sourceAssistantMessageId: null,
      }),
    ).toBe("/chat?checkInRoutineId=routine-1");
    expect(
      getRoutineCheckInHref({
        ...activeRoutine,
        id: "routine?next=javascript:alert(1)",
        sourceChatId: "../outside",
      }),
    ).toBe(
      "/chat/..%2Foutside?checkInRoutineId=routine%3Fnext%3Djavascript%3Aalert%281%29",
    );
  });

  it("keeps starter situations for a new authenticated user", () => {
    render(<ChatPage />);
    expect(screen.getByText("Ho una gara domani")).toBeTruthy();
    expect(screen.queryByText("Riprendi il percorso")).toBeNull();
  });

  it("keeps the guest launcher even when guest chats exist", () => {
    mocks.context.isGuest = true;
    mocks.context.chats = [
      chat("guest-chat", "Guest chat", "2026-07-31T08:00:00.000Z"),
    ];
    render(<ChatPage />);
    expect(screen.queryByText("Riprendi il percorso")).toBeNull();
    expect(screen.getByText("Ho una gara domani")).toBeTruthy();
  });

  it("does not expose or mutate an orphan routine for a guest", async () => {
    mocks.context.isGuest = true;
    mocks.context.activeRoutine = {
      ...activeRoutine,
      sourceChatId: null,
      sourceAssistantMessageId: null,
    };
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-1");

    render(<ChatPage />);

    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith("/chat"),
    );
    expect(
      screen.queryByRole("group", { name: "Esito del tentativo" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Archivia routine" }),
    ).toBeNull();
    expect(screen.queryByText("Riprendi il percorso")).toBeNull();
    expect(mocks.archiveRoutine).not.toHaveBeenCalled();
  });

  it("selects the newest returning chat regardless of input order", () => {
    mocks.context.chats = [
      chat("older", "Conversazione vecchia", "2026-07-20T08:00:00.000Z"),
      chat("newer", "Preparazione finale", "2026-07-31T08:00:00.000Z"),
    ];
    mocks.context.coachingGoal = "Restare lucido sotto pressione";
    render(<ChatPage />);

    expect(screen.getByText("Preparazione finale")).toBeTruthy();
    expect(
      screen.getByText("Il tuo obiettivo: Restare lucido sotto pressione"),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Riprendi" }));
    expect(mocks.navigateToChat).toHaveBeenCalledWith("newer");
  });

  it("starts one neutral check-in without copying sensitive metadata", () => {
    mocks.context.chats = [
      chat("chat-1", "Titolo privato", "2026-07-31T08:00:00.000Z"),
    ];
    mocks.context.coachingGoal = "Obiettivo privato";
    render(<ChatPage />);

    fireEvent.click(screen.getByRole("button", { name: "Com'è andata?" }));
    expect(mocks.createChat).toHaveBeenCalledOnce();
    const options = mocks.createChat.mock.calls[0]?.[0];
    expect(options).toEqual({
      title: "Check-in sul percorso",
      initialMessage:
        "Vorrei fare un check-in sul mio percorso dall'ultima conversazione. Fammi una domanda alla volta per capire cosa è successo, cosa ha funzionato e dove mi sono bloccato.",
    });
    expect(options.initialMessage).not.toContain("Titolo privato");
    expect(options.initialMessage).not.toContain("Obiettivo privato");
  });

  it("routes a returning check-in to its source routine instead of creating a chat", () => {
    mocks.context.chats = [
      chat("chat-1", "Preparazione finale", "2026-07-31T08:00:00.000Z"),
    ];
    mocks.context.activeRoutine = activeRoutine;
    render(<ChatPage />);

    fireEvent.click(screen.getByRole("button", { name: "Com'è andata?" }));

    expect(mocks.openRoutineCheckIn).toHaveBeenCalledWith(activeRoutine);
    expect(mocks.createChat).not.toHaveBeenCalled();
  });

  it("opens an orphan routine check-in on the landing without creating a chat", async () => {
    const orphanRoutine = {
      ...activeRoutine,
      sourceChatId: null,
      sourceAssistantMessageId: null,
    };
    const updatedRoutine = {
      ...orphanRoutine,
      latestAttempt: {
        id: "attempt-1",
        attemptedAt: "2026-08-08T09:00:00.000Z",
        outcome: "HELPFUL" as const,
        outcomeNote: null,
        outcomeRecordedAt: "2026-08-08T09:01:00.000Z",
      },
    };
    mocks.context.activeRoutine = orphanRoutine;
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-1");
    mocks.createRoutineAttempt.mockResolvedValue(updatedRoutine);
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000001",
    );
    const user = userEvent.setup();

    render(<ChatPage />);

    expect(
      await screen.findAllByRole("heading", { name: "Reset dopo un errore" }),
    ).not.toHaveLength(0);
    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith("/chat"),
    );
    await user.click(screen.getByRole("button", { name: "Mi ha aiutato" }));

    expect(mocks.createRoutineAttempt).toHaveBeenCalledWith(
      "routine-1",
      "00000000-0000-4000-8000-000000000001",
      "HELPFUL",
      null,
    );
    expect(mocks.refreshActiveRoutine).toHaveBeenCalledOnce();
    expect(mocks.updateActiveRoutine).not.toHaveBeenCalled();
    expect(mocks.createChat).not.toHaveBeenCalled();
  });

  it("archives an orphan routine after accessible confirmation and clears its return", async () => {
    const orphanRoutine: RoutineCardData = {
      ...activeRoutine,
      sourceChatId: null,
      sourceAssistantMessageId: null,
    };
    const archivedRoutine: RoutineCardData = {
      ...orphanRoutine,
      status: "ARCHIVED",
      archivedAt: "2026-08-08T11:00:00.000Z",
    };
    mocks.context.activeRoutine = orphanRoutine;
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-1");
    mocks.archiveRoutine.mockResolvedValue(archivedRoutine);
    mocks.refreshActiveRoutine.mockResolvedValue(null);
    mocks.updateActiveRoutine.mockImplementationOnce((routine) => {
      if (
        routine.status !== "ACTIVE" &&
        mocks.context.activeRoutine?.id === routine.id
      ) {
        mocks.context.activeRoutine = null;
      }
    });
    const user = userEvent.setup();

    render(<ChatPage />);

    await screen.findByRole("group", { name: "Esito del tentativo" });
    await user.click(screen.getByRole("button", { name: "Archivia routine" }));

    const dialog = screen.getByRole("alertdialog", {
      name: "Archiviare la routine?",
    });
    expect(mocks.archiveRoutine).not.toHaveBeenCalled();
    mocks.routerReplace.mockClear();
    await user.click(within(dialog).getByRole("button", { name: "Archivia" }));

    await waitFor(() =>
      expect(mocks.archiveRoutine).toHaveBeenCalledWith("routine-1"),
    );
    expect(mocks.updateActiveRoutine).toHaveBeenCalledWith(archivedRoutine);
    expect(mocks.refreshActiveRoutine).toHaveBeenCalledOnce();
    expect(mocks.routerReplace).toHaveBeenCalledWith("/chat");
    await waitFor(() =>
      expect(
        screen.queryByRole("group", { name: "Esito del tentativo" }),
      ).toBeNull(),
    );
    expect(
      screen.queryByRole("button", { name: "Archivia routine" }),
    ).toBeNull();
    expect(screen.queryByText("Riprendi il percorso")).toBeNull();
    expect(mocks.createChat).not.toHaveBeenCalled();
  });

  it("keeps a successful archive complete when the selector refresh fails", async () => {
    const orphanRoutine: RoutineCardData = {
      ...activeRoutine,
      sourceChatId: null,
      sourceAssistantMessageId: null,
    };
    const archivedRoutine: RoutineCardData = {
      ...orphanRoutine,
      status: "ARCHIVED",
      archivedAt: "2026-08-08T11:00:00.000Z",
    };
    mocks.context.activeRoutine = orphanRoutine;
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-1");
    mocks.archiveRoutine.mockResolvedValue(archivedRoutine);
    mocks.refreshActiveRoutine.mockRejectedValue(new Error("offline"));
    mocks.updateActiveRoutine.mockImplementationOnce((routine) => {
      if (
        routine.status !== "ACTIVE" &&
        mocks.context.activeRoutine?.id === routine.id
      ) {
        mocks.context.activeRoutine = null;
      }
    });
    const user = userEvent.setup();

    render(<ChatPage />);

    await screen.findByRole("group", { name: "Esito del tentativo" });
    await user.click(screen.getByRole("button", { name: "Archivia routine" }));
    const dialog = screen.getByRole("alertdialog", {
      name: "Archiviare la routine?",
    });
    mocks.routerReplace.mockClear();
    await user.click(within(dialog).getByRole("button", { name: "Archivia" }));

    await waitFor(() =>
      expect(mocks.archiveRoutine).toHaveBeenCalledWith("routine-1"),
    );
    expect(mocks.updateActiveRoutine).toHaveBeenCalledWith(archivedRoutine);
    expect(mocks.refreshActiveRoutine).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith("/chat"),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Archivia routine" }),
    ).toBeNull();
    expect(screen.queryByText("Riprendi il percorso")).toBeNull();
  });

  it("keeps an orphan routine retryable when the archive request fails", async () => {
    mocks.context.activeRoutine = {
      ...activeRoutine,
      sourceChatId: null,
      sourceAssistantMessageId: null,
    };
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-1");
    mocks.archiveRoutine.mockRejectedValue(
      new mocks.RoutineClientError("Archivio non disponibile"),
    );
    const user = userEvent.setup();

    render(<ChatPage />);

    await screen.findByRole("group", { name: "Esito del tentativo" });
    await user.click(screen.getByRole("button", { name: "Archivia routine" }));
    const dialog = screen.getByRole("alertdialog", {
      name: "Archiviare la routine?",
    });
    mocks.routerReplace.mockClear();
    await user.click(within(dialog).getByRole("button", { name: "Archivia" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Archivio non disponibile",
    );
    expect(mocks.updateActiveRoutine).not.toHaveBeenCalled();
    expect(mocks.refreshActiveRoutine).not.toHaveBeenCalled();
    expect(mocks.routerReplace).not.toHaveBeenCalled();
    expect(
      screen.getByRole("group", { name: "Esito del tentativo" }),
    ).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Archivia routine",
      }).disabled,
    ).toBe(false);
  });

  it("keeps an orphan routine open when archive confirmation is cancelled", async () => {
    mocks.context.activeRoutine = {
      ...activeRoutine,
      sourceChatId: null,
      sourceAssistantMessageId: null,
    };
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-1");
    const user = userEvent.setup();

    render(<ChatPage />);

    await screen.findByRole("group", { name: "Esito del tentativo" });
    await user.click(screen.getByRole("button", { name: "Archivia routine" }));
    const dialog = screen.getByRole("alertdialog", {
      name: "Archiviare la routine?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Annulla" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("alertdialog", {
          name: "Archiviare la routine?",
        }),
      ).toBeNull(),
    );
    expect(mocks.archiveRoutine).not.toHaveBeenCalled();
    expect(mocks.updateActiveRoutine).not.toHaveBeenCalled();
    expect(mocks.refreshActiveRoutine).not.toHaveBeenCalled();
    expect(
      screen.getByRole("group", { name: "Esito del tentativo" }),
    ).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Archivia routine",
      }).disabled,
    ).toBe(false);
  });

  it("uses the landing form when a source return falls back after hydration failure", async () => {
    mocks.context.activeRoutine = activeRoutine;
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-1");

    render(<ChatPage />);

    expect(
      await screen.findByRole("group", { name: "Esito del tentativo" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith("/chat"),
    );
    expect(mocks.openRoutineCheckIn).not.toHaveBeenCalled();
    expect(mocks.createChat).not.toHaveBeenCalled();
  });

  it("does not restore a consumed orphan check-in after navigating away and back", async () => {
    mocks.context.activeRoutine = {
      ...activeRoutine,
      sourceChatId: null,
      sourceAssistantMessageId: null,
    };
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-1");
    const view = render(<ChatPage />);

    await screen.findByRole("group", { name: "Esito del tentativo" });
    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith("/chat"),
    );

    mocks.searchParams = new URLSearchParams();
    view.rerender(<ChatPage />);
    expect(
      screen.getByRole("group", { name: "Esito del tentativo" }),
    ).toBeTruthy();

    mocks.context.chatNavigationEpoch += 1;
    view.rerender(<ChatPage />);

    await waitFor(() =>
      expect(
        screen.queryByRole("group", { name: "Esito del tentativo" }),
      ).toBeNull(),
    );
    expect(mocks.routerReplace).toHaveBeenCalledOnce();
  });

  it("clears a stale routine query and leaves the starter choices available", async () => {
    mocks.context.activeRoutine = {
      ...activeRoutine,
      sourceChatId: null,
      sourceAssistantMessageId: null,
    };
    mocks.searchParams = new URLSearchParams("checkInRoutineId=stale-routine");

    render(<ChatPage />);

    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith("/chat"),
    );
    expect(screen.queryByText("Esito del tentativo")).toBeNull();
    expect(screen.getByText("Ho una gara domani")).toBeTruthy();
    expect(mocks.createChat).not.toHaveBeenCalled();
  });

  it("clears an archived orphan query without opening its check-in", async () => {
    mocks.context.activeRoutine = {
      ...activeRoutine,
      sourceChatId: null,
      sourceAssistantMessageId: null,
      status: "ARCHIVED",
      archivedAt: "2026-08-08T11:00:00.000Z",
    };
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-1");

    render(<ChatPage />);

    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith("/chat"),
    );
    expect(
      screen.queryByRole("group", { name: "Esito del tentativo" }),
    ).toBeNull();
    expect(mocks.openRoutineCheckIn).not.toHaveBeenCalled();
    expect(mocks.createChat).not.toHaveBeenCalled();
  });

  it("never starts a prefilled chat while handling a routine check-in", async () => {
    mocks.context.activeRoutine = {
      ...activeRoutine,
      sourceChatId: null,
      sourceAssistantMessageId: null,
    };
    mocks.searchParams = new URLSearchParams(
      "checkInRoutineId=routine-1&q=contenuto+non+attendibile",
    );

    render(<ChatPage />);

    await screen.findByText("Esito del tentativo");
    expect(mocks.createChat).not.toHaveBeenCalled();
  });
});
