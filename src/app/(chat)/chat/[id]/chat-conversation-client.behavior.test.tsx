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
import { type ComponentProps, useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutineCardData } from "@/lib/coaching/routine";
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
  updateActiveRoutine: vi.fn(),
  refreshActiveRoutine: vi.fn(),
  openSidebar: vi.fn(),
  captureHeaderProps: vi.fn(),
  captureChatOptions: vi.fn(),
  captureException: vi.fn(),
  chatState: {
    error: null as Error | null,
    status: "ready" as "ready" | "error",
  },
  clearError: vi.fn(),
  isGuest: true,
  confirmMode: "auto" as "auto" | "dialog",
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  routerRefresh: vi.fn(),
  searchParams: new URLSearchParams(),
  activeRoutine: null as RoutineCardData | null,
  chatNavigationEpoch: 0,
  guestConversationNotice: null as {
    remaining?: number;
    registrationHref: string;
  } | null,
  consumePendingInitialMessage: vi.fn(),
  consumePendingRoutineChatContext: vi.fn(),
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

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    DefaultChatTransport: class DefaultChatTransport {},
  };
});

vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.routerPush,
    replace: mocks.routerReplace,
    refresh: mocks.routerRefresh,
  }),
  useSearchParams: () => mocks.searchParams,
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
  useConfirm: () => {
    const [isOpen, setIsOpen] = useState(false);
    const [options, setOptions] = useState({
      title: "",
      description: "",
      confirmText: "",
      cancelText: "",
      variant: "default" as "default" | "destructive",
    });
    const resolveRef = useRef<((value: boolean) => void) | null>(null);

    return {
      confirm: (nextOptions: typeof options) => {
        const automaticDecision = mocks.confirm(nextOptions);
        if (mocks.confirmMode === "auto") return automaticDecision;

        setOptions(nextOptions);
        setIsOpen(true);
        return new Promise<boolean>((resolve) => {
          resolveRef.current = resolve;
        });
      },
      isOpen,
      options,
      handleConfirm: () => {
        resolveRef.current?.(true);
        resolveRef.current = null;
        setIsOpen(false);
      },
      handleCancel: () => {
        resolveRef.current?.(false);
        resolveRef.current = null;
        setIsOpen(false);
      },
      setIsOpen,
    };
  },
}));

vi.mock("@/lib/chat-client", () => ({
  convertToUIMessages: (messages: ChatData["messages"]) =>
    messages.map((message) => ({
      id: message.id,
      role: message.role,
      parts:
        Array.isArray(message.parts) && message.parts.length > 0
          ? message.parts
          : [{ type: "text", text: message.content ?? "" }],
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
  ChatHeader: (props: {
    onOpenSidebar?: () => void;
    guestConversationNotice?: {
      remaining?: number;
      registrationHref: string;
    } | null;
  }) => {
    mocks.captureHeaderProps(props);
    return null;
  },
}));

vi.mock("../../../(chat)/components/ChatInput", () => ({
  ChatInput: ({
    input,
    isLoading,
    focusRequestId,
    onSubmit,
    setInput,
  }: {
    input: string;
    isLoading: boolean;
    focusRequestId?: number;
    onSubmit: (event: React.FormEvent) => void;
    setInput: (value: string) => void;
  }) => (
    <form onSubmit={onSubmit}>
      <output data-testid="focus-request">{focusRequestId ?? 0}</output>
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
  SuggestedActions: ({
    className,
    variant,
  }: {
    className?: string;
    variant?: string;
  }) => (
    <div
      data-testid="suggested-actions"
      data-variant={variant}
      className={className}
    />
  ),
}));

vi.mock("../../../(chat)/components/MessageList", () => ({
  EmptyChatWelcome: ({ className }: { className?: string }) => (
    <div data-testid="empty-chat-welcome" className={className}>
      Chat vuota
    </div>
  ),
  MessageList: ({
    messages,
    isRegenerating,
    editingMessageId,
    deletingMessageId,
    isLoadingMore,
    onLoadMore,
    onEditStart,
    onEditSave,
    onDelete,
    onRegenerate,
    canSubmitFeedback,
    canRenderRoutineCards,
    feedbackMessageIds,
    routines = [],
    onSaveRoutine = async () => {
      throw new Error("Routine save callback missing");
    },
    onCreateRoutineAttempt = async () => {
      throw new Error("Routine attempt callback missing");
    },
    onSaveRoutineOutcome = async () => {
      throw new Error("Routine outcome callback missing");
    },
    onArchiveRoutine = async () => {
      throw new Error("Routine archive callback missing");
    },
    onTryRoutineNow = async () => {
      throw new Error("Routine start callback missing");
    },
    onAdaptRoutine = () => undefined,
    openCheckInRoutineId = null,
  }: ComponentProps<"div"> & {
    messages: Array<{
      id: string;
      parts: Array<{ text?: string; data?: { title?: string } }>;
    }>;
    isRegenerating?: boolean;
    editingMessageId: string | null;
    deletingMessageId: string | null;
    isLoadingMore: boolean;
    onLoadMore: () => void;
    onEditStart: (id: string, text: string) => void;
    onEditSave: () => void;
    onDelete: (id: string) => void;
    onRegenerate: () => void;
    canSubmitFeedback: boolean;
    canRenderRoutineCards?: boolean;
    feedbackMessageIds?: ReadonlySet<string>;
    routines: RoutineCardData[];
    onSaveRoutine: (
      sourceAssistantMessageId: string,
    ) => Promise<RoutineCardData>;
    onCreateRoutineAttempt: (
      routineId: string,
      outcome?: "HELPFUL" | "PARTIALLY_HELPFUL" | "NOT_HELPFUL",
      outcomeNote?: string | null,
    ) => Promise<RoutineCardData>;
    onSaveRoutineOutcome: (
      attemptId: string,
      outcome: "HELPFUL" | "PARTIALLY_HELPFUL" | "NOT_HELPFUL",
      outcomeNote?: string | null,
    ) => Promise<RoutineCardData>;
    onArchiveRoutine: (routineId: string) => Promise<RoutineCardData>;
    onTryRoutineNow: (
      sourceAssistantMessageId: string,
    ) => Promise<RoutineCardData>;
    onAdaptRoutine: (routineId: string, title: string) => void;
    openCheckInRoutineId?: string | null;
  }) => {
    const [archivePending, setArchivePending] = useState(false);
    const [routineActionError, setRoutineActionError] = useState<string | null>(
      null,
    );
    const [routineActionSuccess, setRoutineActionSuccess] = useState(false);
    const runRoutineAction = async (
      operation: () => Promise<RoutineCardData>,
    ) => {
      setRoutineActionError(null);
      setRoutineActionSuccess(false);
      try {
        await operation();
        setRoutineActionSuccess(true);
      } catch (error) {
        setRoutineActionError(
          error instanceof Error ? error.message : "Errore routine",
        );
      }
    };

    return (
      <div>
        {routineActionError && (
          <output data-testid="routine-action-error">
            {routineActionError}
          </output>
        )}
        {routineActionSuccess && (
          <output data-testid="routine-action-success">
            Azione routine completata
          </output>
        )}
        <output data-testid="routine-state">
          {routines[0]
            ? `${routines[0].status}:${routines[0].latestAttempt?.outcome ?? "NO_OUTCOME"}`
            : "PROPOSED"}
        </output>
        <output data-testid="routine-render-eligible">
          {String(canRenderRoutineCards)}
        </output>
        <output data-testid="open-check-in-routine">
          {openCheckInRoutineId ?? "NONE"}
        </output>
        {openCheckInRoutineId && (
          <textarea
            ref={(element) => element?.focus()}
            aria-label="Check-in routine aperto"
            data-routine-check-in-id={openCheckInRoutineId}
          />
        )}
        <output data-testid="feedback-enabled">
          {String(
            canSubmitFeedback &&
              feedbackMessageIds?.has(messages.at(-1)?.id ?? ""),
          )}
        </output>
        <output data-testid="regenerating">{String(isRegenerating)}</output>
        <ol aria-label="Messaggi">
          {messages.map((message) => (
            <li key={message.id}>
              {message.parts[0]?.text ?? message.parts[0]?.data?.title}
            </li>
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
        <button
          type="button"
          onClick={() =>
            void runRoutineAction(() => onSaveRoutine("assistant-new"))
          }
        >
          Salva routine test
        </button>
        <button
          type="button"
          onClick={() =>
            void runRoutineAction(() => onSaveRoutine("assistant-adapted"))
          }
        >
          Salva routine adattata test
        </button>
        <button
          type="button"
          onClick={() =>
            void runRoutineAction(() => onCreateRoutineAttempt("routine-1"))
          }
        >
          Segna tentativo test
        </button>
        <button
          type="button"
          onClick={() =>
            void runRoutineAction(() =>
              onCreateRoutineAttempt("routine-1", "HELPFUL", "Nota test"),
            )
          }
        >
          Primo esito test
        </button>
        <button
          type="button"
          onClick={() =>
            void runRoutineAction(() =>
              onCreateRoutineAttempt("routine-1", "HELPFUL", "  Nota test  "),
            )
          }
        >
          Primo esito con spazi test
        </button>
        <button
          type="button"
          onClick={() =>
            void runRoutineAction(() =>
              onCreateRoutineAttempt(
                "routine-1",
                "PARTIALLY_HELPFUL",
                "Nota diversa",
              ),
            )
          }
        >
          Esito cambiato test
        </button>
        <button
          type="button"
          onClick={() =>
            void runRoutineAction(() =>
              onSaveRoutineOutcome("attempt-1", "HELPFUL", "Nota test"),
            )
          }
        >
          Aggiorna esito test
        </button>
        <button
          type="button"
          onClick={() =>
            void runRoutineAction(() => onTryRoutineNow("assistant-new"))
          }
        >
          Prova ora test
        </button>
        <button
          type="button"
          onClick={() => onAdaptRoutine("routine-2", "Reset rapido")}
        >
          Adatta routine test
        </button>
        <button
          type="button"
          disabled={archivePending}
          onClick={async () => {
            setArchivePending(true);
            try {
              await onArchiveRoutine("routine-1");
            } catch {
              // The production card renders the recoverable error.
            } finally {
              setArchivePending(false);
            }
          }}
        >
          {archivePending
            ? "Archiviazione routine test"
            : "Archivia routine test"}
        </button>
      </div>
    );
  },
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onOpenChange,
    onConfirm,
    title,
    confirmText,
    cancelText,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    title: string;
    confirmText?: string;
    cancelText?: string;
  }) =>
    open ? (
      <div
        role="dialog"
        aria-label={title}
        onKeyDown={(event) => {
          if (event.key === "Escape") onOpenChange(false);
        }}
      >
        <button type="button" onClick={() => onOpenChange(false)}>
          {cancelText}
        </button>
        <button type="button" onClick={onConfirm}>
          {confirmText}
        </button>
      </div>
    ) : null,
}));

vi.mock("../chat-input-warmup", () => ({
  createChatInputWarmup: () => ({ schedule: vi.fn(), dispose: vi.fn() }),
}));

vi.mock("../layout-client", () => ({
  useChatContext: () => ({
    renameChat: vi.fn(),
    isGuest: mocks.isGuest,
    getCachedChat: () => null,
    updateCachedChat: mocks.updateCachedChat,
    updateActiveRoutine: mocks.updateActiveRoutine,
    refreshActiveRoutine: mocks.refreshActiveRoutine,
    openSidebar: mocks.openSidebar,
    activeRoutine: mocks.activeRoutine,
    chatNavigationEpoch: mocks.chatNavigationEpoch,
    guestConversationNotice: mocks.guestConversationNotice,
    consumePendingInitialMessage: mocks.consumePendingInitialMessage,
    consumePendingRoutineChatContext: mocks.consumePendingRoutineChatContext,
  }),
}));

const initialChatData: ChatData = {
  id: "chat-1",
  title: "Test",
  icon: "BRAIN",
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
  routines: [],
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
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<Response>((resolver, rejecter) => {
    resolve = resolver;
    reject = rejecter;
  });
  return { promise, reject, resolve };
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
  mocks.isGuest = true;
  mocks.confirmMode = "auto";
  mocks.searchParams = new URLSearchParams();
  mocks.activeRoutine = null;
  mocks.chatNavigationEpoch = 0;
  mocks.guestConversationNotice = null;
  mocks.consumePendingInitialMessage.mockReturnValue(null);
  mocks.consumePendingRoutineChatContext.mockReturnValue(null);
  mocks.confirm.mockResolvedValue(true);
  mocks.refreshActiveRoutine.mockResolvedValue(null);
  mocks.sendMessage.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("ChatConversationClient pagination and recovery", () => {
  it("anchors the empty state above the mobile composer", () => {
    renderConversation({ ...initialChatData, messages: [] });

    const welcome = screen.getByTestId("empty-chat-welcome");
    expect(welcome.parentElement?.className).toContain("justify-start");
    expect(
      screen.getByTestId("suggested-actions").getAttribute("data-variant"),
    ).toBe("cards");
  });

  it("passes the mobile sidebar action and compact guest notice to the conversation header", () => {
    mocks.guestConversationNotice = {
      remaining: 2,
      registrationHref: "/sign-up?redirect_url=%2Fchat%2Fchat-1",
    };

    renderConversation();

    expect(mocks.captureHeaderProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        icon: "BRAIN",
        onOpenSidebar: mocks.openSidebar,
        guestConversationNotice: {
          remaining: 2,
          registrationHref: "/sign-up?redirect_url=%2Fchat%2Fchat-1",
        },
      }),
    );
  });

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
    const currentRoutine = {
      id: "routine-current",
      sourceChatId: "chat-1",
      sourceAssistantMessageId: "assistant-new",
      status: "ACTIVE" as const,
      formatVersion: 1 as const,
      proposal: {
        title: "Routine corrente",
        trigger: "Prima del gesto",
        durationLabel: "30 secondi",
        steps: ["Respira", "Visualizza"],
        completionCue: "Riparti",
      },
      archivedAt: null,
      latestAttempt: null,
    };
    const olderRoutine = {
      id: "routine-old",
      sourceChatId: "chat-1",
      sourceAssistantMessageId: "assistant-old",
      status: "ACTIVE" as const,
      formatVersion: 1 as const,
      proposal: {
        title: "Routine precedente",
        trigger: "Dopo un errore",
        durationLabel: null,
        steps: ["Fermati", "Scegli il prossimo gesto"],
        completionCue: "Torna al compito",
      },
      archivedAt: null,
      latestAttempt: null,
    };
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
            routines: [
              olderRoutine,
              {
                ...currentRoutine,
                proposal: {
                  ...currentRoutine.proposal,
                  title: "Copia obsoleta",
                },
              },
            ],
            pagination: { hasMore: false, nextCursor: null },
          }),
          { status: 200 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderConversation({ ...initialChatData, routines: [currentRoutine] });

    await user.click(screen.getByRole("button", { name: "Carica precedenti" }));

    await waitFor(() =>
      expect(messageOrder()).toEqual([
        "Domanda vecchia",
        "Risposta vecchia",
        "Domanda nuova",
        "Risposta nuova",
      ]),
    );
    await waitFor(() =>
      expect(mocks.updateCachedChat).toHaveBeenLastCalledWith(
        "chat-1",
        expect.objectContaining({
          routines: [currentRoutine, olderRoutine],
        }),
      ),
    );
  });

  it("deduplicates a target-hydrated source when normal pagination reaches it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            messages: [
              {
                id: "assistant-old",
                role: "assistant",
                content: "Routine precedente",
                parts: [],
                createdAt: "2026-07-01T10:00:00.000Z",
              },
              {
                id: "user-between",
                role: "user",
                content: "Domanda intermedia",
                parts: [],
                createdAt: "2026-07-10T11:00:00.000Z",
              },
            ],
            routines: [],
            pagination: { hasMore: false, nextCursor: null },
          }),
          { status: 200 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderConversation({
      ...initialChatData,
      messages: [
        {
          id: "assistant-old",
          role: "assistant",
          content: "Routine precedente",
          parts: [],
          createdAt: "2026-07-01T10:00:00.000Z",
        },
        ...initialChatData.messages,
      ],
    });

    await user.click(screen.getByRole("button", { name: "Carica precedenti" }));

    await waitFor(() =>
      expect(messageOrder()).toEqual([
        "Routine precedente",
        "Domanda intermedia",
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

  it("refreshes the authoritative active routine after deleting its source message range", async () => {
    const orphanRoutine: RoutineCardData = {
      id: "routine-1",
      sourceChatId: null,
      sourceAssistantMessageId: null,
      status: "ACTIVE",
      formatVersion: 1,
      proposal: {
        title: "Reset rapido",
        trigger: "Dopo un errore",
        durationLabel: null,
        steps: ["Fermati", "Espira"],
        completionCue: "Riparti",
      },
      archivedAt: null,
      latestAttempt: null,
    };
    mocks.refreshActiveRoutine.mockResolvedValue(orphanRoutine);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...initialChatData, routines: [] }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderConversation();

    await user.click(screen.getByRole("button", { name: "Elimina" }));
    const deleteOptions = mocks.toast.mock.calls[0]?.[1] as {
      onAutoClose: () => Promise<void>;
    };
    await act(() => deleteOptions.onAutoClose());

    expect(mocks.refreshActiveRoutine).toHaveBeenCalledOnce();
  });

  it("replaces the retried prompt instead of appending a duplicate", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    let resolveSend: () => void = () => {};
    mocks.sendMessage.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveSend = resolve;
      }),
    );
    const user = userEvent.setup();
    renderConversation();

    await user.click(screen.getByRole("button", { name: "Rigenera" }));

    await waitFor(() => {
      expect(mocks.setMessages).toHaveBeenCalledWith([
        expect.objectContaining({ id: "user-new" }),
      ]);
      expect(mocks.sendMessage).toHaveBeenCalledWith({
        text: "Domanda nuova",
        messageId: "user-new",
      });
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/guest/chat/messages?id=user-new",
      {
        method: "DELETE",
      },
    );
    expect(screen.getByTestId("regenerating").textContent).toBe("true");

    await act(async () => resolveSend());
    await waitFor(() =>
      expect(screen.getByTestId("regenerating").textContent).toBe("false"),
    );
  });
});

describe("ChatConversationClient routine lifecycle", () => {
  const proposal = {
    title: "Reset rapido",
    trigger: "Dopo un errore",
    durationLabel: "60 secondi",
    steps: ["Fermati", "Espira", "Riparti"],
    completionCue: "Torni sul gesto successivo",
  };
  const activeRoutine: RoutineCardData = {
    id: "routine-1",
    sourceChatId: "chat-1",
    sourceAssistantMessageId: "assistant-new",
    status: "ACTIVE",
    formatVersion: 1,
    proposal,
    archivedAt: null,
    latestAttempt: null,
  };
  const pendingActiveRoutine: RoutineCardData = {
    ...activeRoutine,
    latestAttempt: {
      id: "attempt-1",
      attemptedAt: "2026-08-08T09:00:00.000Z",
      outcome: null,
      outcomeNote: null,
      outcomeRecordedAt: null,
    },
  };
  const sourceMessage = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    id: "assistant-old",
    role: "assistant",
    content: null,
    parts: [
      { type: "text", text: "Routine precedente" },
      { type: "data-coachingRoutine", data: proposal },
    ],
    createdAt: "2026-07-01T10:00:00.000Z",
    ...overrides,
  });

  beforeEach(() => {
    mocks.isGuest = false;
  });

  it("shows the saved repeat card without starting an AI turn", () => {
    const data: ChatData = {
      ...initialChatData,
      messages: [],
      routines: [],
      routineContext: {
        mode: "repeat",
        routine: activeRoutine,
      },
    };

    renderConversation(data);

    expect(screen.queryByText("Chat vuota")).toBeNull();
    expect(screen.getByRole("list", { name: "Messaggi" })).toBeTruthy();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("opens only the queried source routine and removes the query after focus", async () => {
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-1");
    const data = { ...initialChatData, routines: [pendingActiveRoutine] };

    const { rerender } = renderConversation(data);

    await waitFor(() =>
      expect(screen.getByTestId("open-check-in-routine").textContent).toBe(
        "routine-1",
      ),
    );
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Check-in routine aperto" }),
    );
    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith("/chat/chat-1"),
    );

    rerender(<ChatConversationClient chatId="chat-1" initialChatData={data} />);
    expect(mocks.routerReplace).toHaveBeenCalledOnce();
  });

  it("resolves and opens a second active routine outside the loaded chat page", async () => {
    const remoteRoutine: RoutineCardData = {
      ...pendingActiveRoutine,
      id: "routine-2",
      sourceAssistantMessageId: "assistant-second",
    };
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-2");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "/api/coaching/routines/routine-2") {
          return new Response(JSON.stringify({ routine: remoteRoutine }), {
            status: 200,
          });
        }
        if (
          url ===
          "/api/chats/chat-1?routineId=routine-2&sourceAssistantMessageId=assistant-second"
        ) {
          return new Response(
            JSON.stringify({
              ...initialChatData,
              messages: [sourceMessage({ id: "assistant-second" })],
              routines: [remoteRoutine],
              pagination: { hasMore: false, nextCursor: null },
            }),
            { status: 200 },
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    renderConversation({ ...initialChatData, routines: [] });

    await waitFor(() =>
      expect(screen.getByTestId("open-check-in-routine").textContent).toBe(
        "routine-2",
      ),
    );
    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith("/chat/chat-1"),
    );
  });

  it("does not hydrate a resolved routine against a newer check-in query", async () => {
    const firstRoutine: RoutineCardData = {
      ...pendingActiveRoutine,
      id: "routine-a",
      sourceAssistantMessageId: "assistant-a",
    };
    const secondRoutine: RoutineCardData = {
      ...pendingActiveRoutine,
      id: "routine-b",
      sourceAssistantMessageId: "assistant-b",
    };
    const secondLookup = deferredResponse();
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-a");
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/coaching/routines/routine-a") {
        return Promise.resolve(
          new Response(JSON.stringify({ routine: firstRoutine }), {
            status: 200,
          }),
        );
      }
      if (
        url ===
        "/api/chats/chat-1?routineId=routine-a&sourceAssistantMessageId=assistant-a"
      ) {
        return new Promise<Response>(() => undefined);
      }
      if (url === "/api/coaching/routines/routine-b") {
        return secondLookup.promise;
      }
      if (
        url ===
        "/api/chats/chat-1?routineId=routine-b&sourceAssistantMessageId=assistant-b"
      ) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ...initialChatData,
              messages: [sourceMessage({ id: "assistant-b" })],
              routines: [secondRoutine],
              pagination: { hasMore: false, nextCursor: null },
            }),
            { status: 200 },
          ),
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const view = renderConversation({ ...initialChatData, routines: [] });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/coaching/routines/routine-a",
      ),
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/chats/chat-1?routineId=routine-a&sourceAssistantMessageId=assistant-a",
      ),
    );

    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-b");
    view.rerender(
      <ChatConversationClient
        chatId="chat-1"
        initialChatData={{ ...initialChatData, routines: [] }}
      />,
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/coaching/routines/routine-b",
      ),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/chats/chat-1?routineId=routine-b&sourceAssistantMessageId=assistant-a",
    );

    await act(async () => {
      secondLookup.resolve(
        new Response(JSON.stringify({ routine: secondRoutine }), {
          status: 200,
        }),
      );
    });
    await waitFor(() =>
      expect(screen.getByTestId("open-check-in-routine").textContent).toBe(
        "routine-b",
      ),
    );
    expect(mocks.routerReplace).not.toHaveBeenCalledWith(
      "/chat?checkInRoutineId=routine-b",
    );
  });

  it("resolves an archived routine outside the loaded chat page without opening a check-in", async () => {
    const remoteRoutine: RoutineCardData = {
      ...activeRoutine,
      id: "routine-archive",
      sourceAssistantMessageId: "assistant-archive",
      status: "ARCHIVED",
      archivedAt: "2026-08-08T11:00:00.000Z",
    };
    mocks.searchParams = new URLSearchParams(
      "checkInRoutineId=routine-archive",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === "/api/coaching/routines/routine-archive") {
          return new Response(JSON.stringify({ routine: remoteRoutine }), {
            status: 200,
          });
        }
        if (
          url ===
          "/api/chats/chat-1?routineId=routine-archive&sourceAssistantMessageId=assistant-archive"
        ) {
          return new Response(
            JSON.stringify({
              ...initialChatData,
              messages: [sourceMessage({ id: "assistant-archive" })],
              routines: [remoteRoutine],
              pagination: { hasMore: false, nextCursor: null },
            }),
            { status: 200 },
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    renderConversation({ ...initialChatData, routines: [] });

    await waitFor(() =>
      expect(
        mocks.updateCachedChat.mock.calls.some(([, data]) =>
          (data as ChatData).messages.some(
            (message) => message.id === "assistant-archive",
          ),
        ),
      ).toBe(true),
    );
    expect(screen.getByTestId("open-check-in-routine").textContent).toBe(
      "NONE",
    );
    expect(mocks.routerReplace).toHaveBeenCalledWith("/chat/chat-1");
  });

  it("keeps a consumed source form for the current visit but not after navigation back", async () => {
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-1");
    const data = { ...initialChatData, routines: [pendingActiveRoutine] };
    const view = renderConversation(data);

    await waitFor(() =>
      expect(screen.getByTestId("open-check-in-routine").textContent).toBe(
        "routine-1",
      ),
    );
    mocks.searchParams = new URLSearchParams();
    view.rerender(
      <ChatConversationClient chatId="chat-1" initialChatData={data} />,
    );
    expect(screen.getByTestId("open-check-in-routine").textContent).toBe(
      "routine-1",
    );

    mocks.chatNavigationEpoch += 1;
    view.rerender(
      <ChatConversationClient chatId="chat-1" initialChatData={data} />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("open-check-in-routine").textContent).toBe(
        "NONE",
      ),
    );
    view.rerender(
      <ChatConversationClient chatId="chat-1" initialChatData={data} />,
    );
    expect(screen.getByTestId("open-check-in-routine").textContent).toBe(
      "NONE",
    );
    expect(mocks.routerReplace).toHaveBeenCalledOnce();
  });

  it("target-hydrates an older active source before consuming the return query", async () => {
    const olderRoutine: RoutineCardData = {
      ...pendingActiveRoutine,
      sourceAssistantMessageId: "assistant-old",
    };
    mocks.activeRoutine = olderRoutine;
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-1");
    const pending = deferredResponse();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetchMock);

    renderConversation({ ...initialChatData, routines: [] });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/chats/chat-1?routineId=routine-1&sourceAssistantMessageId=assistant-old",
      ),
    );
    expect(mocks.routerReplace).not.toHaveBeenCalled();

    pending.resolve(
      new Response(
        JSON.stringify({
          ...initialChatData,
          messages: [sourceMessage()],
          routines: [olderRoutine],
          pagination: { hasMore: false, nextCursor: null },
        }),
        { status: 200 },
      ),
    );

    await waitFor(() =>
      expect(screen.getByTestId("open-check-in-routine").textContent).toBe(
        "routine-1",
      ),
    );
    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith("/chat/chat-1"),
    );
  });

  it("finishes target hydration when pagination updates chat data in flight", async () => {
    const olderRoutine: RoutineCardData = {
      ...pendingActiveRoutine,
      sourceAssistantMessageId: "assistant-old",
    };
    mocks.activeRoutine = olderRoutine;
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-1");
    const pendingHydration = deferredResponse();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("sourceAssistantMessageId=assistant-old")) {
        return pendingHydration.promise;
      }
      if (url.includes("cursor=cursor-1")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              messages: [
                {
                  id: "user-between",
                  role: "user",
                  content: "Domanda intermedia",
                  parts: [],
                  createdAt: "2026-07-10T11:00:00.000Z",
                },
              ],
              routines: [],
              pagination: { hasMore: false, nextCursor: null },
            }),
            { status: 200 },
          ),
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderConversation({ ...initialChatData, routines: [] });

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/chats/chat-1?routineId=routine-1&sourceAssistantMessageId=assistant-old",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Carica precedenti" }));
    await screen.findByText("Domanda intermedia");

    pendingHydration.resolve(
      new Response(
        JSON.stringify({
          ...initialChatData,
          messages: [sourceMessage()],
          routines: [olderRoutine],
          pagination: { hasMore: false, nextCursor: null },
        }),
        { status: 200 },
      ),
    );

    await waitFor(() =>
      expect(screen.getByTestId("open-check-in-routine").textContent).toBe(
        "routine-1",
      ),
    );
    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith("/chat/chat-1"),
    );
  });

  it("syncs source messages from canonical chat data when pagination settles in the same batch", async () => {
    const olderRoutine: RoutineCardData = {
      ...pendingActiveRoutine,
      sourceAssistantMessageId: "assistant-old",
    };
    mocks.activeRoutine = olderRoutine;
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-1");
    const pendingHydration = deferredResponse();
    const pendingPagination = deferredResponse();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("sourceAssistantMessageId=assistant-old")) {
          return pendingHydration.promise;
        }
        if (url.includes("cursor=cursor-1")) {
          return pendingPagination.promise;
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
    const user = userEvent.setup();

    renderConversation({ ...initialChatData, routines: [] });
    await user.click(screen.getByRole("button", { name: "Carica precedenti" }));

    await act(async () => {
      pendingPagination.resolve(
        new Response(
          JSON.stringify({
            messages: [
              {
                id: "user-between",
                role: "user",
                content: "Domanda intermedia",
                parts: [],
                createdAt: "2026-07-10T11:00:00.000Z",
              },
            ],
            routines: [],
            pagination: { hasMore: false, nextCursor: null },
          }),
          { status: 200 },
        ),
      );
      pendingHydration.resolve(
        new Response(
          JSON.stringify({
            ...initialChatData,
            messages: [sourceMessage()],
            routines: [olderRoutine],
            pagination: { hasMore: false, nextCursor: null },
          }),
          { status: 200 },
        ),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByTestId("open-check-in-routine").textContent).toBe(
        "routine-1",
      ),
    );
    expect(messageOrder()).toEqual([
      "Routine precedente",
      "Domanda intermedia",
      "Domanda nuova",
      "Risposta nuova",
    ]);
    await waitFor(() =>
      expect(mocks.setMessages).toHaveBeenLastCalledWith([
        expect.objectContaining({ id: "assistant-old" }),
        expect.objectContaining({ id: "user-between" }),
        expect.objectContaining({ id: "user-new" }),
        expect.objectContaining({ id: "assistant-new" }),
      ]),
    );
    expect(mocks.updateCachedChat).toHaveBeenLastCalledWith(
      "chat-1",
      expect.objectContaining({
        messages: [
          expect.objectContaining({ id: "assistant-old" }),
          expect.objectContaining({ id: "user-between" }),
          expect.objectContaining({ id: "user-new" }),
          expect.objectContaining({ id: "assistant-new" }),
        ],
      }),
    );
  });

  it.each([
    ["a rejected request", () => Promise.reject(new Error("offline"))],
    [
      "a malformed response",
      () => Promise.resolve(new Response(JSON.stringify({ routines: [] }))),
    ],
    [
      "a non-2xx response",
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "not found" }), {
            status: 404,
          }),
        ),
    ],
  ])("falls back to the orphan check-in after %s", async (_, response) => {
    const olderRoutine: RoutineCardData = {
      ...pendingActiveRoutine,
      sourceAssistantMessageId: "assistant-old",
    };
    mocks.activeRoutine = olderRoutine;
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-1");
    const fetchMock = vi.fn(response);
    vi.stubGlobal("fetch", fetchMock);

    const view = renderConversation({ ...initialChatData, routines: [] });

    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith(
        "/chat?checkInRoutineId=routine-1",
      ),
    );
    expect(screen.getByTestId("open-check-in-routine").textContent).toBe(
      "NONE",
    );
    expect(mocks.toastError).toHaveBeenCalledOnce();

    view.rerender(
      <ChatConversationClient
        chatId="chat-1"
        initialChatData={{ ...initialChatData, routines: [] }}
      />,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mocks.routerReplace).toHaveBeenCalledOnce();
  });

  it.each([
    ["an empty message list", []],
    [
      "a missing target source message",
      [
        {
          id: "assistant-other",
          role: "assistant",
          content: "Altra risposta",
          parts: [],
          createdAt: "2026-07-01T09:00:00.000Z",
        },
      ],
    ],
    [
      "a target message with the wrong role",
      [
        {
          id: "assistant-old",
          role: "user",
          content: "Ruolo non attendibile",
          parts: [],
          createdAt: "2026-07-01T10:00:00.000Z",
        },
      ],
    ],
    ["a null message entry", [null]],
    ["a malformed message entry", [{ id: "assistant-old", role: "assistant" }]],
    ["a source without its routine card part", [sourceMessage({ parts: [] })]],
    [
      "a source with a different routine card part",
      [
        sourceMessage({
          parts: [
            { type: "text", text: "Routine precedente" },
            {
              type: "data-coachingRoutine",
              data: { ...proposal, title: "Routine diversa" },
            },
          ],
        }),
      ],
    ],
    [
      "a valid target plus an unrelated message",
      [
        sourceMessage(),
        {
          id: "user-unrelated",
          role: "user",
          content: "Messaggio estraneo",
          parts: [{ type: "text", text: "Messaggio estraneo" }],
          createdAt: "2026-07-01T10:01:00.000Z",
        },
      ],
    ],
    [
      "a duplicate target overwritten by a user message",
      [
        sourceMessage(),
        sourceMessage({ role: "user", content: "Duplicato non attendibile" }),
      ],
    ],
  ])("falls back safely for %s", async (_, messages) => {
    const olderRoutine: RoutineCardData = {
      ...pendingActiveRoutine,
      sourceAssistantMessageId: "assistant-old",
    };
    mocks.activeRoutine = olderRoutine;
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...initialChatData,
            messages,
            routines: [olderRoutine],
            pagination: { hasMore: false, nextCursor: null },
          }),
          { status: 200 },
        ),
      ),
    );

    renderConversation({ ...initialChatData, routines: [] });

    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith(
        "/chat?checkInRoutineId=routine-1",
      ),
    );
    expect(screen.getByTestId("open-check-in-routine").textContent).toBe(
      "NONE",
    );
    expect(mocks.updateCachedChat).not.toHaveBeenCalledWith(
      "chat-1",
      expect.objectContaining({ routines: [olderRoutine] }),
    );
  });

  it("drops unsupported source fields before merging a valid hydrated card", async () => {
    const olderRoutine: RoutineCardData = {
      ...pendingActiveRoutine,
      sourceAssistantMessageId: "assistant-old",
    };
    mocks.activeRoutine = olderRoutine;
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...initialChatData,
            messages: [sourceMessage({ attachments: [{}] })],
            routines: [olderRoutine],
            pagination: { hasMore: false, nextCursor: null },
          }),
          { status: 200 },
        ),
      ),
    );

    renderConversation({ ...initialChatData, routines: [] });

    await waitFor(() =>
      expect(
        mocks.updateCachedChat.mock.calls.some(([, data]) =>
          (data as ChatData).messages.some(
            (message) => message.id === "assistant-old",
          ),
        ),
      ).toBe(true),
    );
    const cachedChat = mocks.updateCachedChat.mock.calls.findLast(([, data]) =>
      (data as ChatData).messages.some(
        (message) => message.id === "assistant-old",
      ),
    )?.[1] as ChatData;
    expect(
      cachedChat.messages.find((message) => message.id === "assistant-old"),
    ).not.toHaveProperty("attachments");
    expect(mocks.routerReplace).toHaveBeenCalledWith("/chat/chat-1");
  });

  it("clears to the landing when the active hydration target disappears", async () => {
    const olderRoutine: RoutineCardData = {
      ...pendingActiveRoutine,
      sourceAssistantMessageId: "assistant-old",
    };
    mocks.activeRoutine = olderRoutine;
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-1");
    const pendingHydration = deferredResponse();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pendingHydration.promise));
    const view = renderConversation({ ...initialChatData, routines: [] });

    await waitFor(() =>
      expect(screen.getByTestId("open-check-in-routine").textContent).toBe(
        "NONE",
      ),
    );
    mocks.activeRoutine = null;
    view.rerender(
      <ChatConversationClient
        chatId="chat-1"
        initialChatData={{ ...initialChatData, routines: [] }}
      />,
    );

    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith("/chat"),
    );
  });

  it("hydrates a matching archived source without opening a check-in", async () => {
    const archivedRoutine: RoutineCardData = {
      ...activeRoutine,
      status: "ARCHIVED",
      archivedAt: "2026-08-08T11:00:00.000Z",
    };
    mocks.activeRoutine = activeRoutine;
    mocks.searchParams = new URLSearchParams("checkInRoutineId=routine-1");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...initialChatData,
          messages: [sourceMessage({ id: "assistant-new" })],
          routines: [archivedRoutine],
          pagination: { hasMore: false, nextCursor: null },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderConversation({ ...initialChatData, routines: [archivedRoutine] });

    expect(screen.getByTestId("open-check-in-routine").textContent).toBe(
      "NONE",
    );
    expect(
      screen.queryByRole("textbox", { name: "Check-in routine aperto" }),
    ).toBeNull();
    await waitFor(() =>
      expect(
        mocks.updateCachedChat.mock.calls.some(([, data]) =>
          (data as ChatData).messages.some(
            (message) => message.id === "assistant-new",
          ),
        ),
      ).toBe(true),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chats/chat-1?routineId=routine-1&sourceAssistantMessageId=assistant-new",
    );
    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith("/chat/chat-1"),
    );
  });

  it("clears an unknown source routine query without opening a form", async () => {
    mocks.searchParams = new URLSearchParams("checkInRoutineId=stale-routine");

    renderConversation({ ...initialChatData, routines: [activeRoutine] });

    expect(screen.getByTestId("open-check-in-routine").textContent).toBe(
      "NONE",
    );
    expect(
      screen.queryByRole("textbox", { name: "Check-in routine aperto" }),
    ).toBeNull();
    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith("/chat/chat-1"),
    );
  });

  it("publishes a saved routine only after its authoritative refresh", async () => {
    const refreshedData = { ...initialChatData, routines: [activeRoutine] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ routine: activeRoutine }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(refreshedData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderConversation();

    await user.click(
      screen.getByRole("button", { name: "Salva routine test" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("routine-state").textContent).toBe(
        "ACTIVE:NO_OUTCOME",
      ),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/coaching/routines",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sourceAssistantMessageId: "assistant-new" }),
      }),
    );
    expect(mocks.refreshActiveRoutine).toHaveBeenCalledOnce();
    expect(mocks.updateActiveRoutine).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/chats/chat-1");
    expect(mocks.setMessages).toHaveBeenCalled();
  });

  it("does not expose routine cards for a private chat the viewer does not own", () => {
    renderConversation({ ...initialChatData, isOwner: false });

    expect(screen.getByTestId("routine-render-eligible").textContent).toBe(
      "false",
    );
  });

  it("refreshes authoritative chat state after a 422 and preserves its useful error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Proposal invalid" }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(initialChatData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderConversation();

    await user.click(
      screen.getByRole("button", { name: "Salva routine test" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("routine-state").textContent).toBe("PROPOSED");
    expect(screen.getByTestId("routine-action-error").textContent).toBe(
      "La proposta non è più valida. Aggiorna la chat e riprova.",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/chats/chat-1");
    expect(mocks.setMessages).toHaveBeenCalled();
  });

  it("preserves the original 422 error when its recovery refresh also fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Proposal invalid" }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockRejectedValueOnce(new Error("refresh offline"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderConversation();

    await user.click(
      screen.getByRole("button", { name: "Salva routine test" }),
    );

    expect(
      (await screen.findByTestId("routine-action-error")).textContent,
    ).toBe("La proposta non è più valida. Aggiorna la chat e riprova.");
    expect(screen.queryByTestId("routine-action-success")).toBeNull();
    expect(screen.getByTestId("routine-state").textContent).toBe("PROPOSED");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.setMessages).not.toHaveBeenCalled();
  });

  it("refreshes an archived routine after a 409 before exposing the conflict", async () => {
    const archivedRoutine: RoutineCardData = {
      ...activeRoutine,
      status: "ARCHIVED",
      archivedAt: "2026-08-08T11:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Routine is archived" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...initialChatData, routines: [archivedRoutine] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderConversation({ ...initialChatData, routines: [activeRoutine] });

    await user.click(
      screen.getByRole("button", { name: "Segna tentativo test" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("routine-state").textContent).toBe(
        "ARCHIVED:NO_OUTCOME",
      ),
    );
    expect(screen.getByTestId("routine-action-error").textContent).toBe(
      "La routine non è più attiva. Aggiorna la chat e riprova.",
    );
    expect(mocks.setMessages).toHaveBeenCalled();
  });

  it("preserves the original 409 error when its recovery refresh also fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Routine is archived" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockRejectedValueOnce(new Error("refresh offline"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderConversation({ ...initialChatData, routines: [activeRoutine] });

    await user.click(
      screen.getByRole("button", { name: "Segna tentativo test" }),
    );

    expect(
      (await screen.findByTestId("routine-action-error")).textContent,
    ).toBe("La routine non è più attiva. Aggiorna la chat e riprova.");
    expect(screen.queryByTestId("routine-action-success")).toBeNull();
    expect(screen.getByTestId("routine-state").textContent).toBe(
      "ACTIVE:NO_OUTCOME",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.setMessages).not.toHaveBeenCalled();
  });

  it("rejects a successful mutation when the required chat refresh fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ routine: activeRoutine }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockRejectedValueOnce(new Error("refresh offline"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderConversation();

    await user.click(
      screen.getByRole("button", { name: "Salva routine test" }),
    );

    expect(
      (await screen.findByTestId("routine-action-error")).textContent,
    ).toBe(
      "Routine aggiornata, ma non siamo riusciti ad aggiornare la chat. Riprova.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.setMessages).not.toHaveBeenCalled();
    expect(screen.queryByTestId("routine-action-success")).toBeNull();
    expect(screen.getByTestId("routine-state").textContent).toBe("PROPOSED");
  });

  it("does not announce success when refresh returns stale routine state", async () => {
    const attemptedRoutine: RoutineCardData = {
      ...activeRoutine,
      latestAttempt: {
        id: "attempt-1",
        attemptedAt: "2026-08-08T10:00:00.000Z",
        outcome: null,
        outcomeNote: null,
        outcomeRecordedAt: null,
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ routine: attemptedRoutine }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...initialChatData, routines: [activeRoutine] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderConversation({ ...initialChatData, routines: [activeRoutine] });

    await user.click(
      screen.getByRole("button", { name: "Segna tentativo test" }),
    );

    expect(await screen.findByTestId("routine-action-error")).toHaveProperty(
      "textContent",
      "La chat non mostra ancora l'ultimo aggiornamento della routine. Riprova.",
    );
    expect(screen.queryByTestId("routine-action-success")).toBeNull();
    expect(screen.getByTestId("routine-state").textContent).toBe(
      "ACTIVE:NO_OUTCOME",
    );
  });

  it("rejects a malformed success payload without showing a saved routine", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ routine: { id: "invalid" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const user = userEvent.setup();
    renderConversation();

    await user.click(
      screen.getByRole("button", { name: "Salva routine test" }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(screen.getByTestId("routine-state").textContent).toBe("PROPOSED");
    expect(mocks.setMessages).not.toHaveBeenCalled();
  });

  it("reuses the same client action id when an attempt gets a 409 and is retried", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        url === "/api/chats/chat-1"
          ? new Response(
              JSON.stringify({ ...initialChatData, routines: [activeRoutine] }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            )
          : new Response(JSON.stringify({ error: "Routine is archived" }), {
              status: 409,
              headers: { "Content-Type": "application/json" },
            }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderConversation({ ...initialChatData, routines: [activeRoutine] });
    const attempt = screen.getByRole("button", {
      name: "Segna tentativo test",
    });

    await user.click(attempt);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await user.click(attempt);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const retryBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(firstBody.clientActionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(retryBody.clientActionId).toBe(firstBody.clientActionId);
    expect(screen.getByTestId("routine-state").textContent).toBe(
      "ACTIVE:NO_OUTCOME",
    );
  });

  it("reuses one client action id only for the same normalized check-in payload", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderConversation({ ...initialChatData, routines: [activeRoutine] });

    await user.click(screen.getByRole("button", { name: "Primo esito test" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.click(
      screen.getByRole("button", { name: "Primo esito con spazi test" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const retryBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(retryBody.clientActionId).toBe(firstBody.clientActionId);
    expect(retryBody.outcomeNote).toBe("Nota test");
  });

  it("generates a new client action id when the failed check-in payload changes", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderConversation({ ...initialChatData, routines: [activeRoutine] });

    await user.click(screen.getByRole("button", { name: "Primo esito test" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.click(
      screen.getByRole("button", { name: "Esito cambiato test" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const changedBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(changedBody.clientActionId).not.toBe(firstBody.clientActionId);
  });

  it("keeps the pending attempt unchanged after a network outcome failure", async () => {
    const pendingRoutine: RoutineCardData = {
      ...activeRoutine,
      latestAttempt: {
        id: "attempt-1",
        attemptedAt: "2026-08-08T10:00:00.000Z",
        outcome: null,
        outcomeNote: null,
        outcomeRecordedAt: null,
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const user = userEvent.setup();
    renderConversation({ ...initialChatData, routines: [pendingRoutine] });

    await user.click(
      screen.getByRole("button", { name: "Aggiorna esito test" }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(screen.getByTestId("routine-state").textContent).toBe(
      "ACTIVE:NO_OUTCOME",
    );
    expect(mocks.setMessages).not.toHaveBeenCalled();
  });

  it("uses the outcome response as truth and refreshes the chat", async () => {
    const pendingRoutine: RoutineCardData = {
      ...activeRoutine,
      latestAttempt: {
        id: "attempt-1",
        attemptedAt: "2026-08-08T10:00:00.000Z",
        outcome: null,
        outcomeNote: null,
        outcomeRecordedAt: null,
      },
    };
    const completedRoutine: RoutineCardData = {
      ...pendingRoutine,
      latestAttempt: {
        id: "attempt-1",
        attemptedAt: "2026-08-08T10:00:00.000Z",
        outcome: "HELPFUL",
        outcomeNote: "Nota test",
        outcomeRecordedAt: "2026-08-08T10:05:00.000Z",
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ routine: completedRoutine }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...initialChatData, routines: [completedRoutine] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderConversation({ ...initialChatData, routines: [pendingRoutine] });

    await user.click(
      screen.getByRole("button", { name: "Aggiorna esito test" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("routine-state").textContent).toBe(
        "ACTIVE:HELPFUL",
      ),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/coaching/attempts/attempt-1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/chats/chat-1");
    expect(mocks.setMessages).toHaveBeenCalled();
  });

  it("saves the proposal and starts it without sending a second AI turn", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ routine: activeRoutine }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...initialChatData, routines: [activeRoutine] }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderConversation();

    await user.click(screen.getByRole("button", { name: "Prova ora test" }));

    await waitFor(() =>
      expect(screen.getByTestId("routine-action-success")).toBeTruthy(),
    );
    expect(
      screen.getByRole<HTMLInputElement>("textbox", {
        name: "Messaggio di test",
      }).value,
    ).toBe("");
    expect(screen.getByTestId("focus-request").textContent).toBe("0");
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/coaching/routines",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sourceAssistantMessageId: "assistant-new" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/chats/chat-1");
  });

  it("prefills an adaptation request without mutating or sending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderConversation({ ...initialChatData, routines: [activeRoutine] });

    await user.click(
      screen.getByRole("button", { name: "Adatta routine test" }),
    );

    expect(
      screen.getByRole<HTMLInputElement>("textbox", {
        name: "Messaggio di test",
      }).value,
    ).toBe(
      'Vorrei adattare la routine "Reset rapido" dopo l\'ultimo tentativo. Aiutami a renderla più efficace.',
    );
    expect(screen.getByTestId("focus-request").textContent).toBe("1");
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("carries the routine parent when a collection adaptation opens a new chat", async () => {
    const adaptedRoutine: RoutineCardData = {
      ...activeRoutine,
      id: "routine-adapted",
      sourceAssistantMessageId: "assistant-adapted",
    };
    const adaptationMessage = {
      id: "assistant-adapted",
      role: "assistant" as const,
      content: "Proposta adattata",
      parts: [
        { type: "text", text: "Proposta adattata" },
        { type: "data-coachingRoutine", data: activeRoutine.proposal },
      ],
      createdAt: "2026-08-09T10:00:00.000Z",
    };
    const streamedData = {
      ...initialChatData,
      messages: [...initialChatData.messages, adaptationMessage],
      routines: [],
    };
    const savedData = { ...streamedData, routines: [adaptedRoutine] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(streamedData), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ routine: adaptedRoutine }), {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(savedData), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    mocks.consumePendingInitialMessage.mockReturnValueOnce(
      "Vorrei adattare questa routine",
    );
    mocks.consumePendingRoutineChatContext.mockReturnValueOnce({
      mode: "adapt",
      routineId: "routine-1",
    });

    renderConversation();
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledOnce());

    const chatOptions = mocks.captureChatOptions.mock.calls.at(-1)?.[0] as {
      onFinish: () => Promise<void>;
    };
    await act(() => chatOptions.onFinish());
    await userEvent
      .setup()
      .click(
        screen.getByRole("button", { name: "Salva routine adattata test" }),
      );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/coaching/routines",
      expect.objectContaining({
        body: JSON.stringify({
          sourceAssistantMessageId: "assistant-adapted",
          derivedFromRoutineId: "routine-1",
        }),
      }),
    );
  });

  it("binds an adapted proposal to the clicked routine ID when titles are duplicated", async () => {
    const completedAttempt = {
      id: "attempt-1",
      attemptedAt: "2026-08-08T09:00:00.000Z",
      outcome: "HELPFUL" as const,
      outcomeNote: null,
      outcomeRecordedAt: "2026-08-08T09:01:00.000Z",
    };
    const firstRoutine: RoutineCardData = {
      ...activeRoutine,
      id: "routine-1",
      latestAttempt: completedAttempt,
    };
    const clickedRoutine: RoutineCardData = {
      ...firstRoutine,
      id: "routine-2",
      latestAttempt: { ...completedAttempt, id: "attempt-2" },
    };
    const adaptedRoutine: RoutineCardData = {
      ...activeRoutine,
      id: "routine-adapted",
      sourceAssistantMessageId: "assistant-adapted",
    };
    const adaptationMessage = {
      id: "assistant-adapted",
      role: "assistant" as const,
      content: "Proposta adattata",
      parts: [
        { type: "text", text: "Proposta adattata" },
        { type: "data-coachingRoutine", data: activeRoutine.proposal },
      ],
      createdAt: "2026-08-08T10:00:00.000Z",
    };
    const streamedData = {
      ...initialChatData,
      messages: [...initialChatData.messages, adaptationMessage],
      routines: [firstRoutine, clickedRoutine],
    };
    const existingRoutine = {
      ...activeRoutine,
      id: "routine-visible",
      sourceAssistantMessageId: "assistant-new",
    };
    const afterExistingSave = {
      ...streamedData,
      routines: [firstRoutine, clickedRoutine, existingRoutine],
    };
    const afterAdaptedSave = {
      ...streamedData,
      routines: [firstRoutine, clickedRoutine, existingRoutine, adaptedRoutine],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(streamedData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ routine: existingRoutine }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(afterExistingSave), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ routine: adaptedRoutine }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(afterAdaptedSave), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderConversation({
      ...initialChatData,
      routines: [firstRoutine, clickedRoutine],
    });

    await user.click(
      screen.getByRole("button", { name: "Adatta routine test" }),
    );
    await user.click(screen.getByRole("button", { name: "Invia test" }));
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledOnce());
    const chatOptions = mocks.captureChatOptions.mock.calls.at(-1)?.[0] as {
      onFinish: () => Promise<void>;
    };
    await act(() => chatOptions.onFinish());
    await user.click(
      screen.getByRole("button", { name: "Salva routine test" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/coaching/routines",
      expect.objectContaining({
        body: JSON.stringify({ sourceAssistantMessageId: "assistant-new" }),
      }),
    );

    await user.click(
      screen.getByRole("button", { name: "Salva routine adattata test" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/coaching/routines",
      expect.objectContaining({
        body: JSON.stringify({
          sourceAssistantMessageId: "assistant-adapted",
          derivedFromRoutineId: "routine-2",
        }),
      }),
    );
  });

  it("clears an armed adaptation context after an unrelated submission", async () => {
    const adaptedRoutine: RoutineCardData = {
      ...activeRoutine,
      id: "routine-saved",
      sourceAssistantMessageId: "assistant-new",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(initialChatData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ routine: adaptedRoutine }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...initialChatData, routines: [adaptedRoutine] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderConversation({ ...initialChatData, routines: [activeRoutine] });

    await user.click(
      screen.getByRole("button", { name: "Adatta routine test" }),
    );
    await user.click(screen.getByRole("button", { name: "Invia test" }));
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledOnce());
    const chatOptions = mocks.captureChatOptions.mock.calls.at(-1)?.[0] as {
      onFinish: () => Promise<void>;
    };
    await act(() => chatOptions.onFinish());
    const input = screen.getByRole<HTMLInputElement>("textbox", {
      name: "Messaggio di test",
    });
    await user.type(input, "Una richiesta non collegata");
    await user.click(screen.getByRole("button", { name: "Invia test" }));
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledTimes(2));
    await user.click(
      screen.getByRole("button", { name: "Salva routine test" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/coaching/routines",
      expect.objectContaining({
        body: JSON.stringify({ sourceAssistantMessageId: "assistant-new" }),
      }),
    );
  });

  it("archives only after the existing confirmation primitive resolves", async () => {
    const archivedRoutine: RoutineCardData = {
      ...activeRoutine,
      status: "ARCHIVED",
      archivedAt: "2026-08-08T11:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ routine: archivedRoutine }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...initialChatData, routines: [archivedRoutine] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    const nextActiveRoutine: RoutineCardData = {
      ...activeRoutine,
      id: "routine-older-active",
      sourceAssistantMessageId: "assistant-older-active",
    };
    mocks.refreshActiveRoutine.mockResolvedValue(nextActiveRoutine);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderConversation({ ...initialChatData, routines: [activeRoutine] });

    await user.click(
      screen.getByRole("button", { name: "Archivia routine test" }),
    );

    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Archiviare la routine?",
        confirmText: "Archivia",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("routine-state").textContent).toBe(
        "ARCHIVED:NO_OUTCOME",
      ),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/coaching/routines/routine-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "ARCHIVED" }),
      }),
    );
    expect(mocks.refreshActiveRoutine).toHaveBeenCalledOnce();
    expect(mocks.updateActiveRoutine).not.toHaveBeenCalled();
  });

  it.each(["cancel button", "Escape"] as const)(
    "resolves archive cancellation from %s and restores the action without PATCH",
    async (dismissal) => {
      mocks.confirmMode = "dialog";
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      renderConversation({ ...initialChatData, routines: [activeRoutine] });

      await user.click(
        screen.getByRole("button", { name: "Archivia routine test" }),
      );

      expect(
        screen.getByRole<HTMLButtonElement>("button", {
          name: "Archiviazione routine test",
        }).disabled,
      ).toBe(true);

      if (dismissal === "cancel button") {
        await user.click(screen.getByRole("button", { name: "Annulla" }));
      } else {
        fireEvent.keyDown(
          screen.getByRole("dialog", { name: "Archiviare la routine?" }),
          { key: "Escape" },
        );
      }

      await waitFor(() =>
        expect(
          screen.getByRole<HTMLButtonElement>("button", {
            name: "Archivia routine test",
          }).disabled,
        ).toBe(false),
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
