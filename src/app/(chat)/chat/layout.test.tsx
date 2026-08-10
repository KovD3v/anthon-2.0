import { readFileSync } from "node:fs";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  getSharedChats: vi.fn(),
  prismaUserFindFirst: vi.fn(),
  getGuestTokenFromCookies: vi.fn(),
  hashGuestToken: vi.fn(),
  getSharedUsageData: vi.fn(),
  convertGuestForAuthenticatedUser: vi.fn(),
  getUserControlledCoachingGoal: vi.fn(),
  prismaRoutineFindFirst: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAuthUser: mocks.getAuthUser,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/chat", () => ({
  getSharedChats: mocks.getSharedChats,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    routine: {
      findFirst: mocks.prismaRoutineFindFirst,
    },
    user: {
      findFirst: mocks.prismaUserFindFirst,
    },
  },
}));

vi.mock("@/lib/guest-auth", () => ({
  getGuestTokenFromCookies: mocks.getGuestTokenFromCookies,
  hashGuestToken: mocks.hashGuestToken,
}));

vi.mock("@/lib/usage", () => ({
  getSharedUsageData: mocks.getSharedUsageData,
}));

vi.mock("@/lib/guest-conversion", () => ({
  convertGuestForAuthenticatedUser: mocks.convertGuestForAuthenticatedUser,
}));

vi.mock("@/lib/coaching-context", () => ({
  getUserControlledCoachingGoal: mocks.getUserControlledCoachingGoal,
}));

vi.mock("./layout-client", () => ({
  LayoutClient: ({ children }: { children: React.ReactNode }) => children,
}));

import { getChatSidebarData } from "./layout";

describe("chat layout sidebar data", () => {
  beforeEach(() => {
    mocks.getAuthUser.mockReset();
    mocks.getSharedChats.mockReset();
    mocks.prismaUserFindFirst.mockReset();
    mocks.getGuestTokenFromCookies.mockReset();
    mocks.hashGuestToken.mockReset();
    mocks.getSharedUsageData.mockReset();
    mocks.convertGuestForAuthenticatedUser.mockReset();
    mocks.getUserControlledCoachingGoal.mockReset();
    mocks.prismaRoutineFindFirst.mockReset();

    mocks.getAuthUser.mockResolvedValue({
      user: null,
      error: "Not authenticated",
    });
    mocks.getGuestTokenFromCookies.mockResolvedValue(null);
    mocks.convertGuestForAuthenticatedUser.mockResolvedValue("no_cookie");
    mocks.getUserControlledCoachingGoal.mockResolvedValue(null);
    mocks.prismaRoutineFindFirst.mockResolvedValue(null);
  });

  it("treats unauthenticated first visits without a guest cookie as guest mode", async () => {
    const result = await getChatSidebarData();

    expect(result).toEqual({
      chats: [],
      usageData: null,
      coachingGoal: null,
      activeRoutine: null,
      routinesEnabled: false,
      guestConversionPending: false,
      isGuest: true,
    });
    expect(mocks.prismaUserFindFirst).not.toHaveBeenCalled();
  });

  it("converts a guest before reading authenticated sidebar data", async () => {
    const order: string[] = [];
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", role: "USER", isGuest: false },
      error: null,
    });
    mocks.convertGuestForAuthenticatedUser.mockImplementation(async () => {
      order.push("convert");
      return "migrated";
    });
    mocks.getSharedChats.mockImplementation(async () => {
      order.push("chats");
      return [];
    });
    mocks.getSharedUsageData.mockImplementation(async () => {
      order.push("usage");
      return null;
    });

    await getChatSidebarData();

    expect(order).toEqual(["convert", "chats", "usage"]);
    expect(mocks.convertGuestForAuthenticatedUser).toHaveBeenCalledWith(
      "user-1",
      { canMutateCookies: false },
    );
  });

  it("starts independent sidebar reads while the chat list is pending", async () => {
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", role: "USER", isGuest: false },
      error: null,
    });

    let resolveChats: (chats: []) => void = () => undefined;
    mocks.getSharedChats.mockReturnValue(
      new Promise((resolve) => {
        resolveChats = resolve;
      }),
    );
    mocks.getSharedUsageData.mockResolvedValue(null);

    const pending = getChatSidebarData({
      authUser: {
        id: "user-1",
        clerkId: "clerk-user-1",
        email: "user@example.com",
        role: "USER",
        isGuest: false,
        createdAt: new Date("2026-08-08T08:00:00.000Z"),
      },
      guestUser: null,
      guestConversionPending: false,
      isGuest: false,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.getSharedUsageData).toHaveBeenCalledWith("user-1", "USER");

    resolveChats([]);
    await pending;
  });

  it("loads the authenticated user's coaching goal", async () => {
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", role: "USER", isGuest: false },
      error: null,
    });
    mocks.getSharedChats.mockResolvedValue([]);
    mocks.getSharedUsageData.mockResolvedValue(null);
    mocks.getUserControlledCoachingGoal.mockResolvedValue("Restare lucido");

    await expect(getChatSidebarData()).resolves.toEqual({
      chats: [],
      usageData: null,
      coachingGoal: "Restare lucido",
      activeRoutine: null,
      routinesEnabled: false,
      guestConversionPending: false,
      isGuest: false,
    });
  });

  it("loads the newest active routine and its latest attempt for a registered user", async () => {
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", role: "USER", isGuest: false },
      error: null,
    });
    mocks.getSharedChats.mockResolvedValue([]);
    mocks.getSharedUsageData.mockResolvedValue(null);
    mocks.prismaRoutineFindFirst.mockResolvedValue({
      id: "routine-1",
      sourceChatId: null,
      sourceAssistantMessageId: null,
      status: "ACTIVE",
      title: "Reset dopo un errore",
      trigger: "Quando commetti un errore in gara",
      durationLabel: "60 secondi",
      steps: ["Fermati", "Espira lentamente", "Scegli il prossimo gesto"],
      completionCue: "Riparti con lo sguardo sul compito successivo",
      archivedAt: null,
      attempts: [
        {
          id: "attempt-1",
          attemptedAt: new Date("2026-08-08T09:00:00.000Z"),
          outcome: null,
          outcomeNote: null,
          outcomeRecordedAt: null,
        },
      ],
    });

    const result = await getChatSidebarData();

    expect(mocks.prismaRoutineFindFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "ACTIVE" },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: {
        attempts: {
          orderBy: [{ attemptedAt: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
    });
    expect(result.activeRoutine).toEqual({
      id: "routine-1",
      sourceChatId: null,
      sourceAssistantMessageId: null,
      status: "ACTIVE",
      formatVersion: 1,
      proposal: {
        title: "Reset dopo un errore",
        trigger: "Quando commetti un errore in gara",
        durationLabel: "60 secondi",
        steps: ["Fermati", "Espira lentamente", "Scegli il prossimo gesto"],
        completionCue: "Riparti con lo sguardo sul compito successivo",
      },
      archivedAt: null,
      latestAttempt: {
        id: "attempt-1",
        attemptedAt: "2026-08-08T09:00:00.000Z",
        outcome: null,
        outcomeNote: null,
        outcomeRecordedAt: null,
      },
    });
  });

  it("never queries active routines for a guest identity", async () => {
    mocks.getGuestTokenFromCookies.mockResolvedValue("guest-token");
    mocks.hashGuestToken.mockReturnValue("guest-hash");
    mocks.prismaUserFindFirst.mockResolvedValue({
      id: "guest-1",
      role: "USER",
    });
    mocks.getSharedChats.mockResolvedValue([]);
    mocks.getSharedUsageData.mockResolvedValue(null);

    const result = await getChatSidebarData();

    expect(result.activeRoutine).toBeNull();
    expect(mocks.prismaRoutineFindFirst).not.toHaveBeenCalled();
  });
});

describe("chat mobile viewport layout", () => {
  it("uses the small viewport height on mobile so browser toolbars do not cover the composer", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const layoutClient = readFileSync(
      "src/app/(chat)/chat/layout-client.tsx",
      "utf8",
    );
    const layout = readFileSync("src/app/(chat)/chat/layout.tsx", "utf8");

    expect(css).toContain(".chat-mobile-viewport");
    expect(css).toContain("height: var(--chat-viewport-height, 100dvh);");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("height: var(--chat-viewport-height, 100svh);");
    expect(layoutClient).toContain("installChatViewportSizing");
    expect(layoutClient).toContain("ref={chatViewportRef}");
    expect(layoutClient).not.toContain("debugViewport");
    expect(layoutClient).not.toContain("ViewportDebugOverlay");
    expect(layoutClient).toContain(
      'className="flex min-w-0 chat-mobile-viewport overflow-hidden"',
    );
    expect(layout).toContain(
      'className="flex chat-mobile-viewport overflow-hidden"',
    );
  });

  it("uses the viewport media subscription to choose the mobile sidebar", () => {
    const layoutClient = readFileSync(
      "src/app/(chat)/chat/layout-client.tsx",
      "utf8",
    );

    expect(layoutClient).toContain("useSyncExternalStore(");
    expect(layoutClient).toContain(
      'const MOBILE_SIDEBAR_MEDIA_QUERY = "(max-width: 767px)";',
    );
    expect(layoutClient).toContain("getServerMobileSidebarSnapshot");
  });

  it("delegates mobile drawer focus and page locking to Radix", () => {
    const layoutClient = readFileSync(
      "src/app/(chat)/chat/layout-client.tsx",
      "utf8",
    );

    expect(layoutClient).toContain(
      "<Sheet\n            open={isMobileSidebarOpen}",
    );
    expect(layoutClient).toContain("onCloseAutoFocus");
    expect(layoutClient).not.toContain("installDocumentScrollLock");
    expect(layoutClient).not.toContain("aria-hidden={!isSidebarOpen}");
  });

  it("aligns desktop notifications with the active chat column", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const layoutClient = readFileSync(
      "src/app/(chat)/chat/layout-client.tsx",
      "utf8",
    );
    const conversationClient = readFileSync(
      "src/app/(chat)/chat/[id]/chat-conversation-client.tsx",
      "utf8",
    );

    expect(css).toContain("--toast-center-offset: 0px;");
    expect(css).toContain(
      '.toaster[data-sonner-toaster][data-x-position="center"]',
    );
    expect(css).toContain("left: calc(50% + var(--toast-center-offset, 0px));");
    expect(css).toContain('html[data-chat-sidebar="open"]');
    expect(layoutClient).toContain('root.dataset.chatSidebar = "open";');
    expect(conversationClient).toContain("var(--toast-center-offset, 0px)");
  });

  it("keeps the composer outside a single scrollable empty-state content region", () => {
    const conversationClient = readFileSync(
      "src/app/(chat)/chat/[id]/chat-conversation-client.tsx",
      "utf8",
    );
    const conversationPage = readFileSync(
      "src/app/(chat)/chat/[id]/page.tsx",
      "utf8",
    );
    const layoutClient = readFileSync(
      "src/app/(chat)/chat/layout-client.tsx",
      "utf8",
    );
    const chatInput = readFileSync(
      "src/app/(chat)/components/ChatInput.tsx",
      "utf8",
    );

    expect(layoutClient).toContain(
      'className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)]"',
    );
    expect(conversationPage).toContain(
      '<PageWrapper className="flex min-h-0 flex-1 flex-col">',
    );
    expect(conversationClient).toContain("const isEmptyIdle =");
    expect(conversationClient).toContain(
      'className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-linear-to-b from-background to-muted/20"',
    );
    expect(conversationClient).toContain(
      'className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:py-6"',
    );
    expect(chatInput).toContain("w-full min-w-0 shrink-0");
  });

  it("allows the chat column and composer to shrink with narrow desktop windows", () => {
    const layoutClient = readFileSync(
      "src/app/(chat)/chat/layout-client.tsx",
      "utf8",
    );
    const conversationClient = readFileSync(
      "src/app/(chat)/chat/[id]/chat-conversation-client.tsx",
      "utf8",
    );
    const messageList = readFileSync(
      "src/app/(chat)/components/MessageList.tsx",
      "utf8",
    );
    const chatInput = readFileSync(
      "src/app/(chat)/components/ChatInput.tsx",
      "utf8",
    );

    expect(layoutClient).toContain(
      'className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)]"',
    );
    expect(conversationClient).toContain(
      'className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-linear-to-b from-background to-muted/20"',
    );
    expect(messageList).toContain(
      'className="flex-1 min-w-0 overflow-y-auto px-4 py-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent relative"',
    );
    expect(chatInput).toContain("w-full min-w-0 shrink-0");
    expect(chatInput).toContain("min-w-0 flex-1");
  });

  it("keeps chat, upload, and voice progress visible in the conversation UI", () => {
    const conversationClient = readFileSync(
      "src/app/(chat)/chat/[id]/chat-conversation-client.tsx",
      "utf8",
    );
    const messageList = readFileSync(
      "src/app/(chat)/components/MessageList.tsx",
      "utf8",
    );
    const chatInput = readFileSync(
      "src/app/(chat)/components/ChatInput.tsx",
      "utf8",
    );
    const audioRecorder = readFileSync(
      "src/app/(chat)/components/AudioRecorder.tsx",
      "utf8",
    );

    expect(conversationClient).toContain("status={status}");
    expect(messageList).toContain("getAssistantPendingLabel");
    expect(messageList).toContain("getAssistantToolFeedback");
    expect(messageList).toContain("assistantToolFeedback");
    expect(messageList).toContain("<m.output");
    expect(chatInput).toContain("uploadingFileName");
    expect(chatInput).toContain("CHAT_REACTIVITY_COPY.uploadUploading");
    expect(chatInput).toContain('aria-live="polite"');
    expect(chatInput).toContain("const cannotSubmit =");
    expect(audioRecorder).toContain("font-mono tabular-nums");
    expect(audioRecorder).toContain("dateTime=");
    expect(audioRecorder).toContain("recordingDuration");
    expect(audioRecorder).not.toContain("Registrazione in corso");
    expect(audioRecorder).not.toContain("Attivo il microfono");
    expect(audioRecorder).not.toContain("Carico l'audio");
    expect(audioRecorder).toContain('"converting"');
    expect(audioRecorder).toContain('"uploading"');
  });

  it("uses calm card surfaces for Anthon messages", () => {
    const messageList = readFileSync(
      "src/app/(chat)/components/MessageList.tsx",
      "utf8",
    );
    const loading = readFileSync("src/app/(chat)/chat/loading.tsx", "utf8");

    expect(messageList).toContain(
      ': "rounded-2xl rounded-tl-sm border border-border/60 bg-card text-foreground"',
    );
    expect(messageList).toContain("assistantMarkdownClassName");
    expect(messageList).toContain("prose-p:text-foreground");
    expect(loading).toContain(
      ': "rounded-tl-sm border border-border/60 bg-card"',
    );
  });

  it("renders assistant usage only through the compact technical disclosure", () => {
    const messageList = readFileSync(
      "src/app/(chat)/components/MessageList.tsx",
      "utf8",
    );

    expect(messageList).toContain("TechnicalMetricsDetails");
    expect(messageList).toContain("getUsageFromAnnotations");
    expect(messageList).not.toContain("metadataUsage");
  });

  it("keeps mobile chrome in the conversation header instead of an empty usage shell", () => {
    const usageBanner = readFileSync(
      "src/app/(chat)/components/UsageBanner.tsx",
      "utf8",
    );
    const layoutClient = readFileSync(
      "src/app/(chat)/chat/layout-client.tsx",
      "utf8",
    );
    const chatHeader = readFileSync(
      "src/app/(chat)/components/ChatHeader.tsx",
      "utf8",
    );

    expect(usageBanner).not.toContain("showToggle");
    expect(usageBanner).not.toContain("onToggleSidebar");
    expect(usageBanner).toContain(
      "if (!shouldShowFullBanner) {\n    return null;",
    );
    expect(layoutClient).toContain("openSidebar: () => void;");
    expect(layoutClient).toContain("guestConversationNotice:");
    expect(layoutClient).toContain("const isConversationRoute =");
    expect(layoutClient).toContain("!isConversationRoute &&");
    expect(layoutClient).toContain("MobileLandingSidebarTrigger");
    expect(layoutClient).toContain(
      'pathname === "/chat" || isConversationRoute ? pathname : "/chat"',
    );
    expect(layoutClient).not.toContain("h-12 sm:h-14 items-center");
    expect(chatHeader).toContain("onOpenSidebar?: () => void;");
    expect(chatHeader).toContain("guestConversationNotice?:");
    expect(chatHeader).toContain('aria-label="Apri la barra laterale"');
    expect(chatHeader).toContain("md:hidden");
    expect(chatHeader).toContain("registrationHref");
  });

  it("clears submitted composer text before awaiting the assistant response", () => {
    const conversationClient = readFileSync(
      "src/app/(chat)/chat/[id]/chat-conversation-client.tsx",
      "utf8",
    );

    expect(conversationClient).toContain("const submittedInput = input;");
    expect(conversationClient.indexOf('setInput("");')).toBeLessThan(
      conversationClient.indexOf("await sendMessage"),
    );
    expect(conversationClient).toContain("setInput(submittedInput);");
  });

  it("keeps the new-chat composer below scrollable landing content", () => {
    const chatPage = readFileSync("src/app/(chat)/chat/page.tsx", "utf8");
    const layoutClient = readFileSync(
      "src/app/(chat)/chat/layout-client.tsx",
      "utf8",
    );
    const conversationClient = readFileSync(
      "src/app/(chat)/chat/[id]/chat-conversation-client.tsx",
      "utf8",
    );

    expect(chatPage).toContain("<ChatInput");
    expect(chatPage).toContain("overflow-hidden");
    expect(chatPage).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(chatPage).toContain(
      "min-h-full flex-col items-center justify-center",
    );
    expect(chatPage).toContain("hidden grid-cols-2 gap-2");
    expect(chatPage).toContain("md:grid md:gap-3 md:grid-cols-3");
    expect(chatPage).not.toContain("Inizia una nuova conversazione");
    expect(chatPage).toContain("initialMessage: landingInput");
    expect(layoutClient).toContain("pendingInitialMessagesRef");
    expect(layoutClient).toContain("consumePendingInitialMessage");
    expect(conversationClient).toContain(
      "consumePendingInitialMessage(chatId)",
    );
  });
});
