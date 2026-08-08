// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  createRoutineAttempt: vi.fn(),
  saveRoutineOutcome: vi.fn(),
  searchParams: new URLSearchParams(),
  context: {
    chats: [] as Chat[],
    coachingGoal: null as string | null,
    isGuest: false,
    activeRoutine: null as RoutineCardData | null,
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
  createRoutineAttempt: mocks.createRoutineAttempt,
  saveRoutineOutcome: mocks.saveRoutineOutcome,
}));
vi.mock("./layout-client", () => ({
  useChatContext: () => ({
    ...mocks.context,
    createChat: mocks.createChat,
    navigateToChat: mocks.navigateToChat,
    openRoutineCheckIn: mocks.openRoutineCheckIn,
    updateActiveRoutine: mocks.updateActiveRoutine,
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
    mocks.createRoutineAttempt.mockResolvedValue(activeRoutine);
    mocks.saveRoutineOutcome.mockResolvedValue(activeRoutine);
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
    expect(mocks.updateActiveRoutine).toHaveBeenCalledWith(updatedRoutine);
    expect(mocks.createChat).not.toHaveBeenCalled();
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
