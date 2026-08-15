import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getEnvironmentAiRoutingConfig,
  parseAiRoutingConfig,
  parsePersistedAiRoutingConfig,
} from "./ai-routing-config";

describe("AI routing configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts an allowlist and the live-classifier switch", () => {
    expect(
      parseAiRoutingConfig({
        liveClassifierEnabled: false,
        executionRoutingMode: "active",
        executionRoutingAllocationPercent: 50,
        executionRoutingTasks: ["social", "rewrite"],
      }),
    ).toEqual({
      liveClassifierEnabled: false,
      executionRoutingMode: "active",
      executionRoutingAllocationPercent: 50,
      executionRoutingTasks: ["social", "rewrite"],
    });
  });

  it("rejects duplicate tasks and an active rollout without an allowlist", () => {
    expect(() =>
      parseAiRoutingConfig({
        liveClassifierEnabled: false,
        executionRoutingMode: "active",
        executionRoutingAllocationPercent: 50,
        executionRoutingTasks: ["social", "social"],
      }),
    ).toThrow();

    expect(() =>
      parseAiRoutingConfig({
        liveClassifierEnabled: false,
        executionRoutingMode: "active",
        executionRoutingAllocationPercent: 50,
        executionRoutingTasks: [],
      }),
    ).toThrow();
  });

  it("maps the existing environment settings to the admin shape", () => {
    expect(
      getEnvironmentAiRoutingConfig({
        AI_LIVE_CLASSIFIER_ENABLED: "true",
        AI_EXECUTION_ROUTING_MODE: "active",
        AI_EXECUTION_ROUTING_PERCENT: "25",
        AI_EXECUTION_ROUTING_TASKS: "social,rewrite",
      }),
    ).toEqual({
      liveClassifierEnabled: true,
      executionRoutingMode: "active",
      executionRoutingAllocationPercent: 25,
      executionRoutingTasks: ["social", "rewrite"],
    });
  });

  it("fails closed when a persisted configuration is malformed", () => {
    expect(
      parsePersistedAiRoutingConfig({
        liveClassifierEnabled: true,
        executionRoutingMode: "active",
        executionRoutingAllocationPercent: 50,
        executionRoutingTasks: ["not-a-task"],
      }),
    ).toBeNull();
  });
});
