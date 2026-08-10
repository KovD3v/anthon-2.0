import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFeatureFlag: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/posthog", () => ({
  getPostHogClient: () => ({ getFeatureFlag: mocks.getFeatureFlag }),
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ warn: vi.fn() }),
}));

import {
  isRoutineFeatureEnabled,
  ROUTINE_FEATURE_FLAG,
} from "./routine-feature";

describe("routine feature flag", () => {
  beforeEach(() => {
    mocks.getFeatureFlag.mockReset();
    delete process.env.POSTHOG_API_KEY;
  });

  it("uses the stable subject id and accepts a boolean PostHog flag", async () => {
    process.env.POSTHOG_API_KEY = "ph_test";
    mocks.getFeatureFlag.mockResolvedValue(true);

    await expect(
      isRoutineFeatureEnabled({
        distinctId: "user_123",
        role: "USER",
        isGuest: false,
      }),
    ).resolves.toBe(true);

    expect(mocks.getFeatureFlag).toHaveBeenCalledWith(
      ROUTINE_FEATURE_FLAG,
      "user_123",
      { sendFeatureFlagEvents: false },
    );
  });

  it("fails closed when the flag is disabled, missing, or evaluation errors", async () => {
    process.env.POSTHOG_API_KEY = "ph_test";
    mocks.getFeatureFlag
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(null);

    await expect(
      isRoutineFeatureEnabled({
        distinctId: "user_123",
        role: "USER",
        isGuest: false,
      }),
    ).resolves.toBe(false);
    await expect(
      isRoutineFeatureEnabled({
        distinctId: "user_123",
        role: "USER",
        isGuest: false,
      }),
    ).resolves.toBe(false);

    mocks.getFeatureFlag.mockRejectedValueOnce(new Error("network"));
    await expect(
      isRoutineFeatureEnabled({
        distinctId: "user_123",
        role: "USER",
        isGuest: false,
      }),
    ).resolves.toBe(false);
  });

  it("keeps administrators enabled without depending on PostHog availability", async () => {
    await expect(
      isRoutineFeatureEnabled({
        distinctId: null,
        role: "ADMIN",
        isGuest: false,
      }),
    ).resolves.toBe(true);
    await expect(
      isRoutineFeatureEnabled({
        distinctId: null,
        role: "SUPER_ADMIN",
        isGuest: false,
      }),
    ).resolves.toBe(true);
    expect(mocks.getFeatureFlag).not.toHaveBeenCalled();
  });

  it("fails closed without a stable subject for regular users", async () => {
    process.env.POSTHOG_API_KEY = "ph_test";

    await expect(
      isRoutineFeatureEnabled({
        distinctId: null,
        role: "USER",
        isGuest: false,
      }),
    ).resolves.toBe(false);
    expect(mocks.getFeatureFlag).not.toHaveBeenCalled();
  });
});
