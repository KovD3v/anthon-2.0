import { describe, expect, it } from "vitest";
import { assertConfigurationMutable, getLifecycleTarget } from "./lifecycle";

describe("model experiment lifecycle", () => {
  it("allows only explicit lifecycle transitions", () => {
    expect(getLifecycleTarget("DRAFT", "READY")).toBe("READY");
    expect(getLifecycleTarget("READY", "ACTIVATE")).toBe("ACTIVE");
    expect(getLifecycleTarget("ACTIVE", "PAUSE")).toBe("PAUSED");
    expect(getLifecycleTarget("PAUSED", "RESUME")).toBe("ACTIVE");
    expect(getLifecycleTarget("ACTIVE", "COMPLETE")).toBe("COMPLETED");
    expect(() => getLifecycleTarget("DRAFT", "ACTIVATE")).toThrow(
      "INVALID_LIFECYCLE_TRANSITION",
    );
  });

  it("freezes variant configuration after draft", () => {
    expect(() => assertConfigurationMutable("DRAFT")).not.toThrow();
    for (const status of ["READY", "ACTIVE", "PAUSED", "COMPLETED"]) {
      expect(() => assertConfigurationMutable(status)).toThrow(
        "CONFIGURATION_IMMUTABLE",
      );
    }
  });
});
