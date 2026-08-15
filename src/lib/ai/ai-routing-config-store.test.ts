import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    aiRoutingConfig: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
  }),
}));

import {
  getAiRoutingRuntimeConfig,
  resetAiRoutingConfigCacheForTests,
  saveAiRoutingConfig,
} from "./ai-routing-config-store";

const storedConfig = {
  liveClassifierEnabled: false,
  executionRoutingMode: "active",
  executionRoutingAllocationPercent: 50,
  executionRoutingTasks: ["social", "rewrite"],
  updatedAt: new Date("2026-08-15T10:00:00.000Z"),
};

describe("AI routing config store", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AI_LIVE_CLASSIFIER_ENABLED", "false");
    vi.stubEnv("AI_EXECUTION_ROUTING_MODE", "off");
    vi.stubEnv("AI_EXECUTION_ROUTING_PERCENT", "0");
    vi.stubEnv("AI_EXECUTION_ROUTING_TASKS", "");
    mocks.findUnique.mockReset();
    mocks.upsert.mockReset();
    mocks.loggerWarn.mockReset();
    mocks.loggerError.mockReset();
    resetAiRoutingConfigCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads a persisted config once and serves subsequent reads from cache", async () => {
    mocks.findUnique.mockResolvedValue(storedConfig);

    const first = await getAiRoutingRuntimeConfig();
    const second = await getAiRoutingRuntimeConfig();

    expect(first).toEqual({
      ...storedConfig,
      source: "database",
    });
    expect(second).toBe(first);
    expect(mocks.findUnique).toHaveBeenCalledOnce();
  });

  it("falls back to environment settings when the database is unavailable", async () => {
    mocks.findUnique.mockRejectedValue(new Error("database unavailable"));

    await expect(getAiRoutingRuntimeConfig()).resolves.toEqual({
      liveClassifierEnabled: false,
      executionRoutingMode: "off",
      executionRoutingAllocationPercent: 0,
      executionRoutingTasks: [],
      source: "environment",
      updatedAt: null,
    });
    expect(mocks.loggerWarn).toHaveBeenCalledOnce();
  });

  it("persists and caches an admin update", async () => {
    mocks.upsert.mockResolvedValue({
      ...storedConfig,
      updatedAt: new Date("2026-08-15T10:05:00.000Z"),
    });

    const saved = await saveAiRoutingConfig(
      {
        liveClassifierEnabled: false,
        executionRoutingMode: "active",
        executionRoutingAllocationPercent: 50,
        executionRoutingTasks: ["social", "rewrite"],
      },
      "admin-1",
    );

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "default" },
        create: expect.objectContaining({ updatedByUserId: "admin-1" }),
        update: expect.objectContaining({ updatedByUserId: "admin-1" }),
      }),
    );
    expect(saved.source).toBe("database");
    expect(await getAiRoutingRuntimeConfig()).toBe(saved);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
