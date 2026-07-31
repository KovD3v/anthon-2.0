import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  getAttachmentRetentionDays: vi.fn(),
  getRateLimitsForUser: vi.fn(),
  getDailyUsage: vi.fn(),
  incrementUsage: vi.fn(),
  reconcileAiUsageForRecovery: vi.fn(),
  reconcileAiUsageInTransaction: vi.fn(),
  releaseAiUsageReservation: vi.fn(),
  reserveAiUsage: vi.fn(),
}));

vi.mock("./check", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("./config", () => ({
  ATTACHMENT_RETENTION_DAYS: 30,
  getAttachmentRetentionDays: mocks.getAttachmentRetentionDays,
  getRateLimitsForUser: mocks.getRateLimitsForUser,
}));

vi.mock("./usage", () => ({
  getDailyUsage: mocks.getDailyUsage,
  incrementUsage: mocks.incrementUsage,
}));

vi.mock("./reservations", () => ({
  reconcileAiUsageForRecovery: mocks.reconcileAiUsageForRecovery,
  reconcileAiUsageInTransaction: mocks.reconcileAiUsageInTransaction,
  releaseAiUsageReservation: mocks.releaseAiUsageReservation,
  reserveAiUsage: mocks.reserveAiUsage,
}));

import * as rateLimit from "./index";

describe("rate-limit/index barrel", () => {
  it("re-exports public runtime functions", () => {
    expect(typeof rateLimit.checkRateLimit).toBe("function");
    expect(typeof rateLimit.getAttachmentRetentionDays).toBe("function");
    expect(typeof rateLimit.getRateLimitsForUser).toBe("function");
    expect(typeof rateLimit.getDailyUsage).toBe("function");
    expect(typeof rateLimit.incrementUsage).toBe("function");
    expect(typeof rateLimit.reconcileAiUsageForRecovery).toBe("function");
    expect(typeof rateLimit.reconcileAiUsageInTransaction).toBe("function");
    expect(typeof rateLimit.releaseAiUsageReservation).toBe("function");
    expect(typeof rateLimit.reserveAiUsage).toBe("function");
  });
});
