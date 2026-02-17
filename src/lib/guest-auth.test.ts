import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  userFindFirst: vi.fn(),
  userCreate: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findFirst: mocks.userFindFirst,
      create: mocks.userCreate,
    },
  },
}));

import {
  authenticateGuest,
  clearGuestCookie,
  getGuestTokenFromCookies,
  hashGuestToken,
} from "./guest-auth";

describe("lib/guest-auth", () => {
  beforeEach(() => {
    mocks.cookies.mockReset();
    mocks.userFindFirst.mockReset();
    mocks.userCreate.mockReset();
    mocks.cookieGet.mockReset();
    mocks.cookieSet.mockReset();
    mocks.cookieDelete.mockReset();

    mocks.cookies.mockResolvedValue({
      get: mocks.cookieGet,
      set: mocks.cookieSet,
      delete: mocks.cookieDelete,
    });
  });

  it("hashGuestToken returns deterministic sha256 hash", () => {
    expect(hashGuestToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("getGuestTokenFromCookies returns cookie value", async () => {
    mocks.cookieGet.mockReturnValue({ value: "guest-token-1" });

    const token = await getGuestTokenFromCookies();

    expect(token).toBe("guest-token-1");
  });

  it("getGuestTokenFromCookies returns null on dynamic server usage errors", async () => {
    const error = new Error("Dynamic server usage in route");
    (error as Error & { digest: string }).digest = "DYNAMIC_SERVER_USAGE";
    mocks.cookies.mockRejectedValue(error);

    const token = await getGuestTokenFromCookies();

    expect(token).toBeNull();
  });

  it("clearGuestCookie deletes guest token cookie", async () => {
    await clearGuestCookie();

    expect(mocks.cookieDelete).toHaveBeenCalledWith("anthon_guest_token");
  });

  it("authenticateGuest reuses existing valid guest session without resetting cookie", async () => {
    mocks.cookieGet.mockReturnValue({ value: "existing-token" });
    mocks.userFindFirst.mockResolvedValue({
      id: "guest-1",
      isGuest: true,
      role: "USER",
      subscription: null,
    });

    const result = await authenticateGuest();

    expect(result).toEqual({
      user: {
        id: "guest-1",
        isGuest: true,
        role: "USER",
        subscription: null,
      },
      token: "existing-token",
      isNew: false,
    });
    expect(mocks.userCreate).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("authenticateGuest creates user and sets cookie when no token exists", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.userCreate.mockResolvedValue({
      id: "guest-new",
      isGuest: true,
      role: "USER",
      subscription: null,
    });

    const result = await authenticateGuest();

    expect(result.user.id).toBe("guest-new");
    expect(result.isNew).toBe(true);
    expect(result.token).toHaveLength(64);
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      "anthon_guest_token",
      result.token,
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60,
        path: "/",
      }),
    );
  });

  it("authenticateGuest creates new user when token exists but guest is missing", async () => {
    mocks.cookieGet.mockReturnValue({ value: "stale-token" });
    mocks.userFindFirst.mockResolvedValue(null);
    mocks.userCreate.mockResolvedValue({
      id: "guest-recreated",
      isGuest: true,
      role: "USER",
      subscription: null,
    });

    const result = await authenticateGuest();

    expect(result.user.id).toBe("guest-recreated");
    expect(result.isNew).toBe(true);
    expect(result.token).not.toBe("stale-token");
    expect(mocks.cookieSet).toHaveBeenCalledTimes(1);
  });
});
