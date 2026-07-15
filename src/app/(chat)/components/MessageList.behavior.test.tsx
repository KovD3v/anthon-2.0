// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatUIMessage } from "@/lib/chat-client";
import { ASSISTANT_READING_MAX_MS } from "../chat/chat-reactivity-ui";
import { MessageList } from "./MessageList";

const mocks = vi.hoisted(() => ({
  copy: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("framer-motion", async () => {
  const React = await import("react");
  const MotionElement = React.forwardRef<
    HTMLElement,
    HTMLAttributes<HTMLElement>
  >(function MotionElement({ children, ...props }, ref) {
    const {
      // Motion-only props are deliberately removed at this test boundary.
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      layout: _layout,
      ...domProps
    } = props as HTMLAttributes<HTMLElement> & Record<string, unknown>;
    return React.createElement("div", { ...domProps, ref }, children);
  });

  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
    m: new Proxy({}, { get: () => MotionElement }),
    useReducedMotion: () => true,
  };
});

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError },
}));

vi.mock("@/hooks/useCopyToClipboard", () => ({
  useCopyToClipboard: () => ({ copy: mocks.copy, copied: false }),
}));

vi.mock("./Attachments", () => ({ AttachmentPreview: () => null }));
vi.mock("./AudioPlayer", () => ({ AudioPlayer: () => null }));
vi.mock("./MemoizedMarkdown", () => ({
  MemoizedMarkdown: ({ content }: { content: string }) => <p>{content}</p>,
}));
vi.mock("./ModelComparisonCard", () => ({ ModelComparisonCard: () => null }));
vi.mock("./VoiceResponse", () => ({ VoiceResponse: () => null }));
vi.mock("./hooks/useMessageVirtualizer", () => ({
  useMessageVirtualizer: (count: number) => ({
    parentRef: { current: null },
    rowVirtualizer: {
      getTotalSize: () => count * 100,
      getVirtualItems: () =>
        Array.from({ length: count }, (_, index) => ({
          index,
          key: index,
          start: index * 100,
        })),
      measureElement: () => undefined,
    },
  }),
}));

const userMessage: ChatUIMessage = {
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text: "Domanda" }],
};

const assistantMessage: ChatUIMessage = {
  id: "assistant-1",
  role: "assistant",
  parts: [{ type: "text", text: "Risposta" }],
};

function renderMessageList(
  overrides: Partial<ComponentProps<typeof MessageList>> = {},
) {
  const props: ComponentProps<typeof MessageList> = {
    messages: [userMessage, assistantMessage],
    status: "ready",
    isLoading: false,
    editingMessageId: null,
    deletingMessageId: null,
    onEditStart: vi.fn(),
    onEditCancel: vi.fn(),
    onEditSave: vi.fn(),
    onEditContentChange: vi.fn(),
    editContent: "",
    onDelete: vi.fn(),
    onRegenerate: vi.fn(),
    feedbackEndpoint: "/api/chat/feedback",
    ...overrides,
  };

  return { ...render(<MessageList {...props} />), props };
}

function okResponse(_input: RequestInfo | URL, _init?: RequestInit) {
  return Promise.resolve(new Response(null, { status: 204 }));
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  mocks.copy.mockReset();
  mocks.toastError.mockReset();
});

describe("MessageList rendered interactions", () => {
  it("submits negative feedback and its selected reason as two requests", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(okResponse);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderMessageList();

    await user.click(
      screen.getByRole("button", { name: "Segna la risposta come non utile" }),
    );
    await user.click(screen.getByRole("button", { name: "Fatto sbagliato" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      messageId: "assistant-1",
      feedback: -1,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      messageId: "assistant-1",
      feedback: -1,
      reason: "wrong_fact",
    });
  });

  it("rolls rejected feedback back and reports the failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const user = userEvent.setup();
    renderMessageList();
    const negativeButton = screen.getByRole("button", {
      name: "Segna la risposta come non utile",
    });

    await user.click(negativeButton);

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce());
    expect(negativeButton.getAttribute("aria-pressed")).toBe("false");
    expect(
      screen.queryByRole("group", { name: /Cosa non ha funzionato/ }),
    ).toBeNull();
  });

  it("removes persisted negative feedback with feedback zero", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(okResponse);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderMessageList({
      messages: [
        userMessage,
        { ...assistantMessage, feedback: -1, feedbackReason: "too_generic" },
      ],
    });

    await user.click(
      await screen.findByRole("button", { name: /Rimuovi feedback/ }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      messageId: "assistant-1",
      feedback: 0,
    });
  });

  it("forwards controlled edit changes, cancellation, and saving", async () => {
    const user = userEvent.setup();
    const { props } = renderMessageList({
      editingMessageId: "user-1",
      editContent: "Bozza",
    });
    const editor = screen.getByRole("textbox", { name: "Modifica messaggio" });

    await user.type(editor, " aggiornata");
    await user.click(screen.getByRole("button", { name: /Cancella/ }));
    await user.click(screen.getByRole("button", { name: /Salva/ }));

    expect(props.onEditContentChange).toHaveBeenCalled();
    expect(props.onEditContentChange).toHaveBeenLastCalledWith("Bozzaa");
    expect(props.onEditCancel).toHaveBeenCalledOnce();
    expect(props.onEditSave).toHaveBeenCalledOnce();
  });

  it("loads older messages on click and exposes the loading state", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    const view = renderMessageList({ hasMoreMessages: true, onLoadMore });

    await user.click(
      screen.getByRole("button", { name: "Carica messaggi precedenti" }),
    );
    expect(onLoadMore).toHaveBeenCalledOnce();

    view.rerender(
      <MessageList
        {...view.props}
        hasMoreMessages
        isLoadingMore
        onLoadMore={onLoadMore}
      />,
    );
    expect(screen.getByText("Carico i messaggi precedenti...")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Carica messaggi precedenti" }),
    ).toBeNull();
  });

  it("advances the submitted pending label and resets it when ready", () => {
    vi.useFakeTimers();
    const view = renderMessageList({
      messages: [userMessage],
      status: "submitted",
      isLoading: true,
    });

    expect(screen.getByText("Leggo il contesto")).toBeTruthy();
    act(() => vi.advanceTimersByTime(ASSISTANT_READING_MAX_MS));
    expect(screen.getByText("Sto preparando la risposta")).toBeTruthy();

    view.rerender(
      <MessageList
        {...view.props}
        messages={[userMessage]}
        status="ready"
        isLoading={false}
      />,
    );
    expect(screen.queryByText("Sto preparando la risposta")).toBeNull();
  });
});
