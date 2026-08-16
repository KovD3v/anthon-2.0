import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  secret: vi.fn(),
  currentCookie: vi.fn(),
}));

vi.mock("./service", () => ({
  loadBetaAccessConfig: mocks.loadConfig,
  getBetaAccessCookieSecret: mocks.secret,
  isCurrentBetaAccessCookie: mocks.currentCookie,
}));

import { BETA_ACCESS_COOKIE_NAME } from "./cookie";
import { applyBetaAccessGate } from "./proxy-gate";

function request(path: string, cookie?: string) {
  return new NextRequest(`https://anthon.ai${path}`, {
    headers: cookie
      ? { cookie: `${BETA_ACCESS_COOKIE_NAME}=${cookie}` }
      : undefined,
  });
}

describe("applyBetaAccessGate", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => {
      mock.mockReset();
    });
    mocks.secret.mockReturnValue("test-cookie-secret-that-is-long-enough");
    mocks.loadConfig.mockResolvedValue({
      active: true,
      accessVersion: 4,
      passwordDigest: "not-exposed-to-proxy-consumers",
      activatedAt: new Date(),
      rotatedAt: new Date(),
    });
    mocks.currentCookie.mockReturnValue(false);
  });

  it.each([
    "/beta-access",
    "/privacy",
    "/terms",
    "/admin/beta",
    "/api/admin/beta-access",
    "/api/webhooks/clerk",
    "/api/cron/cleanup",
  ])("bypasses the beta gate for %s", async (path) => {
    await expect(applyBetaAccessGate(request(path))).resolves.toBeNull();
    expect(mocks.loadConfig).not.toHaveBeenCalled();
  });

  it("bypasses a safe admin authentication bootstrap only", async () => {
    await expect(
      applyBetaAccessGate(request("/sign-in?redirect_url=%2Fadmin%2Fbeta")),
    ).resolves.toBeNull();
    expect(mocks.loadConfig).not.toHaveBeenCalled();

    const ordinary = await applyBetaAccessGate(
      request("/sign-in?redirect_url=%2Fchat"),
    );
    expect(ordinary?.status).toBe(307);
  });

  it("allows the site while the first password has not been configured", async () => {
    mocks.loadConfig.mockResolvedValue({ active: false });

    await expect(applyBetaAccessGate(request("/chat"))).resolves.toBeNull();
  });

  it("allows a current signed cookie", async () => {
    mocks.currentCookie.mockReturnValue(true);

    await expect(
      applyBetaAccessGate(request("/chat/abc", "signed-cookie")),
    ).resolves.toBeNull();
    expect(mocks.currentCookie).toHaveBeenCalledWith("signed-cookie", 4, {
      secret: "test-cookie-secret-that-is-long-enough",
    });
  });

  it("redirects a locked page and preserves only its internal destination", async () => {
    const response = await applyBetaAccessGate(
      request("/chat/abc?mode=focus", "stale-cookie"),
    );

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toBe(
      "https://anthon.ai/beta-access?returnTo=%2Fchat%2Fabc%3Fmode%3Dfocus",
    );
    expect(response?.cookies.get(BETA_ACCESS_COOKIE_NAME)?.value).toBe("");
  });

  it("returns JSON 403 for a gated browser API", async () => {
    const response = await applyBetaAccessGate(request("/api/chat"));

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: "Beta access required",
    });
  });

  it("fails closed when active gate state cannot be read", async () => {
    mocks.loadConfig.mockRejectedValue(new Error("database unavailable"));

    const page = await applyBetaAccessGate(request("/chat"));
    expect(page?.status).toBe(307);
    expect(page?.headers.get("location")).toContain("error=unavailable");

    const api = await applyBetaAccessGate(request("/api/chat"));
    expect(api?.status).toBe(503);
  });

  it("fails closed when the active signing secret is missing", async () => {
    mocks.secret.mockReturnValue(null);

    const response = await applyBetaAccessGate(request("/chat"));

    expect(response?.status).toBe(307);
    expect(response?.headers.get("location")).toContain("error=unavailable");
  });
});
