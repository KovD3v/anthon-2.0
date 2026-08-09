import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  getSharedChatWithRetry: vi.fn(),
  convertGuestForAuthenticatedUser: vi.fn(),
  getGuestTokenFromCookies: vi.fn(),
  hashGuestToken: vi.fn(),
  guestUserFindFirst: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/components/ui/page-wrapper", () => ({
  PageWrapper: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/auth", () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock("@/lib/chat", () => ({
  getSharedChatWithRetry: mocks.getSharedChatWithRetry,
}));
vi.mock("@/lib/db", () => ({
  prisma: { user: { findFirst: mocks.guestUserFindFirst } },
}));
vi.mock("@/lib/guest-auth", () => ({
  getGuestTokenFromCookies: mocks.getGuestTokenFromCookies,
  hashGuestToken: mocks.hashGuestToken,
}));
vi.mock("@/lib/guest-conversion", () => ({
  convertGuestForAuthenticatedUser: mocks.convertGuestForAuthenticatedUser,
}));
vi.mock("./chat-conversation-client", () => ({
  ChatConversationClient: () => null,
}));

import ChatConversationPage from "./page";

describe("ChatConversationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1" },
      error: null,
    });
    mocks.convertGuestForAuthenticatedUser.mockResolvedValue("migrated");
    mocks.getSharedChatWithRetry.mockResolvedValue({
      id: "chat-1",
      title: "Una chat",
      visibility: "PRIVATE",
      isOwner: true,
      createdAt: "2026-08-04T00:00:00.000Z",
      updatedAt: "2026-08-04T00:00:00.000Z",
      messages: [],
      pagination: { hasMore: false, nextCursor: null },
      voiceEnabled: true,
      voicePlanEnabled: true,
    });
  });

  it("converts a guest before checking the authenticated chat", async () => {
    const order: string[] = [];
    mocks.convertGuestForAuthenticatedUser.mockImplementation(async () => {
      order.push("convert");
      return "migrated";
    });
    mocks.getSharedChatWithRetry.mockImplementation(async () => {
      order.push("chat");
      return {
        id: "chat-1",
        title: "Una chat",
        visibility: "PRIVATE",
        isOwner: true,
        createdAt: "2026-08-04T00:00:00.000Z",
        updatedAt: "2026-08-04T00:00:00.000Z",
        messages: [],
        pagination: { hasMore: false, nextCursor: null },
        voiceEnabled: true,
        voicePlanEnabled: true,
      };
    });

    await ChatConversationPage({
      params: Promise.resolve({ id: "chat-1" }),
    });

    expect(order).toEqual(["convert", "chat"]);
    expect(mocks.convertGuestForAuthenticatedUser).toHaveBeenCalledWith(
      "user-1",
      { canMutateCookies: false },
    );
    expect(mocks.getSharedChatWithRetry).toHaveBeenCalledWith(
      "chat-1",
      "user-1",
    );
  });
});
