import { afterEach, describe, expect, it, vi } from "vitest";
import globalSetup, {
  assertEphemeralE2EBranch,
  warmGuestChatRoute,
} from "../e2e/global-setup";

describe("Playwright ephemeral branch guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fails closed when Playwright is invoked outside the ephemeral runner", () => {
    vi.stubEnv("E2E_EPHEMERAL_BRANCH_ID", "");

    expect(() => assertEphemeralE2EBranch()).toThrow(
      "E2E_EPHEMERAL_BRANCH_ID is required",
    );
  });

  it("rejects a non-ephemeral branch identifier", () => {
    vi.stubEnv("E2E_EPHEMERAL_BRANCH_ID", "development");

    expect(() => assertEphemeralE2EBranch()).toThrow(
      "E2E_EPHEMERAL_BRANCH_ID is required",
    );
  });

  it("accepts the branch identifier injected by the E2E runner", () => {
    vi.stubEnv("E2E_EPHEMERAL_BRANCH_ID", "br-ephemeral-test");

    expect(() => assertEphemeralE2EBranch()).not.toThrow();
  });

  it("warms the guest chat route before browser assertions begin", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3100");
    const fetcher = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 405,
        statusText: "Method Not Allowed",
      }),
    );

    await warmGuestChatRoute(fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      new URL("http://localhost:3100/api/guest/chat"),
      { method: "GET" },
    );
  });

  it("fails when the warmed route returns a server error", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );

    await expect(warmGuestChatRoute(fetcher)).rejects.toThrow(
      "Failed to warm the guest chat route (503 Service Unavailable)",
    );
  });

  it("runs the branch guard before warming the app", async () => {
    vi.stubEnv("E2E_EPHEMERAL_BRANCH_ID", "");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    await expect(globalSetup()).rejects.toThrow(
      "E2E_EPHEMERAL_BRANCH_ID is required",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
