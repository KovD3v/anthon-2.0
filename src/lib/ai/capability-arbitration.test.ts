import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCapabilityClassifierPrompt,
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

  it("keeps an agentic routine proposal alongside required web research", () => {
    const decision = arbitrate({
      explicitWebRule: "required",
      allowConcurrentRoutineAndWeb: true,
      classifier: { rag: true, routineProposal: true },
    });

    expect(decision.webSearch).toBe(true);
    expect(decision.rag).toBe(true);
    expect(decision.routineProposal).toBe(true);
  });

  it("requires classifier selection when agentic routine arbitration requests it", () => {
    const decision = arbitrate({
      userMessage: "Dammi una routine mentale prima della gara",
      requireClassifierRoutineProposal: true,
      classifier: { routineProposal: false },
    });

    expect(decision.routineProposal).toBe(false);
  });

  it("normalizes an attributable pending approval into the immutable decision", () => {
    const decision = arbitrate({
      userMessage: "Sì, confermo.",
      hasPendingMemoryApproval: true,
    });

    expect(decision.memoryWrite).toBe(true);
    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.reasonCodes)).toBe(true);
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

  it("requires an exact resolved target before enabling memory deletion", () => {
    const genericForget = arbitrate({
      userMessage: "Dimentica quella informazione",
      classifier: { memoryDelete: true },
    });
    const resolvedTarget = arbitrate({
      userMessage: "Dimentica quella informazione",
      classifier: { memoryDelete: true },
      resolvedMemoryTarget: "training_goal",
    });
    const wildcardTarget = arbitrate({
      userMessage: "Dimentica quella informazione",
      resolvedMemoryTarget: "*",
    });
    const broadCategoryTarget = arbitrate({
      userMessage: "Dimentica quella informazione",
      classifier: { memoryDelete: true },
      resolvedMemoryTarget: "identity",
    });

    expect(genericForget.memoryDelete).toBe(false);
    expect(genericForget.reasonCodes).toContain("delete_requires_exact_target");
    expect(resolvedTarget.memoryDelete).toBe(true);
    expect(resolvedTarget.memoryDeleteTarget).toBe("training_goal");
    expect(wildcardTarget.memoryDelete).toBe(false);
    expect(wildcardTarget.memoryDeleteTarget).toBeNull();
    expect(broadCategoryTarget.memoryDelete).toBe(false);
    expect(broadCategoryTarget.memoryDeleteTarget).toBeNull();
  });

  it.each([
    "Dimentica questo",
    "Dimentica questa cosa",
    "Dimentica la mia preferenza: mi alleno al mattino.",
  ])(
    "enables deleteMemory for a resolved natural target: %s",
    (userMessage) => {
      const decision = arbitrate({
        userMessage,
        classifier: { memoryDelete: true },
        resolvedMemoryTarget: "training_schedule",
      });

      expect(decision.memoryDelete).toBe(true);
      expect(decision.memoryDeleteTarget).toBe("training_schedule");
    },
  );

  it("keeps natural deletion disabled when the server cannot resolve a target", () => {
    const decision = arbitrate({
      userMessage: "Dimentica questo",
      classifier: { memoryDelete: true },
    });

    expect(decision.memoryDelete).toBe(false);
    expect(decision.memoryDeleteTarget).toBeNull();
  });

  it("does not enable deletion for a coaching continuation even with a target", () => {
    const decision = arbitrate({
      userMessage: "Dimentica la tensione prima della gara e concentrati.",
      classifier: { memoryDelete: true },
      resolvedMemoryTarget: "pre_game_tension",
    });

    expect(decision.memoryDelete).toBe(false);
    expect(decision.memoryDeleteTarget).toBeNull();
  });

  it.each([
    ["required", true],
    ["forbidden", false],
  ] as const)(
    "keeps independent RAG arbitration when web is %s",
    (explicitWebRule, webSearch) => {
      const decision = arbitrate({
        explicitWebRule,
        classifier: { rag: true, webSearch: true },
      });

      expect(decision.rag).toBe(true);
      expect(decision.webSearch).toBe(webSearch);
    },
  );

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

  it("allows a classifier-selected conservative low-risk inferred memory write", () => {
    const decision = arbitrate({
      userMessage: "Di solito mi alleno al mattino.",
      classifier: { memoryWrite: true },
    });

    expect(decision.memoryWrite).toBe(true);
  });

  it("does not require explicit persistence language for low-risk classifier selection", () => {
    const prompt = buildCapabilityClassifierPrompt(
      "Di solito mi alleno al mattino.",
      "web_search_rule=not_required",
    );

    expect(prompt).toContain("ordinary low-risk durable facts");
    expect(prompt).not.toContain(
      "Persistent-memory changes require an explicit user request",
    );
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
