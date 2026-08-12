// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutineCardData } from "@/lib/coaching/routine";
import type { Chat, UsageData } from "@/types/chat";
import { LayoutClient, useChatContext } from "./layout-client";

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
  fetchActiveRoutineForReturn: vi.fn(),
  fetchRoutineCollection: vi.fn(),
  pathname: "/chat/source-chat",
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: { id: "user-1" } }),
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
  }: {
    children: React.ReactNode;
    href: string;
    onClick?: () => void;
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({
    push: mocks.routerPush,
    prefetch: vi.fn(),
    refresh: mocks.routerRefresh,
  }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/hooks/use-confirm", () => ({
  useConfirm: () => ({
    confirm: vi.fn().mockResolvedValue(true),
    isOpen: false,
    options: {},
    handleConfirm: vi.fn(),
    setIsOpen: vi.fn(),
  }),
}));
vi.mock("@/hooks/useKeyboardShortcut", () => ({
  useKeyboardShortcut: () => undefined,
}));
vi.mock("@/lib/document-scroll-lock", () => ({
  installDocumentScrollLock: () => () => undefined,
}));
vi.mock("@/lib/visual-viewport", () => ({
  installChatViewportSizing: () => () => undefined,
}));
vi.mock("@/lib/coaching/routine-client", () => ({
  fetchActiveRoutineForReturn: mocks.fetchActiveRoutineForReturn,
  fetchRoutineCollection: mocks.fetchRoutineCollection,
}));
vi.mock("../components/ChatList", () => ({
  ChatList: ({ onDelete }: { onDelete: (id: string) => Promise<boolean> }) => (
    <button type="button" onClick={() => void onDelete("source-chat")}>
      Elimina chat sorgente
    </button>
  ),
}));
vi.mock("../components/SidebarBottom", () => ({ SidebarBottom: () => null }));
vi.mock("../components/UsageBanner", () => ({ UsageBanner: () => null }));
vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));

const proposal = {
  title: "Reset rapido",
  trigger: "Dopo un errore",
  durationLabel: null,
  steps: ["Fermati", "Espira"],
  completionCue: "Riparti",
};

const sourceRoutine: RoutineCardData = {
  id: "routine-source",
  sourceChatId: "source-chat",
  sourceAssistantMessageId: "assistant-source",
  status: "ACTIVE",
  formatVersion: 1,
  proposal,
  archivedAt: null,
  latestAttempt: null,
};

function RoutineProbe() {
  const { activeRoutine, refreshActiveRoutine, openRoutineCheckIn } =
    useChatContext();
  return (
    <div>
      <output data-testid="active-routine">
        {activeRoutine
          ? `${activeRoutine.id}:${activeRoutine.sourceChatId ?? "orphan"}`
          : "NONE"}
      </output>
      <button type="button" onClick={() => void refreshActiveRoutine()}>
        Aggiorna routine
      </button>
      <button
        type="button"
        onClick={() => activeRoutine && openRoutineCheckIn(activeRoutine)}
      >
        Apri check-in
      </button>
    </div>
  );
}

function RoutineCollectionProbe() {
  const {
    routineCollection,
    refreshRoutineCollection,
    loadMoreRoutineCollection,
  } = useChatContext();
  return (
    <div>
      <output data-testid="routine-collection">
        {routineCollection.routines.map((routine) => routine.id).join("|")}
      </output>
      <output data-testid="routine-active-total">
        {routineCollection.active.total ?? "unknown"}
      </output>
      <button type="button" onClick={() => void refreshRoutineCollection()}>
        Aggiorna raccolta routine
      </button>
      <button
        type="button"
        onClick={() => void loadMoreRoutineCollection("ACTIVE")}
      >
        Carica pagina attive
      </button>
    </div>
  );
}

function RoutineChatProbe() {
  const {
    createRoutineChat,
    consumePendingInitialMessage,
    consumePendingRoutineChatContext,
  } = useChatContext();
  const [chatId, setChatId] = useState("NONE");
  const [context, setContext] = useState("NONE");
  const [initialMessage, setInitialMessage] = useState("NONE");
  return (
    <div>
      <output data-testid="routine-chat-id">{chatId}</output>
      <output data-testid="routine-chat-context">{context}</output>
      <output data-testid="routine-chat-initial-message">
        {initialMessage}
      </output>
      <button
        type="button"
        onClick={() =>
          void createRoutineChat(sourceRoutine, "adapt").then((id) =>
            setChatId(id ?? "NONE"),
          )
        }
      >
        Crea chat routine
      </button>
      <button
        type="button"
        onClick={() =>
          void createRoutineChat(sourceRoutine, "repeat").then((id) =>
            setChatId(id ?? "NONE"),
          )
        }
      >
        Crea ripetizione routine
      </button>
      <button
        type="button"
        onClick={() => {
          const pending = consumePendingRoutineChatContext("new-routine-chat");
          setContext(pending ? `${pending.mode}:${pending.routineId}` : "NONE");
        }}
      >
        Consuma contesto routine
      </button>
      <button
        type="button"
        onClick={() =>
          setInitialMessage(
            consumePendingInitialMessage("new-routine-chat") ?? "NONE",
          )
        }
      >
        Consuma messaggio iniziale
      </button>
    </div>
  );
}

function ChatStateProbe() {
  const { chats, createChat, renameChat } = useChatContext();
  return (
    <div>
      <output data-testid="chat-state">
        {chats.map((chat) => `${chat.id}:${chat.title}:${chat.icon}`).join("|")}
      </output>
      <button type="button" onClick={() => void createChat()}>
        Crea chat
      </button>
      <button
        type="button"
        onClick={() => void renameChat("source-chat", "Titolo rinominato")}
      >
        Rinomina chat
      </button>
    </div>
  );
}

function SidebarDataProbe() {
  const { hydrateSidebarData } = useChatContext();

  useEffect(() => {
    hydrateSidebarData({
      chats: [
        {
          id: "hydrated-chat",
          title: "Chat caricata",
          icon: "BRAIN",
          visibility: "PRIVATE",
          createdAt: "2026-08-08T08:00:00.000Z",
          updatedAt: "2026-08-08T09:00:00.000Z",
          messageCount: 3,
        },
      ],
      usageData: null,
      coachingGoal: "Restare lucido",
      activeRoutine: null,
      routinesEnabled: true,
      isGuest: false,
      guestConversionPending: false,
    });
  }, [hydrateSidebarData]);

  return null;
}

function renderLayout(
  initialActiveRoutine: RoutineCardData | null,
  children: React.ReactNode = <RoutineProbe />,
  initialRoutinesEnabled = true,
) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1024,
  });
  return render(
    <LayoutClient
      initialChats={[
        {
          id: "source-chat",
          title: "Chat sorgente",
          icon: "BRAIN",
          visibility: "PRIVATE",
          createdAt: "2026-08-08T08:00:00.000Z",
          updatedAt: "2026-08-08T09:00:00.000Z",
          messageCount: 2,
        },
      ]}
      initialUsageData={null}
      initialCoachingGoal={null}
      initialActiveRoutine={initialActiveRoutine}
      initialRoutinesEnabled={initialRoutinesEnabled}
      guestConversionPending={false}
      isGuest={false}
    >
      {children}
    </LayoutClient>,
  );
}

function renderLanding({
  isGuest,
  usageData,
  children = <div>Landing chat</div>,
}: {
  isGuest: boolean;
  usageData: UsageData | null;
  children?: React.ReactNode;
}) {
  return render(
    <LayoutClient
      initialChats={[]}
      initialUsageData={usageData}
      initialCoachingGoal={null}
      initialActiveRoutine={null}
      guestConversionPending={false}
      isGuest={isGuest}
    >
      {children}
    </LayoutClient>,
  );
}

it("hydrates sidebar data without blocking the conversation child", async () => {
  const initialChats: Chat[] = [];

  render(
    <LayoutClient
      initialChats={initialChats}
      initialUsageData={null}
      initialCoachingGoal={null}
      initialActiveRoutine={null}
      initialRoutinesEnabled={false}
      guestConversionPending={false}
      isGuest={false}
      sidebarSlot={<SidebarDataProbe />}
    >
      <div data-testid="conversation-child">Conversation content</div>
      <ChatStateProbe />
    </LayoutClient>,
  );

  expect(screen.getByTestId("conversation-child")).toBeTruthy();

  await waitFor(() => {
    expect(screen.getByTestId("chat-state").textContent).toContain(
      "hydrated-chat:Chat caricata:BRAIN",
    );
  });
});

it("defers the initial usage refresh until after the first render task", async () => {
  vi.useFakeTimers();
  try {
    const fetchMock = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    renderLanding({ isGuest: false, usageData: null });

    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/usage\?t=/),
      expect.objectContaining({ cache: "no-store" }),
    );
  } finally {
    vi.useRealTimers();
  }
});

function GuestNoticeProbe() {
  const { guestConversationNotice } = useChatContext();
  return (
    <output data-testid="guest-conversation-notice">
      {guestConversationNotice
        ? `${guestConversationNotice.registrationHref}:${guestConversationNotice.remaining ?? "UNKNOWN"}`
        : "NONE"}
    </output>
  );
}

const usageBelowThreshold: UsageData = {
  usage: {
    requestCount: 1,
    inputTokens: 10,
    outputTokens: 10,
    totalCostUsd: 0,
  },
  limits: {
    maxRequests: 10,
    maxInputTokens: 1_000,
    maxOutputTokens: 1_000,
    maxCostUsd: 1,
  },
  tier: "BASIC",
  subscriptionStatus: "ACTIVE",
};

function deferredRoutine() {
  let resolve: (routine: RoutineCardData | null) => void = () => undefined;
  const promise = new Promise<RoutineCardData | null>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function deferredRoutineCollection() {
  let resolve: (collection: {
    routines: RoutineCardData[];
    total: number;
    nextCursor: null;
  }) => void = () => undefined;
  const promise = new Promise<{
    routines: RoutineCardData[];
    total: number;
    nextCursor: null;
  }>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchRoutineCollection.mockResolvedValue({
    routines: [],
    total: 0,
    nextCursor: null,
  });
  mocks.pathname = "/chat/source-chat";
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 375,
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === "(max-width: 767px)" && window.innerWidth <= 767,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (
        String(input) === "/api/chats/source-chat" &&
        init?.method === "DELETE"
      ) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (String(input) === "/api/chats") {
        return new Response(JSON.stringify({ chats: [] }), { status: 200 });
      }
      if (String(input).startsWith("/api/chats/search?")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "message-result",
                content: "Risposta trovata",
                role: "ASSISTANT",
                createdAt: "2026-08-08T10:00:00.000Z",
                chatId: "chat-result",
                chatTitle: "Chat trovata",
                snippet: "Risposta trovata",
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(null, { status: 500 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("conversation icon state", () => {
  it("preserves the icon when a chat is renamed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).startsWith("/api/usage"))
          return new Response(null, { status: 500 });
        return Response.json({
          id: "source-chat",
          title: "Titolo rinominato",
          icon: "BRAIN",
        });
      }),
    );
    const user = userEvent.setup();
    renderLayout(null, <ChatStateProbe />);

    await user.click(screen.getByRole("button", { name: "Rinomina chat" }));

    await waitFor(() =>
      expect(screen.getByTestId("chat-state").textContent).toContain(
        "source-chat:Titolo rinominato:BRAIN",
      ),
    );
  });

  it("uses the API icon for a newly created chat", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).startsWith("/api/usage"))
          return new Response(null, { status: 500 });
        return Response.json(
          {
            id: "chat-new",
            title: "Preparazione maratona",
            icon: "FOOTPRINTS",
            visibility: "PRIVATE",
            createdAt: "2026-08-08T10:00:00.000Z",
            updatedAt: "2026-08-08T10:00:00.000Z",
          },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    renderLayout(null, <ChatStateProbe />);

    await user.click(screen.getByRole("button", { name: "Crea chat" }));

    await waitFor(() =>
      expect(screen.getByTestId("chat-state").textContent).toContain(
        "chat-new:Preparazione maratona:FOOTPRINTS",
      ),
    );
  });
});

describe("persistent active routine context", () => {
  it("uses the authoritative orphan selector after deleting the source chat", async () => {
    const orphanRoutine = {
      ...sourceRoutine,
      sourceChatId: null,
      sourceAssistantMessageId: null,
    };
    mocks.fetchActiveRoutineForReturn.mockResolvedValue(orphanRoutine);
    const user = userEvent.setup();
    renderLayout(sourceRoutine);

    await user.click(
      screen.getByRole("button", { name: "Elimina chat sorgente" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("active-routine").textContent).toBe(
        "routine-source:orphan",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Apri check-in" }));
    expect(mocks.routerPush).toHaveBeenLastCalledWith(
      "/chat?checkInRoutineId=routine-source",
      { scroll: false },
    );
  });

  it("reveals the authoritative next active routine after the selected one is archived", async () => {
    const nextActiveRoutine = {
      ...sourceRoutine,
      id: "routine-next-active",
      sourceChatId: "next-chat",
      sourceAssistantMessageId: "assistant-next",
    };
    mocks.fetchActiveRoutineForReturn.mockResolvedValue(nextActiveRoutine);
    const user = userEvent.setup();
    renderLayout(sourceRoutine);

    await user.click(screen.getByRole("button", { name: "Aggiorna routine" }));

    await waitFor(() =>
      expect(screen.getByTestId("active-routine").textContent).toBe(
        "routine-next-active:next-chat",
      ),
    );
  });

  it("ignores an older selector response that resolves after a newer refresh", async () => {
    const first = deferredRoutine();
    const second = deferredRoutine();
    mocks.fetchActiveRoutineForReturn
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const newerRoutine = {
      ...sourceRoutine,
      id: "routine-newer",
      sourceChatId: "newer-chat",
    };
    const olderRoutine = {
      ...sourceRoutine,
      id: "routine-older",
      sourceChatId: "older-chat",
    };
    const user = userEvent.setup();
    renderLayout(sourceRoutine);

    await user.click(screen.getByRole("button", { name: "Aggiorna routine" }));
    await user.click(screen.getByRole("button", { name: "Aggiorna routine" }));
    second.resolve(newerRoutine);
    await waitFor(() =>
      expect(screen.getByTestId("active-routine").textContent).toBe(
        "routine-newer:newer-chat",
      ),
    );
    first.resolve(olderRoutine);

    await waitFor(() =>
      expect(screen.getByTestId("active-routine").textContent).toBe(
        "routine-newer:newer-chat",
      ),
    );
  });
});

describe("routine sidebar collection context", () => {
  it("opens a repeat chat with saved context but no pending AI message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/chats" && init?.method === "POST") {
          return Response.json({
            id: "new-routine-chat",
            title: "Ripeti: Reset rapido",
            icon: "REFRESH_CCW",
            visibility: "PRIVATE",
            createdAt: "2026-08-09T10:00:00.000Z",
            updatedAt: "2026-08-09T10:00:00.000Z",
          });
        }
        return new Response(null, { status: 500 });
      }),
    );
    const user = userEvent.setup();
    renderLayout(sourceRoutine, <RoutineChatProbe />);

    await user.click(
      screen.getByRole("button", { name: "Crea ripetizione routine" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("routine-chat-id").textContent).toBe(
        "new-routine-chat",
      ),
    );

    await user.click(
      screen.getByRole("button", { name: "Consuma contesto routine" }),
    );
    expect(screen.getByTestId("routine-chat-context").textContent).toBe(
      "repeat:routine-source",
    );
    await user.click(
      screen.getByRole("button", { name: "Consuma messaggio iniziale" }),
    );
    expect(screen.getByTestId("routine-chat-initial-message").textContent).toBe(
      "NONE",
    );
  });

  it("creates a new routine chat and consumes its adapt context once", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/chats" && init?.method === "POST") {
          return Response.json({
            id: "new-routine-chat",
            title: "Adatta: Reset rapido",
            icon: "BRAIN",
            visibility: "PRIVATE",
            createdAt: "2026-08-09T10:00:00.000Z",
            updatedAt: "2026-08-09T10:00:00.000Z",
          });
        }
        return new Response(null, { status: 500 });
      }),
    );
    const user = userEvent.setup();
    renderLayout(sourceRoutine, <RoutineChatProbe />);

    await user.click(screen.getByRole("button", { name: "Crea chat routine" }));
    await waitFor(() =>
      expect(screen.getByTestId("routine-chat-id").textContent).toBe(
        "new-routine-chat",
      ),
    );
    expect(mocks.routerPush).toHaveBeenCalledWith("/chat/new-routine-chat", {
      scroll: false,
    });

    await user.click(
      screen.getByRole("button", { name: "Consuma contesto routine" }),
    );
    expect(screen.getByTestId("routine-chat-context").textContent).toBe(
      "adapt:routine-source",
    );
    await user.click(
      screen.getByRole("button", { name: "Consuma contesto routine" }),
    );
    expect(screen.getByTestId("routine-chat-context").textContent).toBe("NONE");
  });

  it("loads only an authenticated collection and keeps sidebar regions stable", async () => {
    mocks.fetchRoutineCollection
      .mockResolvedValueOnce({
        routines: [sourceRoutine],
        total: 1,
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        routines: [],
        total: 0,
        nextCursor: null,
      });

    renderLayout(sourceRoutine, <RoutineCollectionProbe />);

    await waitFor(() =>
      expect(screen.getByTestId("routine-collection").textContent).toBe(
        "routine-source",
      ),
    );
    expect(mocks.fetchRoutineCollection).toHaveBeenNthCalledWith(1, {
      status: "ACTIVE",
      limit: 12,
    });
    expect(mocks.fetchRoutineCollection).toHaveBeenNthCalledWith(2, {
      status: "ARCHIVED",
      limit: 12,
    });

    const header = screen.getByTestId("sidebar-header-actions");
    const chats = screen.getByTestId("sidebar-chat-list");
    const shelf = screen.getByTestId("routine-sidebar-shelf");
    const profile = screen.getByTestId("sidebar-profile");
    expect(chats.className).toContain("flex");
    expect(chats.className).toContain("flex-col");
    expect(chats.className).toContain("min-h-0");
    expect(shelf.className).toContain("shrink-0");
    expect(
      header.compareDocumentPosition(shelf) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      shelf.compareDocumentPosition(profile) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("does not expose or fetch a routine collection for guests", async () => {
    mocks.pathname = "/chat";
    renderLanding({ isGuest: true, usageData: usageBelowThreshold });

    await waitFor(() =>
      expect(screen.queryByTestId("routine-sidebar-shelf")).toBeNull(),
    );
    expect(mocks.fetchRoutineCollection).not.toHaveBeenCalled();
  });

  it("hides the empty routine shelf while the rollout flag is disabled", async () => {
    renderLayout(null, <RoutineCollectionProbe />, false);

    await waitFor(() =>
      expect(screen.queryByTestId("routine-sidebar-shelf")).toBeNull(),
    );
  });

  it("shows a quiet retry when collection loading fails", async () => {
    mocks.fetchRoutineCollection
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ routines: [], total: 0, nextCursor: null })
      .mockResolvedValue({
        routines: [sourceRoutine],
        total: 1,
        nextCursor: null,
      });
    const user = userEvent.setup();
    renderLayout(sourceRoutine);

    await screen.findByRole("button", { name: "Riprova routine" });
    await user.click(screen.getByRole("button", { name: "Riprova routine" }));
    await waitFor(() => expect(screen.getByText("1 attiva")).toBeTruthy());
  });

  it("ignores an older collection response after a newer refresh", async () => {
    const firstActive = deferredRoutineCollection();
    const firstArchived = deferredRoutineCollection();
    const secondActive = deferredRoutineCollection();
    const secondArchived = deferredRoutineCollection();
    mocks.fetchRoutineCollection
      .mockReturnValueOnce(firstActive.promise)
      .mockReturnValueOnce(firstArchived.promise)
      .mockReturnValueOnce(secondActive.promise)
      .mockReturnValueOnce(secondArchived.promise);
    const user = userEvent.setup();
    renderLayout(sourceRoutine, <RoutineCollectionProbe />);

    await user.click(
      screen.getByRole("button", { name: "Aggiorna raccolta routine" }),
    );
    secondActive.resolve({
      routines: [{ ...sourceRoutine, id: "routine-newer" }],
      total: 1,
      nextCursor: null,
    });
    secondArchived.resolve({ routines: [], total: 0, nextCursor: null });
    await waitFor(() =>
      expect(screen.getByTestId("routine-collection").textContent).toBe(
        "routine-newer",
      ),
    );

    firstActive.resolve({
      routines: [{ ...sourceRoutine, id: "routine-older" }],
      total: 1,
      nextCursor: null,
    });
    firstArchived.resolve({ routines: [], total: 0, nextCursor: null });
    await waitFor(() =>
      expect(screen.getByTestId("routine-collection").textContent).toBe(
        "routine-newer",
      ),
    );
  });

  it("appends a cursor page without changing the authoritative active total", async () => {
    mocks.fetchRoutineCollection
      .mockResolvedValueOnce({
        routines: [sourceRoutine],
        total: 13,
        nextCursor: "active-next",
      })
      .mockResolvedValueOnce({ routines: [], total: 0, nextCursor: null })
      .mockResolvedValueOnce({
        routines: [{ ...sourceRoutine, id: "routine-13" }],
        total: 13,
        nextCursor: null,
      });
    const user = userEvent.setup();
    renderLayout(sourceRoutine, <RoutineCollectionProbe />);

    await waitFor(() =>
      expect(screen.getByTestId("routine-active-total").textContent).toBe("13"),
    );
    await user.click(
      screen.getByRole("button", { name: "Carica pagina attive" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("routine-collection").textContent).toBe(
        "routine-source|routine-13",
      ),
    );
    expect(screen.getByTestId("routine-active-total").textContent).toBe("13");
  });

  it("keeps collection metadata and ignores a stale active page after refresh", async () => {
    const stalePage = deferredRoutineCollection();
    mocks.fetchRoutineCollection
      .mockResolvedValueOnce({
        routines: [sourceRoutine],
        total: 13,
        nextCursor: "active-next",
      })
      .mockResolvedValueOnce({ routines: [], total: 0, nextCursor: null })
      .mockReturnValueOnce(stalePage.promise)
      .mockResolvedValueOnce({
        routines: [{ ...sourceRoutine, id: "routine-fresh" }],
        total: 1,
        nextCursor: null,
      })
      .mockResolvedValueOnce({ routines: [], total: 0, nextCursor: null });
    const user = userEvent.setup();
    renderLayout(sourceRoutine, <RoutineCollectionProbe />);

    await waitFor(() =>
      expect(screen.getByTestId("routine-active-total").textContent).toBe("13"),
    );
    await user.click(
      screen.getByRole("button", { name: "Carica pagina attive" }),
    );
    expect(mocks.fetchRoutineCollection).toHaveBeenLastCalledWith({
      status: "ACTIVE",
      cursor: "active-next",
      limit: 12,
    });
    await user.click(
      screen.getByRole("button", { name: "Aggiorna raccolta routine" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("routine-collection").textContent).toBe(
        "routine-fresh",
      ),
    );

    stalePage.resolve({
      routines: [{ ...sourceRoutine, id: "routine-stale-page" }],
      total: 13,
      nextCursor: null,
    });
    await waitFor(() =>
      expect(screen.getByTestId("routine-collection").textContent).toBe(
        "routine-fresh",
      ),
    );
  });
});

describe("mobile chat landing navigation", () => {
  it("exposes the compact routine collection link in the mobile shelf", async () => {
    mocks.pathname = "/chat";
    mocks.fetchRoutineCollection
      .mockResolvedValueOnce({
        routines: [sourceRoutine],
        total: 1,
        nextCursor: null,
      })
      .mockResolvedValueOnce({ routines: [], total: 0, nextCursor: null });
    const user = userEvent.setup();
    renderLanding({ isGuest: false, usageData: usageBelowThreshold });

    const opener = screen.getByRole("button", {
      name: "Apri la barra laterale",
    });
    opener.focus();
    await user.click(opener);
    const drawer = await screen.findByRole("dialog", {
      name: "Conversazioni",
    });
    const routineLink = within(drawer).getByRole("link", { name: /Routine/ });
    expect(routineLink.getAttribute("href")).toBe("/chat/routines");
    expect(within(drawer).queryByText("Reset rapido")).toBeNull();
    expect(
      within(drawer).queryByRole("button", { name: "Espandi routine" }),
    ).toBeNull();
    await user.click(
      within(drawer).getByRole("button", { name: "Chiudi la barra laterale" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Conversazioni" }),
      ).toBeNull(),
    );
    expect(document.activeElement).toBe(opener);
  });

  it("closes the mobile sheet only after selecting a search result", async () => {
    mocks.pathname = "/chat";
    const user = userEvent.setup();
    renderLanding({
      isGuest: false,
      usageData: usageBelowThreshold,
    });

    await user.click(
      screen.getByRole("button", { name: "Apri la barra laterale" }),
    );
    const sheet = await screen.findByRole("dialog", {
      name: "Conversazioni",
    });
    const searchTrigger = within(sheet).getByRole("button", {
      name: "Cerca nelle conversazioni",
    });

    await user.click(searchTrigger);
    await screen.findByRole("dialog", {
      name: "Cerca nelle conversazioni",
    });
    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Cerca nelle conversazioni" }),
      ).toBeNull(),
    );
    expect(screen.getByRole("dialog", { name: "Conversazioni" })).toBeTruthy();
    expect(document.activeElement).toBe(searchTrigger);

    await user.click(searchTrigger);
    await user.type(
      screen.getByRole("textbox", { name: "Cerca nei messaggi" }),
      "co",
    );
    await user.click(
      await screen.findByRole("button", { name: /Chat trovata/ }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Conversazioni" }),
      ).toBeNull(),
    );
    expect(mocks.routerPush).toHaveBeenLastCalledWith("/chat/chat-result");
  });

  it("traps mobile sidebar focus and returns it to the opener after Escape", async () => {
    mocks.pathname = "/chat";
    const user = userEvent.setup();
    renderLanding({
      isGuest: true,
      usageData: { ...usageBelowThreshold, tier: "GUEST" },
      children: <a href="/help">Contenuto principale</a>,
    });

    const opener = screen.getByRole("button", {
      name: "Apri la barra laterale",
    });
    const mainContentLink = screen.getByText("Contenuto principale");
    expect(
      screen.queryByRole("button", { name: "Chiudi la barra laterale" }),
    ).toBeNull();
    opener.focus();
    await user.click(opener);

    const drawer = await screen.findByRole("dialog", {
      name: "Conversazioni",
    });
    await waitFor(() =>
      expect(drawer.contains(document.activeElement)).toBe(true),
    );

    await user.tab();
    await user.tab();
    expect(document.activeElement).not.toBe(mainContentLink);
    expect(
      within(drawer).getAllByRole("button", {
        name: "Chiudi la barra laterale",
      }),
    ).toHaveLength(1);

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Conversazioni" }),
      ).toBeNull(),
    );
    expect(document.activeElement).toBe(opener);
  });

  it("closes a mobile drawer that was open before the viewport becomes desktop", async () => {
    let isMobile = true;
    const mediaListeners = new Set<() => void>();
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(max-width: 767px)" && isMobile,
        media: query,
        onchange: null,
        addEventListener: (_event: string, listener: () => void) =>
          mediaListeners.add(listener),
        removeEventListener: (_event: string, listener: () => void) =>
          mediaListeners.delete(listener),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    mocks.pathname = "/chat";
    const user = userEvent.setup();
    renderLanding({
      isGuest: false,
      usageData: usageBelowThreshold,
    });

    await user.click(
      screen.getByRole("button", { name: "Apri la barra laterale" }),
    );
    await screen.findByRole("dialog", { name: "Conversazioni" });

    isMobile = false;
    for (const listener of mediaListeners) listener();
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Conversazioni" }),
      ).toBeNull(),
    );
    const desktopCloseButton = screen.getByRole("button", {
      name: "Chiudi la barra laterale",
    });
    await waitFor(() =>
      expect(document.activeElement).toBe(desktopCloseButton),
    );

    isMobile = true;
    for (const listener of mediaListeners) listener();
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Conversazioni" }),
      ).toBeNull(),
    );
  });

  it("keeps focus in visible main content when the desktop sidebar was collapsed", async () => {
    let isMobile = false;
    const mediaListeners = new Set<() => void>();
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(max-width: 767px)" && isMobile,
        media: query,
        onchange: null,
        addEventListener: (_event: string, listener: () => void) =>
          mediaListeners.add(listener),
        removeEventListener: (_event: string, listener: () => void) =>
          mediaListeners.delete(listener),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    mocks.pathname = "/chat";
    const user = userEvent.setup();
    renderLanding({
      isGuest: false,
      usageData: usageBelowThreshold,
      children: <button type="button">Azione principale</button>,
    });

    await user.click(
      screen.getByRole("button", { name: "Chiudi la barra laterale" }),
    );
    expect(
      screen.queryByRole("button", { name: "Chiudi la barra laterale" }),
    ).toBeNull();

    isMobile = true;
    for (const listener of mediaListeners) listener();
    await user.click(
      screen.getByRole("button", { name: "Apri la barra laterale" }),
    );
    await screen.findByRole("dialog", { name: "Conversazioni" });

    isMobile = false;
    for (const listener of mediaListeners) listener();
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Conversazioni" }),
      ).toBeNull(),
    );
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Azione principale" }),
    );
  });

  it.each([
    ["guest", true, { ...usageBelowThreshold, tier: "GUEST" as const }],
    [
      "authenticated user below the usage threshold",
      false,
      usageBelowThreshold,
    ],
  ])(
    "opens the sidebar from the %s landing",
    async (_label, isGuest, usageData) => {
      mocks.pathname = "/chat";
      const user = userEvent.setup();
      renderLanding({ isGuest, usageData });

      await user.click(
        screen.getByRole("button", { name: "Apri la barra laterale" }),
      );

      await waitFor(() =>
        expect(
          screen.getByRole("dialog", { name: "Conversazioni" }),
        ).toBeTruthy(),
      );
      expect(document.documentElement.dataset.chatSidebar).toBeUndefined();
    },
  );

  it.each(["/chat/routines", "/chat/unexpected/nested"])(
    "treats %s as non-conversation chrome with a safe guest continuation",
    async (pathname) => {
      mocks.pathname = pathname;
      const user = userEvent.setup();
      renderLanding({
        isGuest: true,
        usageData: { ...usageBelowThreshold, tier: "GUEST" },
      });

      expect(
        screen.getByRole("link", { name: "Registrati" }).getAttribute("href"),
      ).toBe("/sign-up?redirect_url=%2Fchat");
      await user.click(
        screen.getByRole("button", { name: "Apri la barra laterale" }),
      );

      await waitFor(() =>
        expect(
          screen.getByRole("dialog", { name: "Conversazioni" }),
        ).toBeTruthy(),
      );
      expect(document.documentElement.dataset.chatSidebar).toBeUndefined();
    },
  );

  it("keeps a real chat ID in guest conversation mode", () => {
    mocks.pathname = "/chat/chat-1";
    renderLanding({
      isGuest: true,
      usageData: { ...usageBelowThreshold, tier: "GUEST" },
      children: <GuestNoticeProbe />,
    });

    expect(screen.getByTestId("guest-conversation-notice").textContent).toBe(
      "/sign-up?redirect_url=%2Fchat%2Fchat-1:9",
    );
    expect(
      screen.queryByRole("button", { name: "Apri la barra laterale" }),
    ).toBeNull();
  });
});
