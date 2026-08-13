// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  initializePosthog: vi.fn(),
}));

vi.mock("@/lib/posthog-client", () => ({
  initializePosthog: mocks.initializePosthog,
}));

import { reportClientError } from "./client-error-reporting";

describe("reportClientError", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "test-posthog-key");
    mocks.captureException.mockReset();
    mocks.initializePosthog.mockResolvedValue({
      captureException: mocks.captureException,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports a handled error without writing to the browser console", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    reportClientError(new Error("offline"), { source: "chat.send_message" });

    await vi.waitFor(() => {
      expect(mocks.captureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: "offline" }),
        { source: "chat.send_message" },
      );
    });
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("does not load analytics when PostHog is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");

    reportClientError(new Error("offline"), { source: "chat.send_message" });

    expect(mocks.initializePosthog).not.toHaveBeenCalled();
  });
});
