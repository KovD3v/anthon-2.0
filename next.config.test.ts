import { afterEach, describe, expect, it, vi } from "vitest";

const { withPostHogConfig } = vi.hoisted(() => ({
  withPostHogConfig: vi.fn((config) => config),
}));

vi.mock("@posthog/nextjs-config", () => ({ withPostHogConfig }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("deployment sourcemaps", () => {
  it("loads verification config without upload credentials", async () => {
    vi.stubEnv("POSTHOG_UPLOAD_SOURCEMAPS", "");
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "");
    vi.stubEnv("POSTHOG_PROJECT_ID", "");

    const { default: config } = await import("./next.config");

    expect(config.cacheComponents).toBe(true);
    expect(withPostHogConfig).not.toHaveBeenCalled();
  });

  it("requires credentials when deployment uploads are enabled", async () => {
    vi.stubEnv("POSTHOG_UPLOAD_SOURCEMAPS", "1");
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "");

    await expect(import("./next.config")).rejects.toThrow(
      "Missing required environment variable: POSTHOG_PERSONAL_API_KEY",
    );
  });

  it("enables uploads with the deployment credentials", async () => {
    vi.stubEnv("POSTHOG_UPLOAD_SOURCEMAPS", "1");
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "test-key");
    vi.stubEnv("POSTHOG_PROJECT_ID", "test-project");

    await import("./next.config");

    expect(withPostHogConfig).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        personalApiKey: "test-key",
        projectId: "test-project",
        sourcemaps: { deleteAfterUpload: true },
      }),
    );
  });
});
