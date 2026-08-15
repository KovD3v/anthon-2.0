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

  it("allows the standard agentic model to choose available tools", () => {
    const state = {
      isGuest: false,
      recallActive: false,
      modelSelectsTools: true,
      capabilities: {},
    };

    expect(resolveToolPolicy("tinyfishSearch", state)).not.toBeNull();
    expect(resolveToolPolicy("saveMemory", state)).not.toBeNull();
    expect(resolveToolPolicy("proposeRoutine", state)).not.toBeNull();
  });

  it("keeps guest and recall safety guards authoritative in model-selection mode", () => {
    const guestState = {
      isGuest: true,
      recallActive: true,
      modelSelectsTools: true,
      capabilities: {},
    };
    const inactiveRecallState = {
      isGuest: false,
      recallActive: false,
      modelSelectsTools: true,
      capabilities: {},
    };

    expect(resolveToolPolicy("saveMemory", guestState)).toBeNull();
    expect(resolveToolPolicy("getMemories", guestState)).toBeNull();
    expect(
      resolveToolPolicy("searchPastConversations", inactiveRecallState),
    ).toBeNull();
  });
});
