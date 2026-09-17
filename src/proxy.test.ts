import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyE2ESession: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware:
    (handler: (auth: typeof mocks.auth, request: NextRequest) => unknown) =>
    (request: NextRequest) =>
      handler(mocks.auth, request),
}));

vi.mock("@/lib/e2e-runtime", () => ({
  E2E_SESSION_COOKIE_NAME: "__anthon_e2e_session",
  verifyE2ESessionValue: mocks.verifyE2ESession,
}));

import proxy from "./proxy";

const runProxy = proxy as unknown as (
  request: NextRequest,
) => Promise<Response>;

describe("application proxy", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.auth.mockResolvedValue({ userId: null });
    mocks.verifyE2ESession.mockReturnValue(null);
  });

  it("retains the signed-out redirect and its original destination", async () => {
    const response = await runProxy(
      new NextRequest("https://anthon.ai/profile?tab=security"),
    );

    expect(response.headers.get("location")).toBe(
      "https://anthon.ai/sign-in?redirect_url=%2Fprofile%3Ftab%3Dsecurity",
    );
    expect(mocks.auth).toHaveBeenCalledTimes(1);
  });

  it("keeps removed usage route hidden before other proxy work", async () => {
    const response = await runProxy(
      new NextRequest("https://anthon.ai/chat/usage"),
    );

    expect(response.status).toBe(404);
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it.each([
    "/",
    "/chat",
    "/pricing",
    "/sign-in",
    "/sign-up",
    "/api/chat",
    "/api/guest/chat",
  ])("passes %s to its handler without a beta credential", async (path) => {
    const response = await runProxy(
      new NextRequest(`https://anthon.ai${path}`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it.each(["/profile", "/admin", "/admin/users", "/channels", "/organization"])(
    "still requires sign-in for %s",
    async (path) => {
      const response = await runProxy(
        new NextRequest(`https://anthon.ai${path}`),
      );

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        `https://anthon.ai/sign-in?redirect_url=${encodeURIComponent(path)}`,
      );
      expect(mocks.auth).toHaveBeenCalledTimes(1);
    },
  );

  it("lets signed-in requests reach downstream authorization without a beta credential", async () => {
    mocks.auth.mockResolvedValue({ userId: "user-1" });
    const response = await runProxy(new NextRequest("https://anthon.ai/admin"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.auth).toHaveBeenCalledTimes(1);
  });

  it("lets a valid isolated E2E session cross the Clerk gate", async () => {
    mocks.verifyE2ESession.mockReturnValue("e2e-no-access-user");

    const response = await runProxy(
      new NextRequest("https://anthon.ai/profile", {
        headers: { cookie: "__anthon_e2e_session=signed" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.verifyE2ESession).toHaveBeenCalledWith("signed");
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});
