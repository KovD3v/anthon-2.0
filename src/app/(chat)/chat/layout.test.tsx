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
}));

vi.mock("@/lib/auth", () => ({
  getAuthUser: mocks.getAuthUser,
}));

vi.mock("@/lib/chat", () => ({
  getSharedChats: mocks.getSharedChats,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
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

    mocks.getAuthUser.mockResolvedValue({
      user: null,
      error: "Not authenticated",
    });
    mocks.getGuestTokenFromCookies.mockResolvedValue(null);
  });

  it("treats unauthenticated first visits without a guest cookie as guest mode", async () => {
    const result = await getChatSidebarData();

    expect(result).toEqual({
      chats: [],
      usageData: null,
      isGuest: true,
    });
    expect(mocks.prismaUserFindFirst).not.toHaveBeenCalled();
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
      'className="flex chat-mobile-viewport overflow-hidden"',
    );
    expect(layout).toContain(
      'className="flex chat-mobile-viewport overflow-hidden"',
    );
  });

  it("does not derive the first sidebar render from window width", () => {
    const layoutClient = readFileSync(
      "src/app/(chat)/chat/layout-client.tsx",
      "utf8",
    );

    expect(layoutClient).toContain(
      "const [isSidebarOpen, setIsSidebarOpen] = useState(false);",
    );
    expect(layoutClient).not.toContain(
      "const [isSidebarOpen, setIsSidebarOpen] = useState(() => {",
    );
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
      'className="min-h-0 flex-1 overflow-y-auto px-4 py-6"',
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
});
