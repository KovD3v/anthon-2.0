import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  findFirst: vi.fn(),
  getGuestTokenFromCookies: vi.fn(),
  hashGuestToken: vi.fn(),
  clearGuestCookie: vi.fn(),
  migrateGuestToUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock("@/lib/db", () => ({
  prisma: { user: { findFirst: mocks.findFirst } },
}));
vi.mock("@/lib/guest-auth", () => ({
  getGuestTokenFromCookies: mocks.getGuestTokenFromCookies,
  hashGuestToken: mocks.hashGuestToken,
  clearGuestCookie: mocks.clearGuestCookie,
}));
vi.mock("@/lib/guest-migration", () => ({
  migrateGuestToUser: mocks.migrateGuestToUser,
}));

import { convertGuestForAuthenticatedUser } from "./guest-conversion";

describe("convertGuestForAuthenticatedUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGuestTokenFromCookies.mockResolvedValue("guest-token");
    mocks.hashGuestToken.mockReturnValue("token-hash");
    mocks.clearGuestCookie.mockResolvedValue(undefined);
    mocks.migrateGuestToUser.mockResolvedValue({
      success: true,
      migratedCounts: { chats: 1 },
    });
  });

  it("does nothing without a guest cookie", async () => {
    mocks.getGuestTokenFromCookies.mockResolvedValue(null);

    await expect(convertGuestForAuthenticatedUser("user-1")).resolves.toBe(
      "no_cookie",
    );
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.clearGuestCookie).not.toHaveBeenCalled();
  });

  it("clears a stale guest cookie", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(convertGuestForAuthenticatedUser("user-1")).resolves.toBe(
      "stale_cookie",
    );
    expect(mocks.clearGuestCookie).toHaveBeenCalledOnce();
  });

  it("clears a cookie already owned by the authenticated user", async () => {
    mocks.findFirst.mockResolvedValue({ id: "user-1" });

    await expect(convertGuestForAuthenticatedUser("user-1")).resolves.toBe(
      "already_owned",
    );
    expect(mocks.migrateGuestToUser).not.toHaveBeenCalled();
    expect(mocks.clearGuestCookie).toHaveBeenCalledOnce();
  });

  it("migrates, invalidates the chat list, and clears the cookie", async () => {
    mocks.findFirst.mockResolvedValue({ id: "guest-1" });

    await expect(convertGuestForAuthenticatedUser("user-1")).resolves.toBe(
      "migrated",
    );
    expect(mocks.migrateGuestToUser).toHaveBeenCalledWith("guest-1", "user-1");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chats-user-1", "max");
    expect(mocks.clearGuestCookie).toHaveBeenCalledOnce();
  });

  it("preserves the cookie when migration can be retried", async () => {
    mocks.findFirst.mockResolvedValue({ id: "guest-1" });
    mocks.migrateGuestToUser.mockResolvedValue({
      success: false,
      error: "temporary failure",
      migratedCounts: {},
    });

    await expect(convertGuestForAuthenticatedUser("user-1")).resolves.toBe(
      "retryable_failure",
    );
    expect(mocks.clearGuestCookie).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("defers terminal cookie cleanup when called during server rendering", async () => {
    mocks.findFirst.mockResolvedValue({ id: "guest-1" });

    await expect(
      convertGuestForAuthenticatedUser("user-1", {
        canMutateCookies: false,
      }),
    ).resolves.toBe("migrated");
    expect(mocks.clearGuestCookie).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });
});
