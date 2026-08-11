import { describe, expect, it } from "vitest";
import { resolveToolPolicy } from "./tool-policy";

describe("tool policy", () => {
  it("fails closed and enforces recall and mutation prerequisites", () => {
    const state = {
      isGuest: false,
      recallActive: true,
      capabilities: { memoryWrite: true, webSearch: true },
    };
    expect(resolveToolPolicy("rememberFact", state)?.class).toBe("mutation");
    expect(
      resolveToolPolicy("expandConversationEvidence", state)?.requires,
    ).toContain("searchPastConversations");
    expect(resolveToolPolicy("unknown", state)).toBeNull();
    expect(
      resolveToolPolicy("rememberFact", { ...state, isGuest: true }),
    ).toBeNull();
  });
});
