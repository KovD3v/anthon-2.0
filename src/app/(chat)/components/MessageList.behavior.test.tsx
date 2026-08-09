// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ChatUIMessage, convertToUIMessages } from "@/lib/chat-client";
import {
  parseRoutineSourceHydrationPayload,
  type RoutineCardData,
} from "@/lib/coaching/routine";
import { ASSISTANT_READING_MAX_MS } from "../chat/chat-reactivity-ui";
import { MessageList } from "./MessageList";

const mocks = vi.hoisted(() => ({
  copy: vi.fn(),
  motionLayoutProps: [] as unknown[],
  toastError: vi.fn(),
}));

vi.mock("framer-motion", async () => {
  const React = await import("react");
  const MotionElement = React.forwardRef<
    HTMLElement,
    HTMLAttributes<HTMLElement>
  >(function MotionElement({ children, ...props }, ref) {
    mocks.motionLayoutProps.push(
      (props as HTMLAttributes<HTMLElement> & Record<string, unknown>).layout,
    );
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

const routineProposal = {
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
  formatVersion: 1,
  proposal: routineProposal,
  archivedAt: null,
  latestAttempt: null,
};

const routinePart = {
  type: "data-coachingRoutine" as const,
  data: routineProposal,
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
    routines: [],
    isGuest: false,
    canRenderRoutineCards: true,
    registrationHref: "/sign-up?redirect_url=%2Fchat%2Fchat-1",
    onSaveRoutine: vi.fn().mockResolvedValue(activeRoutine),
    onCreateRoutineAttempt: vi.fn().mockResolvedValue(activeRoutine),
    onSaveRoutineOutcome: vi.fn().mockResolvedValue(activeRoutine),
    onArchiveRoutine: vi.fn().mockResolvedValue(activeRoutine),
    onTryRoutineNow: vi.fn(),
    onAdaptRoutine: vi.fn(),
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
  mocks.motionLayoutProps.length = 0;
  mocks.toastError.mockReset();
});

describe("MessageList rendered interactions", () => {
  it("links plan-ineligible voice fallbacks to pricing", () => {
    renderMessageList({
      messages: [
        userMessage,
        {
          ...assistantMessage,
          voice: {
            isExplicitRequest: true,
            reasonCode: "PLAN_NOT_ELIGIBLE",
          },
        },
      ],
    });

    expect(
      screen.getByRole("link", { name: "Scopri i piani" }).getAttribute("href"),
    ).toBe("/pricing");
  });

  it("does not show the pricing action on ordinary assistant messages", () => {
    renderMessageList();

    expect(screen.queryByRole("link", { name: "Scopri i piani" })).toBeNull();
  });

  it("does not animate measured message geometry", () => {
    renderMessageList();

    expect(mocks.motionLayoutProps).not.toContain(true);
  });

  it("does not animate assistant bubble width while streaming", () => {
    renderMessageList({ status: "streaming", isLoading: true });

    const response = screen.getByText("Risposta");
    expect(response.parentElement?.className).not.toContain("width");
  });

  it("renders a validated proposal after its matching assistant response", () => {
    const { container } = renderMessageList({
      messages: [
        userMessage,
        {
          ...assistantMessage,
          parts: [{ type: "text", text: "Prova questa routine." }, routinePart],
        },
      ],
    });

    expect(screen.getByText("Routine proposta")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: routineProposal.title }),
    ).toBeTruthy();
    expect(
      container.textContent?.indexOf("Prova questa routine."),
    ).toBeLessThan(container.textContent?.indexOf(routineProposal.title) ?? -1);
  });

  it("renders a repeated routine as the existing active routine without save", () => {
    const regeneratedProposal = {
      ...routineProposal,
      title: "Nuova routine generata per errore",
    };

    renderMessageList({
      messages: [
        userMessage,
        {
          ...assistantMessage,
          parts: [
            { type: "text", text: "Ripartiamo dalla routine salvata." },
            { type: "data-coachingRoutine", data: regeneratedProposal },
          ],
        },
      ],
      reusedRoutine: activeRoutine,
    });

    expect(screen.getByText("Routine attiva")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: routineProposal.title }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: regeneratedProposal.title }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Salva routine" })).toBeNull();
  });

  it("renders a repeated routine card before any assistant response", () => {
    renderMessageList({ messages: [], reusedRoutine: activeRoutine });

    expect(
      screen.getAllByRole("heading", { name: routineProposal.title }),
    ).toHaveLength(2);
    expect(screen.getByText("Routine pronta")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Salva routine" })).toBeNull();
  });

  it("renders a canonical hydrated card without retaining unsafe attachment fields", async () => {
    const parsed = parseRoutineSourceHydrationPayload(
      {
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            parts: [
              { type: "text", text: "Prova questa routine." },
              routinePart,
            ],
            createdAt: "2026-08-08T10:00:00.000Z",
            attachments: [{}],
          },
        ],
        routines: [
          {
            ...activeRoutine,
            latestAttempt: {
              id: "attempt-1",
              attemptedAt: "2026-08-08T09:00:00.000Z",
              outcome: null,
              outcomeNote: null,
              outcomeRecordedAt: null,
            },
          },
        ],
      },
      {
        routineId: "routine-1",
        sourceChatId: "chat-1",
        sourceAssistantMessageId: "assistant-1",
      },
    );

    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error("Expected canonical routine source data");
    renderMessageList({
      messages: convertToUIMessages([parsed.message]),
      routines: [parsed.routine],
      openCheckInRoutineId: "routine-1",
    });

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Aggiungi dettagli" }));
    expect(
      screen.getByRole("textbox", { name: "Racconta com'è andata" }),
    ).toBeTruthy();
  });

  it("passes the clicked persisted routine ID with its title when adapting", async () => {
    const user = userEvent.setup();
    const onAdaptRoutine = vi.fn();
    renderMessageList({
      messages: [
        {
          ...assistantMessage,
          parts: [{ type: "text", text: "Prova questa routine." }, routinePart],
        },
      ],
      routines: [
        {
          ...activeRoutine,
          latestAttempt: {
            id: "attempt-1",
            attemptedAt: "2026-08-08T10:00:00.000Z",
            outcome: "HELPFUL",
            outcomeNote: null,
            outcomeRecordedAt: "2026-08-08T10:00:00.000Z",
          },
        },
      ],
      onAdaptRoutine,
    });

    await user.click(screen.getByRole("button", { name: "Adatta la routine" }));

    expect(onAdaptRoutine).toHaveBeenCalledWith(
      "routine-1",
      routineProposal.title,
    );
  });

  it.each([
    [
      "malformed proposal",
      {
        ...assistantMessage,
        parts: [
          { type: "text" as const, text: "Proposta incompleta" },
          {
            type: "data-coachingRoutine" as const,
            data: { ...routineProposal, steps: ["Un solo passo"] },
          },
        ],
      },
      true,
    ],
    [
      "user message",
      {
        ...userMessage,
        parts: [{ type: "text" as const, text: "Io" }, routinePart],
      },
      true,
    ],
    [
      "comparison response",
      {
        ...assistantMessage,
        parts: [
          { type: "text" as const, text: "Confronto" },
          routinePart,
          {
            type: "data-modelComparison" as const,
            data: {
              pairId: "pair-1",
              noticeRequired: false,
              status: "ready" as const,
              slots: {
                A: { status: "completed" as const, text: "A" },
                B: { status: "completed" as const, text: "B" },
              },
            },
          },
        ],
      },
      true,
    ],
    [
      "audio response",
      {
        ...assistantMessage,
        parts: [
          { type: "text" as const, text: "Trascrizione audio" },
          {
            type: "file" as const,
            mediaType: "audio/mpeg",
            url: "/audio.mp3",
          },
          routinePart,
        ],
      },
      true,
    ],
    [
      "public payload",
      {
        ...assistantMessage,
        parts: [{ type: "text" as const, text: "Pubblico" }, routinePart],
      },
      false,
    ],
  ])("does not render a routine card for a %s", (_case, message, canRender) => {
    renderMessageList({
      messages: [message as ChatUIMessage],
      canRenderRoutineCards: canRender,
    });

    expect(screen.queryByText("Routine proposta")).toBeNull();
  });

  it("never attaches a routine sourced from another assistant message", () => {
    renderMessageList({
      messages: [
        {
          ...assistantMessage,
          parts: [{ type: "text", text: "Proposta" }, routinePart],
        },
      ],
      routines: [
        { ...activeRoutine, sourceAssistantMessageId: "assistant-other" },
      ],
    });

    expect(screen.getByText("Routine proposta")).toBeTruthy();
    expect(screen.queryByText("Routine attiva")).toBeNull();
  });

  it("shows feedback only for persisted message ids", () => {
    const view = renderMessageList({ feedbackMessageIds: new Set() });

    expect(
      screen.queryByRole("button", { name: "Pollice su: risposta utile" }),
    ).toBeNull();

    view.rerender(
      <MessageList
        {...view.props}
        feedbackMessageIds={new Set(["assistant-1"])}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Pollice su: risposta utile" }),
    ).toBeTruthy();
  });

  it("uses icon-only accessible feedback controls and persists positive feedback", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(okResponse);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderMessageList();

    const positiveButton = screen.getByRole("button", {
      name: "Pollice su: risposta utile",
    });
    const negativeButton = screen.getByRole("button", {
      name: "Pollice giù: risposta non utile",
    });

    expect(positiveButton.textContent).toBe("");
    expect(negativeButton.textContent).toBe("");
    expect(positiveButton.getAttribute("aria-pressed")).toBe("false");
    expect(negativeButton.getAttribute("aria-pressed")).toBe("false");

    await user.click(positiveButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      messageId: "assistant-1",
      feedback: 1,
    });
    expect(positiveButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders technical details only from message annotations, never raw metadata", () => {
    const rawMetadataMessage = {
      ...assistantMessage,
      metadata: {
        inputTokens: 40,
        outputTokens: 37,
        cost: 0.01,
        generationTimeMs: 500,
        reasoningTimeMs: 75,
      },
    } as ChatUIMessage;
    const annotatedMessage = {
      ...assistantMessage,
      annotations: [
        {
          inputTokens: 40,
          outputTokens: 37,
          cost: 0.01,
          generationTimeMs: 500,
        },
      ],
    } as ChatUIMessage;
    const view = renderMessageList({ messages: [rawMetadataMessage] });

    expect(screen.queryByText("77 tokens")).toBeNull();
    expect(screen.queryByText("Dettagli tecnici")).toBeNull();

    view.rerender(
      <MessageList {...view.props} messages={[annotatedMessage]} />,
    );

    expect(screen.getByText("Dettagli tecnici")).toBeTruthy();
  });

  it("keeps secondary message actions in the overflow menu", async () => {
    const user = userEvent.setup();
    const assistantView = renderMessageList({ messages: [assistantMessage] });

    await user.click(
      screen.getByRole("button", { name: "Altre azioni sul messaggio" }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Copia messaggio" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: "Rigenera risposta" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("menuitem", { name: "Copia messaggio" }));
    expect(mocks.copy).toHaveBeenCalledWith("Risposta");

    await user.click(
      screen.getByRole("button", { name: "Altre azioni sul messaggio" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Rigenera risposta" }),
    );
    expect(assistantView.props.onRegenerate).toHaveBeenCalledOnce();

    assistantView.unmount();
    const userView = renderMessageList({ messages: [userMessage] });
    await user.click(
      screen.getByRole("button", { name: "Altre azioni sul messaggio" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Modifica messaggio" }),
    );
    expect(userView.props.onEditStart).toHaveBeenCalledWith(
      "user-1",
      "Domanda",
    );

    await user.click(
      screen.getByRole("button", { name: "Altre azioni sul messaggio" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Elimina messaggio" }),
    );
    expect(userView.props.onDelete).toHaveBeenCalledWith("user-1");
  });

  it("submits negative feedback and its selected reason as two requests", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(okResponse);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderMessageList();

    await user.click(
      screen.getByRole("button", {
        name: "Pollice giù: risposta non utile",
      }),
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
      name: "Pollice giù: risposta non utile",
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

  it("shows a dedicated replacement state while regenerating", () => {
    renderMessageList({
      messages: [userMessage],
      isLoading: true,
      isRegenerating: true,
    });

    expect(screen.getByText("Rigenero la risposta")).toBeTruthy();
    expect(
      screen.getByText("Sostituisco la risposta precedente."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Rigenera risposta" }),
    ).toBeNull();
  });
});
