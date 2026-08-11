import { describe, expect, it } from "vitest";
import { ToolOutcomeTracker } from "./tool-outcomes";

describe("tool outcome tracker", () => {
  it("records aggregate funnel counts without payloads", () => {
    const tracker = new ToolOutcomeTracker(["recallFacts"]);
    tracker.allowed("recallFacts");
    tracker.called("recallFacts");
    tracker.completed("recallFacts", { success: true, data: [{ private: "secret" }] });
    tracker.utilized("recallFacts");
    expect(tracker.summary()).toEqual({ considered: 1, allowed: 1, called: 1, succeeded: 1, useful: 1, utilized: 1 });
    expect(JSON.stringify(tracker.summary())).not.toContain("secret");
  });
});
