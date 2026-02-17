import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getRateLimitsForUser: vi.fn(),
  getDailyUsage: vi.fn(),
  incrementUsage: vi.fn(),
}));

vi.mock("./check", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("./config", () => ({
  ATTACHMENT_RETENTION_DAYS: 30,
  getRateLimitsForUser: mocks.getRateLimitsForUser,
}));

vi.mock("./usage", () => ({
  getDailyUsage: mocks.getDailyUsage,
  incrementUsage: mocks.incrementUsage,
}));

import * as rateLimit from "./index";

describe("rate-limit/index barrel", () => {
  it("re-exports public runtime functions", () => {
    expect(typeof rateLimit.checkRateLimit).toBe("function");
    expect(typeof rateLimit.getRateLimitsForUser).toBe("function");
    expect(typeof rateLimit.getDailyUsage).toBe("function");
    expect(typeof rateLimit.incrementUsage).toBe("function");
  });
});
