import { describe, expect, it } from "vitest";
import type { CapabilityDecision } from "./capability-arbitration";
import {
  buildPlannedExecution,
  EXECUTION_POLICY_VERSION,
  type ExecutionReasonCode,
  freezeTurnDecision,
  LIGHT_MAX_INPUT_TOKENS,
  LIGHT_MAX_OUTPUT_TOKENS,
  normalizeExecutionDecision,
  parseExecutionRoutingConfig,
  resolvePlannedProfile,
  TURN_CLASSIFIER_VERSION,
} from "./execution-routing";
import type {
  CapabilityClassifierProposal,
  WorkloadProposal,
} from "./turn-classification";

const ALL_REASON_CODES = [
  "classifier_light",
  "classifier_standard",
  "task_allowlisted",
  "task_not_allowlisted",
  "low_confidence",
  "capability_required",
  "capability_uncertain",
  "external_knowledge",
  "deep_context",
  "sensitive_content",
  "direct_media",
  "pending_approval",
  "voice_output",
  "input_limit",
  "output_limit",
  "classifier_failure",
  "legacy_mode",
  "task_rollout_disabled",
  "rollout_off",
  "rollout_shadow",
  "runtime_invariant",
] as const satisfies ExecutionReasonCode[];

const lightWorkload: WorkloadProposal = {
  taskKind: "rewrite",
  contextDependency: "recent",
  knowledgeNeed: "supplied_only",
  reasoningDepth: "minimal",
  sensitivity: "ordinary",
  suggestedProfile: "light",
  confidence: 0.95,
};

function capabilityProposal(
  overrides: Partial<CapabilityClassifierProposal> = {},
): CapabilityClassifierProposal {
  return {
    rag: "no",
    webSearch: "no",
    webFetch: "no",
    memoryRead: "no",
    memoryWrite: "no",
    memoryDelete: "no",
    routineProposal: "no",
    userContext: "no",
    voiceOutput: "no",
    ...overrides,
  };
}

function capabilityDecision(
  overrides: Partial<CapabilityDecision> = {},
): CapabilityDecision {
  return {
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
    source: "fallback",
    reasonCodes: [],
    ...overrides,
  };
}

function route(
  overrides: Partial<Parameters<typeof normalizeExecutionDecision>[0]> = {},
) {
  return normalizeExecutionDecision({
    plannerMode: "agentic",
    classifierOutcome: "accepted",
    classifierVersion: TURN_CLASSIFIER_VERSION,
    capabilityProposal: capabilityProposal(),
    capabilityConfidence: 0.95,
    workload: lightWorkload,
    capabilities: capabilityDecision(),
    hasDeterministicCoachingIntent: false,
    requiresExternalKnowledge: false,
    inputOrigin: "text",
    hasPendingApproval: false,
    responseMode: "text",
    estimatedInputTokens: LIGHT_MAX_INPUT_TOKENS,
    requestedOutputTokens: LIGHT_MAX_OUTPUT_TOKENS,
    ...overrides,
  });
}

describe("execution routing", () => {
  it.each([
    "social",
    "rewrite",
    "translate",
    "format",
    "extract",
    "summarize_supplied",
  ] as const)("allows high-confidence %s work", (taskKind) => {
    expect(
      route({ workload: { ...lightWorkload, taskKind } }).eligibleProfile,
    ).toBe("light");
  });

  it.each([
    ["coaching", { workload: { ...lightWorkload, taskKind: "coaching" } }],
    ["low confidence", { workload: { ...lightWorkload, confidence: 0.899 } }],
    ["low capability confidence", { capabilityConfidence: 0.699 }],
    [
      "external knowledge",
      { workload: { ...lightWorkload, knowledgeNeed: "external" } },
    ],
    [
      "deep context",
      { workload: { ...lightWorkload, contextDependency: "deep" } },
    ],
    ["deterministic coaching intent", { hasDeterministicCoachingIntent: true }],
    ["deterministic external intent", { requiresExternalKnowledge: true }],
    [
      "tool capability",
      { capabilities: capabilityDecision({ webSearch: true }) },
    ],
    [
      "uncertain capability",
      { capabilityProposal: capabilityProposal({ rag: "uncertain" }) },
    ],
    ["direct media", { inputOrigin: "direct_media" }],
    ["pending approval", { hasPendingApproval: true }],
    ["voice", { responseMode: "voice" }],
    ["input limit", { estimatedInputTokens: 8_001 }],
    ["output limit", { requestedOutputTokens: 601 }],
  ] as const)("forces standard for %s", (_, overrides) => {
    expect(route(overrides).eligibleProfile).toBe("standard");
  });

  it("fails closed for classifier failures and legacy mode", () => {
    expect(route({ classifierOutcome: "failed" })).toMatchObject({
      eligibleProfile: "standard",
      source: "fallback",
    });
    expect(route({ classifierOutcome: "low_confidence" })).toMatchObject({
      eligibleProfile: "standard",
      source: "fallback",
    });
    expect(route({ plannerMode: "legacy" })).toMatchObject({
      eligibleProfile: "standard",
      source: "fallback",
    });
  });

  it("deep freezes the turn decision", () => {
    const frozen = freezeTurnDecision({
      version: 1,
      capabilities: capabilityDecision(),
      execution: route(),
    });

    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.capabilities)).toBe(true);
    expect(Object.isFrozen(frozen.capabilities.reasonCodes)).toBe(true);
    expect(Object.isFrozen(frozen.execution)).toBe(true);
    expect(Object.isFrozen(frozen.execution.reasonCodes)).toBe(true);
  });

  it("emits only closed reason codes", () => {
    const decision = route({
      capabilityConfidence: 0.2,
      capabilityProposal: capabilityProposal({ rag: "uncertain" }),
      capabilities: capabilityDecision({ webSearch: true }),
      workload: {
        ...lightWorkload,
        taskKind: "coaching",
        confidence: 0.2,
        knowledgeNeed: "external",
        contextDependency: "deep",
        sensitivity: "coaching",
        suggestedProfile: "standard",
      },
      inputOrigin: "direct_media",
      hasPendingApproval: true,
      responseMode: "voice",
      estimatedInputTokens: 12_000,
      requestedOutputTokens: 900,
    });

    expect(
      decision.reasonCodes.every((code) => ALL_REASON_CODES.includes(code)),
    ).toBe(true);
  });

  it("parses a valid rollout config", () => {
    expect(
      parseExecutionRoutingConfig({
        AI_EXECUTION_ROUTING_MODE: "active",
        AI_EXECUTION_ROUTING_ALLOCATION_PERCENT: "25",
        AI_EXECUTION_ROUTING_TASKS: "social,rewrite,translate",
      }),
    ).toEqual({
      mode: "active",
      allocationPercent: 25,
      enabledTaskKinds: ["social", "rewrite", "translate"],
    });
  });

  it("prefers the canonical percent setting over the legacy allocation alias", () => {
    expect(
      parseExecutionRoutingConfig({
        AI_EXECUTION_ROUTING_MODE: "active",
        AI_EXECUTION_ROUTING_PERCENT: "25",
        AI_EXECUTION_ROUTING_ALLOCATION_PERCENT: "100",
        AI_EXECUTION_ROUTING_TASKS: "social,rewrite,translate",
      }),
    ).toEqual({
      mode: "active",
      allocationPercent: 25,
      enabledTaskKinds: ["social", "rewrite", "translate"],
    });
  });

  it.each([undefined, ""])(
    "fails closed when the active rollout task allowlist is %s",
    (tasks) => {
      expect(
        parseExecutionRoutingConfig({
          AI_EXECUTION_ROUTING_MODE: "active",
          AI_EXECUTION_ROUTING_PERCENT: "25",
          ...(tasks === undefined ? {} : { AI_EXECUTION_ROUTING_TASKS: tasks }),
        }),
      ).toEqual({
        mode: "off",
        allocationPercent: 0,
        enabledTaskKinds: [],
      });
    },
  );

  it("defaults invalid rollout config to off", () => {
    expect(parseExecutionRoutingConfig({})).toEqual({
      mode: "off",
      allocationPercent: 0,
      enabledTaskKinds: [],
    });
    expect(
      parseExecutionRoutingConfig({
        AI_EXECUTION_ROUTING_MODE: "ACTIVE",
        AI_EXECUTION_ROUTING_ALLOCATION_PERCENT: "10",
        AI_EXECUTION_ROUTING_TASKS: "rewrite",
      }),
    ).toEqual({
      mode: "off",
      allocationPercent: 0,
      enabledTaskKinds: [],
    });
    expect(
      parseExecutionRoutingConfig({
        AI_EXECUTION_ROUTING_MODE: "active",
        AI_EXECUTION_ROUTING_ALLOCATION_PERCENT: "101",
        AI_EXECUTION_ROUTING_TASKS: "rewrite",
      }),
    ).toEqual({
      mode: "off",
      allocationPercent: 0,
      enabledTaskKinds: [],
    });
    expect(
      parseExecutionRoutingConfig({
        AI_EXECUTION_ROUTING_MODE: "active",
        AI_EXECUTION_ROUTING_ALLOCATION_PERCENT: "50",
        AI_EXECUTION_ROUTING_TASKS: "rewrite,knowledge",
      }),
    ).toEqual({
      mode: "off",
      allocationPercent: 0,
      enabledTaskKinds: [],
    });
  });

  it("plans standard with rollout reasons when rollout is off or shadow", () => {
    const decision = route();

    expect(
      resolvePlannedProfile(
        decision,
        { mode: "off", allocationPercent: 100, enabledTaskKinds: ["rewrite"] },
        "turn-1",
      ),
    ).toMatchObject({
      routingMode: "off",
      eligibleProfile: "light",
      plannedProfile: "standard",
      reasonCodes: ["rollout_off"],
    });

    expect(
      resolvePlannedProfile(
        decision,
        {
          mode: "shadow",
          allocationPercent: 100,
          enabledTaskKinds: ["rewrite"],
        },
        "turn-1",
      ),
    ).toMatchObject({
      routingMode: "shadow",
      eligibleProfile: "light",
      plannedProfile: "standard",
      reasonCodes: ["rollout_shadow"],
    });
  });

  it("keeps active non-allowlisted light work on standard", () => {
    expect(
      resolvePlannedProfile(
        route(),
        {
          mode: "active",
          allocationPercent: 100,
          enabledTaskKinds: ["social"],
        },
        "turn-2",
      ),
    ).toMatchObject({
      routingMode: "active",
      eligibleProfile: "light",
      plannedProfile: "standard",
      reasonCodes: ["task_rollout_disabled"],
    });
  });

  it("uses deterministic allocation for the same stable key", () => {
    const decision = route();
    const config = {
      mode: "active" as const,
      allocationPercent: 50,
      enabledTaskKinds: ["rewrite"] as const,
    };

    const first = resolvePlannedProfile(decision, config, "same-key-123");
    const second = resolvePlannedProfile(decision, config, "same-key-123");

    expect(first).toEqual(second);
  });

  it("builds a versioned light bundle with a prevalidated standard fallback", () => {
    const planned = buildPlannedExecution({
      decision: route(),
      config: {
        mode: "active",
        allocationPercent: 100,
        enabledTaskKinds: ["rewrite"],
      },
      stableKey: "light-policy",
    });

    expect(planned).toMatchObject({
      routingMode: "active",
      eligibleProfile: "light",
      plannedProfile: "light",
      primary: {
        version: 1,
        profile: "light",
        promptProfile: "light",
        toolPolicy: "none",
        reasoningBudget: "minimal",
        maxOutputTokens: 600,
      },
      standardFallback: {
        version: 1,
        profile: "standard",
        promptProfile: "existing",
        toolPolicy: "planned",
        reasoningBudget: "normal",
      },
    });
    expect(Object.isFrozen(planned.primary)).toBe(true);
    expect(Object.isFrozen(planned.standardFallback)).toBe(true);
  });

  it("builds no fallback for planned standard execution", () => {
    const planned = buildPlannedExecution({
      decision: route(),
      config: { mode: "off", allocationPercent: 0, enabledTaskKinds: [] },
      stableKey: "standard-policy",
    });

    expect(planned.primary.profile).toBe("standard");
    expect(planned.standardFallback).toBeUndefined();
  });

  it("exports versioned policy constants", () => {
    expect(EXECUTION_POLICY_VERSION).toBe(1);
    expect(TURN_CLASSIFIER_VERSION).toBe(1);
  });
});
