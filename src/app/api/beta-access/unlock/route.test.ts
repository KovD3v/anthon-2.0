import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  release: vi.fn(),
  unlock: vi.fn(),
  secret: vi.fn(),
}));

vi.mock("@/lib/beta-access/abuse", () => ({
  reserveBetaAction: mocks.reserve,
  releaseBetaAction: mocks.release,
  BetaAbuseDeniedError: class BetaAbuseDeniedError extends Error {
    status = 429;
    reason = "limit_reached";
  },
}));

vi.mock("@/lib/beta-access/service", () => ({
  unlockBetaAccess: mocks.unlock,
  getBetaAccessCookieSecret: mocks.secret,
}));

import { BETA_ACCESS_COOKIE_NAME } from "@/lib/beta-access/cookie";
import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("http://localhost/api/beta-access/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/beta-access/unlock", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => {
      mock.mockReset();
    });
    mocks.secret.mockReturnValue("test-cookie-secret-that-is-long-enough");
    mocks.reserve.mockResolvedValue({
      fingerprintHash: "hash",
      action: "UNLOCK",
      windowStart: new Date("2026-08-16T10:00:00.000Z"),
    });
    mocks.release.mockResolvedValue(undefined);
  });

  it("rejects malformed input before reserving an attempt", async () => {
    const response = await POST(request({ password: "" }));

    expect(response.status).toBe(400);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("returns a neutral rejection and keeps a failed reservation", async () => {
    mocks.unlock.mockResolvedValue({ status: "invalid" });

    const response = await POST(
      request({ password: "wrong", returnTo: "/chat" }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Password non valida.",
    });
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("sets the persistent cookie, releases the attempt, and returns a safe path", async () => {
    mocks.unlock.mockResolvedValue({
      status: "ok",
      accessVersion: 2,
      cookieValue: "signed-cookie",
    });

    const response = await POST(
      request({
        password: "shared password",
        returnTo: "https://evil.example/chat",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      returnTo: "/",
    });
    expect(mocks.release).toHaveBeenCalledTimes(1);
    const cookie = response.cookies.get(BETA_ACCESS_COOKIE_NAME);
    expect(cookie?.value).toBe("signed-cookie");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=15552000");
  });

  it("fails closed when the signing secret or active config is unavailable", async () => {
    mocks.secret.mockReturnValueOnce(null);
    const missingSecret = await POST(request({ password: "password" }));
    expect(missingSecret.status).toBe(503);
    expect(mocks.reserve).not.toHaveBeenCalled();

    mocks.unlock.mockResolvedValueOnce({ status: "inactive" });
    const inactive = await POST(request({ password: "password" }));
    expect(inactive.status).toBe(503);
  });

  it("returns 429 when abuse control rejects the attempt", async () => {
    const { BetaAbuseDeniedError } = await import("@/lib/beta-access/abuse");
    mocks.reserve.mockRejectedValue(new BetaAbuseDeniedError("limit_reached"));

    const response = await POST(request({ password: "password" }));

    expect(response.status).toBe(429);
  });
});
