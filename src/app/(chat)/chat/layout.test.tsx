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
