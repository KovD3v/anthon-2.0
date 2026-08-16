import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  applyGate: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware:
    (handler: (auth: typeof mocks.auth, request: NextRequest) => unknown) =>
    (request: NextRequest) =>
      handler(mocks.auth, request),
}));

vi.mock("@/lib/beta-access/proxy-gate", () => ({
  applyBetaAccessGate: mocks.applyGate,
}));

import proxy from "./proxy";

const runProxy = proxy as unknown as (
  request: NextRequest,
) => Promise<Response>;

describe("application proxy", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.applyGate.mockReset();
    mocks.auth.mockResolvedValue({ userId: null });
    mocks.applyGate.mockResolvedValue(null);
  });

  it("returns the beta gate response before Clerk protected-route redirects", async () => {
    mocks.applyGate.mockResolvedValue(
      NextResponse.redirect("https://anthon.ai/beta-access"),
    );

    const response = await runProxy(
      new NextRequest("https://anthon.ai/profile"),
    );

    expect(response.headers.get("location")).toBe(
      "https://anthon.ai/beta-access",
    );
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("retains the existing signed-out redirect after beta access passes", async () => {
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
    expect(mocks.applyGate).not.toHaveBeenCalled();
  });

  it("continues normally for an allowed public chat request", async () => {
    const response = await runProxy(new NextRequest("https://anthon.ai/chat"));

    expect(response.status).toBe(200);
    expect(mocks.applyGate).toHaveBeenCalledTimes(1);
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});
