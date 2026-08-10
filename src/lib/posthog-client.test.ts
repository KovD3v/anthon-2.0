// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock("posthog-js", () => ({
  default: { __loaded: false, init: mocks.init },
}));

import { initializePosthog, schedulePosthogLoad } from "./posthog-client";

describe("posthog client loading", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "test-posthog-key");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://test.posthog.local");
    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("initializes PostHog before making the client available to callers", async () => {
    await initializePosthog();

    expect(mocks.init).toHaveBeenCalledWith("test-posthog-key", {
      api_host: "https://test.posthog.local",
      capture_exceptions: true,
      defaults: "2025-11-30",
    });
  });

  it("waits until the browser is idle fallback before loading analytics", async () => {
    const onLoad = vi.fn();

    schedulePosthogLoad(onLoad);

    expect(onLoad).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(999);
    expect(onLoad).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(onLoad).toHaveBeenCalledTimes(1));
  });
});
