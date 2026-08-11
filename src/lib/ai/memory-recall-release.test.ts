import { afterEach, describe, expect, it, vi } from "vitest";

const originalMode = process.env.AI_MEMORY_RECALL_MODE;
afterEach(() => {
  vi.unstubAllEnvs();
  process.env.AI_MEMORY_RECALL_MODE = originalMode;
});

describe("memory recall release", () => {
  it.each([
    [undefined, false, true, "off", "default_off"],
    ["active", true, true, "off", "guest"],
    ["active", false, false, "off", "memory_disabled"],
    ["invalid", false, true, "off", "invalid_mode"],
    ["shadow", false, true, "shadow", "configured"],
    ["active", false, true, "active", "configured"],
  ])("resolves mode fail closed", async (env, isGuest, enabled, mode, reason) => {
    if (env === undefined) delete process.env.AI_MEMORY_RECALL_MODE;
    else process.env.AI_MEMORY_RECALL_MODE = env;
    const { resolveMemoryRecallMode } = await import("./memory-recall-release");
    const result = await resolveMemoryRecallMode({
      userId: "user-1",
      isGuest,
      memoryEnabled: enabled,
    });
    expect(result).toEqual({ mode, reason });
    expect(Object.isFrozen(result)).toBe(true);
  });
});
