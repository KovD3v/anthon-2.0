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
  captureChatOptions: vi.fn(),
  captureException: vi.fn(),
  chatState: {
    error: null as Error | null,
    status: "ready" as "ready" | "error",
  },
  clearError: vi.fn(),
}));

vi.mock("@ai-sdk/react", () => ({
  useChat: (options: {
    messages: Array<{ id: string; role: string; parts: unknown[] }>;
    onError?: (error: Error) => void;
    onFinish?: () => Promise<void>;
  }) => {
    mocks.captureChatOptions(options);
    return {
      messages: options.messages,
      sendMessage: mocks.sendMessage,
      status: mocks.chatState.status,
      error: mocks.chatState.error,
      setMessages: mocks.setMessages,
      stop: vi.fn(),
      clearError: mocks.clearError,
    };
  },
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

vi.mock("posthog-js", () => ({
  default: { captureException: mocks.captureException },
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
  getPaywallCardContent: (payload: { error?: string }) =>
    payload.error === "Rate limit exceeded"
      ? { message: "Limite raggiunto" }
      : null,
}));

vi.mock("../../../(chat)/components/ChatHeader", () => ({
  ChatHeader: () => null,
}));

vi.mock("../../../(chat)/components/ChatInput", () => ({
  ChatInput: ({
    input,
    isLoading,
    onSubmit,
    setInput,
  }: {
    input: string;
    isLoading: boolean;
    onSubmit: (event: React.FormEvent) => void;
    setInput: (value: string) => void;
  }) => (
    <form onSubmit={onSubmit}>
      <input
        aria-label="Messaggio di test"
        value={input}
        onChange={(event) => setInput(event.target.value)}
      />
      <button type="submit" disabled={isLoading}>
        Invia test
      </button>
    </form>
  ),
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
    canSubmitFeedback,
    feedbackMessageIds,
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
    canSubmitFeedback: boolean;
    feedbackMessageIds?: ReadonlySet<string>;
  }) => (
    <div>
      <output data-testid="feedback-enabled">
        {String(
          canSubmitFeedback &&
            feedbackMessageIds?.has(messages.at(-1)?.id ?? ""),
        )}
      </output>
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
  for (const mock of Object.values(mocks)) {
    if (typeof mock === "function" && "mockReset" in mock) {
      mock.mockReset();
    }
  }
  mocks.chatState.status = "ready";
  mocks.chatState.error = null;
  mocks.confirm.mockResolvedValue(true);
  mocks.sendMessage.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("ChatConversationClient pagination and recovery", () => {
  it("throttles streaming renders to avoid exhausting React's update depth", () => {
    renderConversation();

    expect(mocks.captureChatOptions).toHaveBeenCalledWith(
      expect.objectContaining({ throttle: 50 }),
    );
  });

  it("keeps submission settled until persisted messages are refreshed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(initialChatData), { status: 200 }),
        ),
    );
    const user = userEvent.setup();
    renderConversation();

    await user.type(
      screen.getByRole("textbox", { name: "Messaggio di test" }),
      "Nuova domanda",
    );
    await user.click(screen.getByRole("button", { name: "Invia test" }));

    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledOnce());
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Invia test" })
        .disabled,
    ).toBe(true);

    const chatOptions = mocks.captureChatOptions.mock.calls.at(-1)?.[0] as {
      onFinish: () => Promise<void>;
    };
    await act(() => chatOptions.onFinish());

    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>("button", { name: "Invia test" })
          .disabled,
      ).toBe(false),
    );
    expect(screen.getByTestId("feedback-enabled").textContent).toBe("true");
    expect(mocks.setMessages).toHaveBeenCalledOnce();
  });

  it("keeps retry disabled until a failed submission promise unwinds", async () => {
    let resolveSend: () => void = () => {};
    mocks.sendMessage.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSend = resolve;
      }),
    );
    const user = userEvent.setup();
    renderConversation();

    const input = screen.getByRole("textbox", { name: "Messaggio di test" });
    const submit = screen.getByRole<HTMLButtonElement>("button", {
      name: "Invia test",
    });
    await user.type(input, "Primo tentativo");
    await user.click(submit);

    const chatOptions = mocks.captureChatOptions.mock.calls.at(-1)?.[0] as {
      onError: (error: Error) => void;
    };
    act(() => chatOptions.onError(new Error("offline")));
    expect(submit.disabled).toBe(true);

    await act(async () => resolveSend());
    await waitFor(() => expect(submit.disabled).toBe(false));

    await user.type(input, "Secondo tentativo");
    await user.click(submit);
    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("clears the AI SDK error state before retrying a failed request", async () => {
    mocks.chatState.status = "error";
    mocks.chatState.error = new Error("offline");
    const user = userEvent.setup();
    renderConversation();

    await user.type(
      screen.getByRole("textbox", { name: "Messaggio di test" }),
      "Riprova",
    );
    await user.click(screen.getByRole("button", { name: "Invia test" }));

    expect(mocks.clearError).toHaveBeenCalledOnce();
    expect(mocks.sendMessage).toHaveBeenCalledOnce();
  });

  it("does not log or toast an expected rate-limit rejection", async () => {
    const rateLimitError = new Error(
      JSON.stringify({
        error: "Rate limit exceeded",
        reason: "Daily request limit reached",
      }),
    );
    mocks.sendMessage.mockRejectedValueOnce(rateLimitError);
    const consoleError = vi.mocked(console.error);
    const user = userEvent.setup();
    renderConversation();

    const input = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Messaggio di test",
    });
    await user.type(input, "Domanda oltre il limite");
    await user.click(screen.getByRole("button", { name: "Invia test" }));

    await waitFor(() => expect(input.value).toBe("Domanda oltre il limite"));
    expect(consoleError).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("does not report expected generation conflicts or rate limits", async () => {
    const { rerender } = renderConversation();

    mocks.chatState.status = "error";
    mocks.chatState.error = new Error(
      JSON.stringify({
        error: "Generation already in progress",
        retryable: true,
      }),
    );
    rerender(
      <ChatConversationClient
        chatId="chat-1"
        initialChatData={initialChatData}
      />,
    );

    await waitFor(() => expect(mocks.captureException).not.toHaveBeenCalled());

    mocks.chatState.error = new Error(
      JSON.stringify({ error: "Rate limit exceeded" }),
    );
    rerender(
      <ChatConversationClient
        chatId="chat-1"
        initialChatData={initialChatData}
      />,
    );

    await waitFor(() => expect(mocks.captureException).not.toHaveBeenCalled());
  });

  it("reports unexpected chat failures", async () => {
    mocks.chatState.status = "error";
    mocks.chatState.error = new Error("offline");
    renderConversation();

    await waitFor(() =>
      expect(mocks.captureException).toHaveBeenCalledWith(
        mocks.chatState.error,
        expect.objectContaining({ chat_id: "chat-1" }),
      ),
    );
  });

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
