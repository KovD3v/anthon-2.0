import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TurnClassifierProposal } from "./turn-classification";

const mocks = vi.hoisted(() => ({ classifyTurn: vi.fn() }));

vi.mock("./turn-classification", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./turn-classification")>()),
  classifyTurn: mocks.classifyTurn,
}));

import { arbitrateTurn } from "./turn-arbitration";

const classifierProposal: TurnClassifierProposal = {
  capabilities: {
    rag: "no",
    webSearch: "no",
    webFetch: "no",
    memoryRead: "no",
    memoryWrite: "no",
    memoryDelete: "no",
    routineProposal: "no",
    userContext: "no",
    voiceOutput: "no",
  },
  capabilityConfidence: 0.95,
  workload: {
    taskKind: "rewrite",
    contextDependency: "none",
    knowledgeNeed: "supplied_only",
    reasoningDepth: "minimal",
    sensitivity: "ordinary",
    suggestedProfile: "light",
    confidence: 0.96,
  },
};

function agenticInput(
  overrides: Partial<Parameters<typeof arbitrateTurn>[0]> = {},
) {
  return {
    userId: "user-1",
    userMessage: "Rendilo più breve",
    classifierContext: "web_search_rule=no_web_search_intent",
    classifierModelId: "qwen/qwen3.6-27b",
    plannerMode: "agentic" as const,
    isGuest: false,
    memoryEnabled: true,
    voiceAllowed: false,
    responseMode: "text" as const,
    explicitWebRule: "allowed" as const,
    hasDeterministicCoachingIntent: false,
    requiresExternalKnowledge: false,
    inputOrigin: "text" as const,
    hasPendingApproval: false,
    estimatedInputTokens: 120,
    requestedOutputTokens: 120,
    ...overrides,
  };
}

describe("turn arbitration", () => {
  beforeEach(() => {
    mocks.classifyTurn.mockReset();
    mocks.classifyTurn.mockResolvedValue({
      proposal: classifierProposal,
      outcome: "accepted",
      latencyMs: 25,
    });
  });

  it("returns one immutable agentic turn decision", async () => {
    const result = await arbitrateTurn(agenticInput());

    expect(result.decision.capabilities.webSearch).toBe(false);
    expect(result.decision.execution.eligibleProfile).toBe("light");
    expect(Object.isFrozen(result.decision)).toBe(true);
    expect(Object.isFrozen(result.decision.execution.reasonCodes)).toBe(true);
    expect(result.classificationLatencyMs).toBe(25);
  });

  it("does not classify legacy turns", async () => {
    const result = await arbitrateTurn(agenticInput({ plannerMode: "legacy" }));

    expect(mocks.classifyTurn).not.toHaveBeenCalled();
    expect(result.decision.execution).toMatchObject({
      eligibleProfile: "standard",
      reasonCodes: expect.arrayContaining(["legacy_mode"]),
    });
    expect(result.classificationLatencyMs).toBe(0);
  });

  it("classifies each agentic turn exactly once", async () => {
    await arbitrateTurn(agenticInput());

    expect(mocks.classifyTurn).toHaveBeenCalledTimes(1);
    expect(mocks.classifyTurn).toHaveBeenCalledWith({
      userId: "user-1",
      userMessage: "Rendilo più breve",
      context: "web_search_rule=no_web_search_intent",
      modelId: "qwen/qwen3.6-27b",
      abortSignal: undefined,
    });
  });

  it("preserves deterministic capability rules while uncertainty forces standard", async () => {
    mocks.classifyTurn.mockResolvedValueOnce({
      proposal: {
        ...classifierProposal,
        capabilities: {
          ...classifierProposal.capabilities,
          webSearch: "uncertain",
        },
      },
      outcome: "accepted",
      latencyMs: 25,
    });

    const result = await arbitrateTurn(
      agenticInput({ explicitWebRule: "required" }),
    );

    expect(result.decision.capabilities.webSearch).toBe(true);
    expect(result.decision.execution).toMatchObject({
      eligibleProfile: "standard",
      reasonCodes: expect.arrayContaining([
        "capability_uncertain",
        "capability_required",
      ]),
    });
  });

  it("fails closed when classification fails", async () => {
    mocks.classifyTurn.mockResolvedValueOnce({
      proposal: null,
      outcome: "failed",
      latencyMs: 25,
    });

    const result = await arbitrateTurn(agenticInput());

    expect(result.decision.execution).toMatchObject({
      eligibleProfile: "standard",
      reasonCodes: expect.arrayContaining(["classifier_failure"]),
    });
  });

  it("propagates classifier cancellation", async () => {
    const controller = new AbortController();
    const abortError = new DOMException("request cancelled", "AbortError");
    controller.abort(abortError);
    mocks.classifyTurn.mockRejectedValueOnce(abortError);

    await expect(
      arbitrateTurn(agenticInput({ abortSignal: controller.signal })),
    ).rejects.toBe(abortError);
  });
});
