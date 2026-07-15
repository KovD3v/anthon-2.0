// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatData } from "@/types/chat";
import { ChatConversationClient } from "./chat-conversation-client";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  sendMessage: vi.fn(),
  setMessages: vi.fn(),
  toast: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  updateCachedChat: vi.fn(),
}));

vi.mock("@ai-sdk/react", () => ({
  useChat: (options: {
    messages: Array<{ id: string; role: string; parts: unknown[] }>;
  }) => ({
    messages: options.messages,
    sendMessage: mocks.sendMessage,
    status: "ready",
    error: null,
    setMessages: mocks.setMessages,
    stop: vi.fn(),
  }),
}));

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ billing: {} }),
}));

vi.mock("ai", () => ({
  DefaultChatTransport: class DefaultChatTransport {},
}));

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(mocks.toast, {
    error: mocks.toastError,
    info: vi.fn(),
    success: mocks.toastSuccess,
  }),
}));

vi.mock("@/hooks/use-confirm", () => ({
  useConfirm: () => ({
    confirm: mocks.confirm,
    isOpen: false,
    options: {
      title: "",
      description: "",
      confirmText: "",
      cancelText: "",
      variant: "default",
    },
    handleConfirm: vi.fn(),
    setIsOpen: vi.fn(),
  }),
}));

vi.mock("@/lib/chat-client", () => ({
  convertToUIMessages: (messages: ChatData["messages"]) =>
    messages.map((message) => ({
      id: message.id,
      role: message.role,
      parts: [{ type: "text", text: message.content ?? "" }],
    })),
  extractTextFromParts: (parts: Array<{ type: string; text?: string }>) =>
    parts.find((part) => part.type === "text")?.text ?? "",
  hasPendingVoiceGeneration: () => false,
}));

vi.mock("@/lib/rate-limit/paywall", () => ({
  getPaywallCardContent: () => null,
}));

vi.mock("../../../(chat)/components/ChatHeader", () => ({
  ChatHeader: () => null,
}));

vi.mock("../../../(chat)/components/ChatInput", () => ({
  ChatInput: () => null,
}));

vi.mock("../../../(chat)/components/SuggestedActions", () => ({
  SuggestedActions: () => null,
}));

vi.mock("../../../(chat)/components/MessageList", () => ({
  EmptyChatWelcome: () => <div>Chat vuota</div>,
  MessageList: ({
    messages,
    editingMessageId,
    deletingMessageId,
    isLoadingMore,
    onLoadMore,
    onEditStart,
    onEditSave,
    onDelete,
    onRegenerate,
  }: ComponentProps<"div"> & {
    messages: Array<{ id: string; parts: Array<{ text?: string }> }>;
    editingMessageId: string | null;
    deletingMessageId: string | null;
    isLoadingMore: boolean;
    onLoadMore: () => void;
    onEditStart: (id: string, text: string) => void;
    onEditSave: () => void;
    onDelete: (id: string) => void;
    onRegenerate: () => void;
  }) => (
    <div>
      <ol aria-label="Messaggi">
        {messages.map((message) => (
          <li key={message.id}>{message.parts[0]?.text}</li>
        ))}
      </ol>
      <button type="button" disabled={isLoadingMore} onClick={onLoadMore}>
        {isLoadingMore ? "Caricamento" : "Carica precedenti"}
      </button>
      <button
        type="button"
        onClick={() => onEditStart("user-new", "Domanda nuova")}
      >
        Modifica
      </button>
      {editingMessageId && (
        <button type="button" onClick={onEditSave}>
          Salva modifica
        </button>
      )}
      <button type="button" onClick={() => onDelete("user-new")}>
        {deletingMessageId ? "Eliminazione" : "Elimina"}
      </button>
      <button type="button" onClick={onRegenerate}>
        Rigenera
      </button>
    </div>
  ),
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));

vi.mock("../chat-input-warmup", () => ({
  createChatInputWarmup: () => ({ schedule: vi.fn(), dispose: vi.fn() }),
}));

vi.mock("../layout-client", () => ({
  useChatContext: () => ({
    renameChat: vi.fn(),
    isGuest: true,
    getCachedChat: () => null,
    updateCachedChat: mocks.updateCachedChat,
    consumePendingInitialMessage: () => null,
  }),
}));

const initialChatData: ChatData = {
  id: "chat-1",
  title: "Test",
  visibility: "PRIVATE",
  isOwner: true,
  messages: [
    {
      id: "user-new",
      role: "user",
      content: "Domanda nuova",
      parts: [],
      createdAt: "2026-07-15T12:00:00.000Z",
    },
    {
      id: "assistant-new",
      role: "assistant",
      content: "Risposta nuova",
      parts: [],
      createdAt: "2026-07-15T12:00:01.000Z",
    },
  ],
  pagination: { hasMore: true, nextCursor: "cursor-1" },
};

function renderConversation(data: ChatData = initialChatData) {
  return render(
    <ChatConversationClient chatId="chat-1" initialChatData={data} />,
  );
}

function messageOrder() {
  return screen.getAllByRole("listitem").map((item) => item.textContent);
}

function deferredResponse() {
  let resolve: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.confirm.mockResolvedValue(true);
  mocks.sendMessage.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("ChatConversationClient pagination and recovery", () => {
  it("prepends an older page without disturbing current message order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            messages: [
              {
                id: "user-old",
                role: "user",
                content: "Domanda vecchia",
                parts: [],
                createdAt: "2026-07-15T11:00:00.000Z",
              },
              {
                id: "assistant-old",
                role: "assistant",
                content: "Risposta vecchia",
                parts: [],
                createdAt: "2026-07-15T11:00:01.000Z",
              },
            ],
            pagination: { hasMore: false, nextCursor: null },
          }),
          { status: 200 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderConversation();

    await user.click(screen.getByRole("button", { name: "Carica precedenti" }));

    await waitFor(() =>
      expect(messageOrder()).toEqual([
        "Domanda vecchia",
        "Risposta vecchia",
        "Domanda nuova",
        "Risposta nuova",
      ]),
    );
  });

  it("allows only one pagination request while a page is loading", async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    renderConversation();
    const loadButton = screen.getByRole("button", {
      name: "Carica precedenti",
    });

    fireEvent.click(loadButton);
    fireEvent.click(loadButton);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Caricamento" })
        .disabled,
    ).toBe(true);
    await act(async () => {
      pending.resolve(
        new Response(
          JSON.stringify({
            messages: [],
            pagination: { hasMore: false, nextCursor: null },
          }),
          { status: 200 },
        ),
      );
      await pending.promise;
    });
  });

  it("preserves messages, clears loading, and toasts when pagination rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const user = userEvent.setup();
    renderConversation();

    await user.click(screen.getByRole("button", { name: "Carica precedenti" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce());
    expect(messageOrder()).toEqual(["Domanda nuova", "Risposta nuova"]);
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Carica precedenti",
      }).disabled,
    ).toBe(false);
  });

  it("keeps refreshed messages intact and permits an edit retry after failures", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("patch offline"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockRejectedValueOnce(new Error("refresh offline"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderConversation();

    await user.click(screen.getByRole("button", { name: "Modifica" }));
    await user.click(screen.getByRole("button", { name: "Salva modifica" }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "Salva modifica" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(messageOrder()).toEqual(["Domanda nuova", "Risposta nuova"]);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("releases delete and regenerate interactions after rejected requests", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderConversation();

    await user.click(screen.getByRole("button", { name: "Elimina" }));
    const firstDeleteOptions = mocks.toast.mock.calls[0]?.[1] as {
      onAutoClose: () => Promise<void>;
    };
    await act(() => firstDeleteOptions.onAutoClose());
    expect(screen.getByRole("button", { name: "Elimina" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Elimina" }));

    await user.click(screen.getByRole("button", { name: "Rigenera" }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Rigenera" }));

    expect(mocks.confirm).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
