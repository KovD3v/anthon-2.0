import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCapabilityPlannerMode,
  normalizeCapabilityDecision,
} from "./capability-arbitration";

function arbitrate(
  overrides: Partial<Parameters<typeof normalizeCapabilityDecision>[0]> = {},
) {
  return normalizeCapabilityDecision({
    userMessage: "Motivami prima dell'allenamento",
    isGuest: false,
    memoryEnabled: true,
    voiceAllowed: false,
    responseMode: "text",
    explicitWebRule: "allowed",
    classifier: null,
    ...overrides,
  });
}

describe("capability arbitration", () => {
  it("keeps classifier-selected RAG and web capabilities together", () => {
    const decision = arbitrate({
      classifier: { rag: true, webSearch: true, webFetch: true },
    });

    expect(decision.rag).toBe(true);
    expect(decision.webSearch).toBe(true);
    expect(decision.webFetch).toBe(true);
    expect(decision.source).toBe("classifier");
  });

  it("clears classifier web capabilities when the web rule forbids them", () => {
    const decision = arbitrate({
      explicitWebRule: "forbidden",
      classifier: { webSearch: true, webFetch: true },
    });

    expect(decision.webSearch).toBe(false);
    expect(decision.webFetch).toBe(false);
    expect(decision.reasonCodes).toContain("web_rule_forbidden");
  });

  it("keeps guest routine proposals while denying persistent memory", () => {
    const decision = arbitrate({
      isGuest: true,
      classifier: {
        memoryRead: true,
        memoryWrite: true,
        memoryDelete: true,
        routineProposal: true,
        userContext: true,
      },
    });

    expect(decision.memoryRead).toBe(false);
    expect(decision.memoryWrite).toBe(false);
    expect(decision.memoryDelete).toBe(false);
    expect(decision.userContext).toBe(false);
    expect(decision.routineProposal).toBe(true);
    expect(decision.reasonCodes).toContain("guest_memory_denied");
  });

  it("clears memory capabilities when persistent memory is disabled", () => {
    const decision = arbitrate({
      memoryEnabled: false,
      classifier: {
        memoryRead: true,
        memoryWrite: true,
        memoryDelete: true,
      },
    });

    expect(decision.memoryRead).toBe(false);
    expect(decision.memoryWrite).toBe(false);
    expect(decision.memoryDelete).toBe(false);
    expect(decision.reasonCodes).toContain("memory_disabled");
  });

  it("enables voice output only for voice mode with voice entitlement", () => {
    const denied = arbitrate({
      responseMode: "voice",
      voiceAllowed: false,
      classifier: { voiceOutput: true },
    });
    const allowed = arbitrate({
      responseMode: "voice",
      voiceAllowed: true,
      classifier: { voiceOutput: true },
    });

    expect(denied.voiceOutput).toBe(false);
    expect(denied.reasonCodes).toContain("voice_guard_denied");
    expect(allowed.voiceOutput).toBe(true);
  });

  it("requires explicit forget intent before enabling memory deletion", () => {
    const explicit = arbitrate({
      userMessage: "Dimentica quella informazione",
      classifier: { memoryDelete: true },
    });
    const ambiguous = arbitrate({
      userMessage: "Elimina la routine dalla risposta",
      classifier: { memoryDelete: true },
    });

    expect(explicit.memoryDelete).toBe(true);
    expect(ambiguous.memoryDelete).toBe(false);
    expect(ambiguous.reasonCodes).toContain("delete_requires_explicit_intent");
  });

  it("returns a conservative fallback when classification is unavailable", () => {
    const decision = arbitrate({ classifier: null });

    expect(decision).toMatchObject({
      rag: false,
      webSearch: false,
      webFetch: false,
      memoryRead: false,
      memoryWrite: false,
      memoryDelete: false,
      routineProposal: false,
      userContext: false,
      voiceOutput: false,
      source: "fallback",
    });
    expect(decision.reasonCodes).toContain("classifier_unavailable");
  });
});

describe("capability planner mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([undefined, "invalid"])("defaults %s to legacy", (mode) => {
    if (mode === undefined) {
      vi.stubEnv("AI_CAPABILITY_PLANNER_MODE", "");
    } else {
      vi.stubEnv("AI_CAPABILITY_PLANNER_MODE", mode);
    }

    expect(getCapabilityPlannerMode()).toBe("legacy");
  });

  it("keeps the explicit agentic mode", () => {
    vi.stubEnv("AI_CAPABILITY_PLANNER_MODE", "agentic");

    expect(getCapabilityPlannerMode()).toBe("agentic");
  });
});
