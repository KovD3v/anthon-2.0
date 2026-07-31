import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  convertGuestForAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock("@/lib/guest-conversion", () => ({
  convertGuestForAuthenticatedUser: mocks.convertGuestForAuthenticatedUser,
}));

import { POST } from "./route";

describe("POST /api/guest/convert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1" },
      error: null,
    });
    mocks.convertGuestForAuthenticatedUser.mockResolvedValue("stale_cookie");
  });

  it("requires authentication", async () => {
    mocks.getAuthUser.mockResolvedValue({ user: null, error: "Unauthorized" });
    expect((await POST()).status).toBe(401);
  });

  it("finalizes conversion in a route handler", async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    expect(mocks.convertGuestForAuthenticatedUser).toHaveBeenCalledWith(
      "user-1",
    );
    await expect(response.json()).resolves.toEqual({
      outcome: "stale_cookie",
    });
  });
});
