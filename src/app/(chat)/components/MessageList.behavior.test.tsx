// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ChatUIMessage, convertToUIMessages } from "@/lib/chat-client";
import {
  parseRoutineSourceHydrationPayload,
  type RoutineCardData,
} from "@/lib/coaching/routine";
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

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    user: {
      fullName: "Test User",
      imageUrl: "https://images.example.com/test-user.jpg",
    },
  }),
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
  ),
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
  it("renders the signed-in user's profile picture in user message avatars", () => {
    renderMessageList();

    const userRow = document.querySelector('[data-message-role="user"]');
    expect(userRow).not.toBeNull();
    expect(
      within(userRow as HTMLElement)
        .getByRole("img", { name: "Test User" })
        .getAttribute("data-src"),
    ).toBe("https://images.example.com/test-user.jpg");
  });

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

  it("keeps long assistant responses shrinkable inside the mobile viewport", () => {
    const longResponse = "Parola-lunghissima-".repeat(40);

    renderMessageList({
      messages: [
        userMessage,
        {
          ...assistantMessage,
          parts: [{ type: "text", text: longResponse }],
        },
      ],
    });

    const assistantBubble = screen.getByText(longResponse).parentElement;
    expect(assistantBubble?.className).toContain("min-w-0");
    expect(assistantBubble?.className).toContain("max-w-full");
    expect(assistantBubble?.className).toContain("break-words");
  });

  it("renders persisted capability use as generic non-interactive indicators", () => {
    renderMessageList({
      messages: [
        userMessage,
        {
          ...assistantMessage,
          parts: [
            { type: "text", text: "Risposta con contesto." },
            {
              type: "data-aiCapabilities",
              data: {
                capabilities: [
                  "rag",
                  "web",
                  "memory",
                  "recall",
                  "routine",
                  "voice",
                ],
              },
            },
          ],
        } as unknown as ChatUIMessage,
      ],
    });

    const indicators = screen.getByRole("list", {
      name: "Capacità usate",
    });
    for (const label of [
      "Contesto",
      "Ricerca",
      "Memoria",
      "Ricordo",
      "Routine",
      "Voce",
    ]) {
      expect(within(indicators).getByText(label)).toBeTruthy();
    }
    expect(within(indicators).queryByRole("button")).toBeNull();
    expect(within(indicators).queryByRole("link")).toBeNull();
    expect(within(indicators).queryByRole("menu")).toBeNull();
    expect(indicators.textContent).not.toContain("searchRag");
    expect(indicators.textContent).not.toContain("tinyfishSearch");
  });

  it("does not render an indicator group for empty capability metadata", () => {
    renderMessageList({
      messages: [
        {
          ...assistantMessage,
          parts: [
            { type: "text", text: "Risposta." },
            {
              type: "data-aiCapabilities",
              data: { capabilities: [] },
            },
          ],
        } as unknown as ChatUIMessage,
      ],
    });

    expect(screen.queryByRole("list", { name: "Capacità usate" })).toBeNull();
  });

  it("renders a validated proposal without repeating its steps in prose", () => {
    renderMessageList({
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
      screen.getByText("Prova questa routine.").parentElement?.className,
    ).toContain("hidden");
  });

  it("saves the exact proposal source and opens the inline runner", async () => {
    const user = userEvent.setup();
    const onTryRoutineNow = vi.fn().mockResolvedValue(activeRoutine);
    renderMessageList({
      messages: [
        userMessage,
        {
          ...assistantMessage,
          parts: [{ type: "text", text: "Prova questa routine." }, routinePart],
        },
      ],
      onTryRoutineNow,
    });

    await user.click(screen.getByRole("button", { name: "La provo ora" }));

    expect(onTryRoutineNow).toHaveBeenCalledWith("assistant-1");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Chiudi" })).toBeTruthy(),
    );
  });

  it("keeps a routine card renderable when the assistant has no prose part", () => {
    renderMessageList({
      messages: [
        userMessage,
        {
          ...assistantMessage,
          parts: [routinePart],
        },
      ],
    });

    expect(
      screen.getByRole("heading", { name: routineProposal.title }),
    ).toBeTruthy();
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

  it("uses compact actions for both senders and feedback controls", () => {
    renderMessageList();

    const actionButtons = [
      ...screen.getAllByRole("button", {
        name: "Altre azioni sul messaggio",
      }),
      screen.getByRole("button", { name: "Pollice su: risposta utile" }),
      screen.getByRole("button", {
        name: "Pollice giù: risposta non utile",
      }),
    ];

    for (const button of actionButtons) {
      expect(button.className).toContain("h-8");
      expect(button.className).toContain("w-8");
      expect(button.className).not.toContain("h-11");
      expect(button.className).not.toContain("w-11");
    }
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

    const details = screen.getByText("Dettagli tecnici").closest("details");
    expect(details).toBeTruthy();
    expect(details?.hasAttribute("open")).toBe(false);
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

  it("keeps the submitted pending label stable until ready", () => {
    const view = renderMessageList({
      messages: [userMessage],
      status: "submitted",
      isLoading: true,
    });

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

  it("keeps the same assistant row from pending through the first streamed text", () => {
    const view = renderMessageList({
      messages: [userMessage],
      status: "submitted",
      isLoading: true,
      feedbackMessageIds: new Set(),
    });
    const pendingRow = document.querySelector(
      '[data-message-role="assistant"]',
    );

    expect(pendingRow).toBeTruthy();
    expect(
      within(pendingRow as HTMLElement).getByText("Sto preparando la risposta"),
    ).toBeTruthy();
    expect(
      within(pendingRow as HTMLElement).queryByText(
        "La risposta sta arrivando.",
      ),
    ).toBeNull();

    view.rerender(
      <MessageList
        {...view.props}
        messages={[
          userMessage,
          {
            id: "assistant-stream-1",
            role: "assistant",
            parts: [{ type: "text", text: "Eccomi" }],
          },
        ]}
        status="streaming"
        isLoading
        feedbackMessageIds={new Set()}
      />,
    );

    const streamingRow = document.querySelector(
      '[data-message-role="assistant"]',
    );
    expect(streamingRow).toBe(pendingRow);
    expect(
      within(streamingRow as HTMLElement).getByText("Eccomi"),
    ).toBeTruthy();
  });

  it("shows optimistic timestamps before persistence instead of adding them later", () => {
    renderMessageList({
      messages: [userMessage],
      status: "submitted",
      isLoading: true,
      feedbackMessageIds: new Set(),
    });

    const rows = [...document.querySelectorAll("[data-message-role]")];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(within(row as HTMLElement).getByText("Just now")).toBeTruthy();
    }
  });

  it("preserves message rows when streamed ids reconcile to persisted ids", () => {
    const streamedUser = {
      ...userMessage,
      id: "client-turn-1",
    };
    const streamedAssistant = {
      ...assistantMessage,
      id: "assistant-stream-1",
    };
    const view = renderMessageList({
      messages: [streamedUser, streamedAssistant],
      status: "streaming",
      isLoading: true,
      feedbackMessageIds: new Set(),
    });
    const before = [...document.querySelectorAll("[data-message-role]")];

    view.rerender(
      <MessageList
        {...view.props}
        messages={[
          {
            ...streamedUser,
            id: "db-user-1",
            clientMessageId: "client-turn-1",
          } as ChatUIMessage,
          {
            ...streamedAssistant,
            id: "db-assistant-1",
            sourceClientMessageId: "client-turn-1",
          } as ChatUIMessage,
        ]}
        status="ready"
        isLoading={false}
        feedbackMessageIds={new Set(["db-user-1", "db-assistant-1"])}
      />,
    );

    const after = [...document.querySelectorAll("[data-message-role]")];
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });

  it("reveals the assistant footer only after the message is persisted", () => {
    const view = renderMessageList({
      status: "streaming",
      isLoading: true,
      feedbackMessageIds: new Set(),
    });
    const streamingAssistant = document.querySelector(
      '[data-message-role="assistant"]',
    );

    expect(
      within(streamingAssistant as HTMLElement).queryByRole("button", {
        name: "Altre azioni sul messaggio",
      }),
    ).toBeNull();
    const streamingActionsSlot = (
      streamingAssistant as HTMLElement
    ).querySelector("[data-message-actions-slot]");
    expect(streamingActionsSlot).toBeTruthy();
    expect(streamingActionsSlot?.className).toContain("min-h-8");

    view.rerender(
      <MessageList
        {...view.props}
        status="ready"
        isLoading={false}
        feedbackMessageIds={new Set(["assistant-1"])}
      />,
    );
    const persistedAssistant = document.querySelector(
      '[data-message-role="assistant"]',
    ) as HTMLElement;
    expect(
      within(persistedAssistant).getByRole("button", {
        name: "Altre azioni sul messaggio",
      }),
    ).toBeTruthy();
    expect(
      persistedAssistant.querySelector("[data-message-actions-slot]"),
    ).toBe(streamingActionsSlot);
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
