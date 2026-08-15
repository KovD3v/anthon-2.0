import { describe, expect, it } from "vitest";
import {
  filterCapabilityUsageByDecision,
  normalizeCapabilityUsage,
} from "./capability-usage";

describe("capability usage", () => {
  it("keeps recall in the closed persisted vocabulary", () => {
    expect(normalizeCapabilityUsage(["unknown", "recall", "memory"])).toEqual([
      "memory",
      "recall",
    ]);
  });

  it("keeps actual model-selected tools in telemetry", () => {
    expect(
      filterCapabilityUsageByDecision(
        ["web", "memory", "rag"],
        {
          rag: false,
          webSearch: false,
          webFetch: false,
          memoryRead: false,
          memoryWrite: false,
          memoryDelete: false,
          memoryDeleteTarget: null,
          routineProposal: false,
          userContext: false,
          voiceOutput: false,
          source: "rule",
          reasonCodes: [],
        },
        "agentic",
        true,
      ),
    ).toEqual(["rag", "web", "memory"]);
  });
});
