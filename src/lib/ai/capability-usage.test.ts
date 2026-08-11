import { describe, expect, it } from "vitest";
import { normalizeCapabilityUsage } from "./capability-usage";

describe("capability usage", () => {
  it("keeps recall in the closed persisted vocabulary", () => {
    expect(normalizeCapabilityUsage(["unknown", "recall", "memory"])).toEqual([
      "memory",
      "recall",
    ]);
  });
});
