// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutineCardData } from "@/lib/coaching/routine";
import type { UsageData } from "@/types/chat";
import { LayoutClient, useChatContext } from "./layout-client";

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
  fetchActiveRoutineForReturn: vi.fn(),
  pathname: "/chat/source-chat",
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: { id: "user-1" } }),
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
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
}));
vi.mock("../components/ChatList", () => ({
  ChatList: ({
    onDelete,
    onSearch,
  }: {
    onDelete: (id: string) => Promise<boolean>;
    onSearch?: () => void;
  }) => (
    <>
      <button type="button" onClick={() => void onDelete("source-chat")}>
        Elimina chat sorgente
      </button>
      {onSearch && (
        <button type="button" onClick={onSearch}>
          Cerca nelle conversazioni
        </button>
      )}
    </>
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

function renderLayout(initialActiveRoutine: RoutineCardData | null) {
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
          visibility: "PRIVATE",
          createdAt: "2026-08-08T08:00:00.000Z",
          updatedAt: "2026-08-08T09:00:00.000Z",
          messageCount: 2,
        },
      ]}
      initialUsageData={null}
      initialCoachingGoal={null}
      initialActiveRoutine={initialActiveRoutine}
      guestConversionPending={false}
      isGuest={false}
    >
      <RoutineProbe />
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

beforeEach(() => {
  vi.clearAllMocks();
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

describe("mobile chat landing navigation", () => {
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

  it.each(["/chat/usage", "/chat/unexpected/nested"])(
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
