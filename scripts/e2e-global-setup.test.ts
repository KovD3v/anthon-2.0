import { afterEach, describe, expect, it, vi } from "vitest";
import globalSetup from "../e2e/global-setup";

describe("Playwright ephemeral branch guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed when Playwright is invoked outside the ephemeral runner", () => {
    vi.stubEnv("E2E_EPHEMERAL_BRANCH_ID", "");

    expect(() => globalSetup()).toThrow("E2E_EPHEMERAL_BRANCH_ID is required");
  });

  it("rejects a non-ephemeral branch identifier", () => {
    vi.stubEnv("E2E_EPHEMERAL_BRANCH_ID", "development");

    expect(() => globalSetup()).toThrow("E2E_EPHEMERAL_BRANCH_ID is required");
  });

  it("accepts the branch identifier injected by the E2E runner", () => {
    vi.stubEnv("E2E_EPHEMERAL_BRANCH_ID", "br-ephemeral-test");

    expect(() => globalSetup()).not.toThrow();
  });
});
