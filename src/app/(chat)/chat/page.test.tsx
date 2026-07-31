// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Chat } from "@/types/chat";
import ChatPage from "./page";

const mocks = vi.hoisted(() => ({
  createChat: vi.fn(),
  navigateToChat: vi.fn(),
  context: {
    chats: [] as Chat[],
    coachingGoal: null as string | null,
    isGuest: false,
  },
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: { firstName: "Luca" } }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("./layout-client", () => ({
  useChatContext: () => ({
    ...mocks.context,
    createChat: mocks.createChat,
    navigateToChat: mocks.navigateToChat,
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

describe("chat landing page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context.chats = [];
    mocks.context.coachingGoal = null;
    mocks.context.isGuest = false;
  });

  afterEach(cleanup);

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
});
