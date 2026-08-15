import { describe, expect, it } from "vitest";
import type { TurnDecision } from "./execution-routing";
import {
  parseSafeTurnDecision,
  serializeSafeTurnDecision,
} from "./turn-decision-metadata";

function turnDecision(): TurnDecision {
  return {
    version: 1,
    capabilities: {
      rag: false,
      webSearch: false,
      webFetch: false,
      memoryRead: true,
      memoryWrite: false,
      memoryDelete: true,
      memoryDeleteTarget: "training_schedule",
      routineProposal: false,
      userContext: true,
      voiceOutput: false,
      source: "mixed",
      reasonCodes: ["delete_requires_exact_target"],
    },
    execution: {
      eligibleProfile: "standard",
      taskKind: "coaching",
      contextDependency: "deep",
      source: "mixed",
      confidenceBucket: "high",
      reasonCodes: ["capability_required", "deep_context"],
      policyVersion: 1,
      classifierVersion: 1,
    },
  };
}

function deterministicTurnDecision() {
  return {
    ...turnDecision(),
    capabilities: {
      ...turnDecision().capabilities,
      source: "rule" as const,
    },
  } satisfies TurnDecision;
}

describe("safe turn decision metadata", () => {
  it("serializes only closed capability and execution fields", () => {
    const decision = turnDecision() as TurnDecision & {
      classifierOutput: string;
      userText: string;
      classifierProse: string;
      encryptedPayload: string;
    };
    decision.classifierOutput = "raw classifier output";
    decision.userText = "private user text";
    decision.classifierProse = "private classifier prose";
    decision.encryptedPayload = "ciphertext";

    const serialized = serializeSafeTurnDecision(decision);

    expect(serialized).toEqual({
      version: 1,
      capabilities: {
        rag: false,
        webSearch: false,
        webFetch: false,
        memoryRead: true,
        memoryWrite: false,
        memoryDelete: true,
        routineProposal: false,
        userContext: true,
        voiceOutput: false,
        source: "mixed",
        reasonCodes: ["delete_requires_exact_target"],
      },
      execution: {
        eligibleProfile: "standard",
        taskKind: "coaching",
        contextDependency: "deep",
        source: "mixed",
        confidenceBucket: "high",
        reasonCodes: ["capability_required", "deep_context"],
        policyVersion: 1,
        classifierVersion: 1,
      },
    });
    expect(JSON.stringify(serialized)).not.toContain("training_schedule");
    expect(JSON.stringify(serialized)).not.toContain("raw classifier output");
    expect(JSON.stringify(serialized)).not.toContain("private user text");
    expect(JSON.stringify(serialized)).not.toContain(
      "private classifier prose",
    );
    expect(JSON.stringify(serialized)).not.toContain("ciphertext");
  });

  it("reconstructs a deeply frozen runtime decision with a null delete target", () => {
    const parsed = parseSafeTurnDecision(
      serializeSafeTurnDecision(turnDecision()),
    );

    expect(parsed).toMatchObject({
      version: 1,
      capabilities: {
        memoryDelete: true,
        memoryDeleteTarget: null,
      },
      execution: {
        eligibleProfile: "standard",
        policyVersion: 1,
        classifierVersion: 1,
      },
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.capabilities)).toBe(true);
    expect(Object.isFrozen(parsed?.capabilities.reasonCodes)).toBe(true);
    expect(Object.isFrozen(parsed?.execution)).toBe(true);
    expect(Object.isFrozen(parsed?.execution.reasonCodes)).toBe(true);
  });

  it("round-trips a deterministic capability source", () => {
    const parsed = parseSafeTurnDecision(
      serializeSafeTurnDecision(deterministicTurnDecision()),
    );

    expect(parsed?.capabilities.source).toBe("rule");
  });

  it.each([
    ["turn version", { version: 2 }],
    ["policy version", { execution: { policyVersion: 2 } }],
    ["classifier version", { execution: { classifierVersion: 2 } }],
    [
      "capability reason code",
      { capabilities: { reasonCodes: ["raw_classifier_prose"] } },
    ],
    ["execution reason code", { execution: { reasonCodes: ["unknown"] } }],
  ])("rejects an unknown %s", (_label, override) => {
    const serialized = serializeSafeTurnDecision(turnDecision()) as Record<
      string,
      unknown
    >;
    const capabilities = serialized.capabilities as Record<string, unknown>;
    const execution = serialized.execution as Record<string, unknown>;
    const overrideRecord = override as {
      version?: number;
      capabilities?: Record<string, unknown>;
      execution?: Record<string, unknown>;
    };

    expect(
      parseSafeTurnDecision({
        ...serialized,
        ...(overrideRecord.version !== undefined
          ? { version: overrideRecord.version }
          : {}),
        capabilities: {
          ...capabilities,
          ...overrideRecord.capabilities,
        },
        execution: {
          ...execution,
          ...overrideRecord.execution,
        },
      }),
    ).toBeNull();
  });

  it("rejects unknown persisted fields instead of retaining provider data", () => {
    const serialized = serializeSafeTurnDecision(turnDecision());

    expect(
      parseSafeTurnDecision({
        ...serialized,
        rawClassifierOutput: { userText: "private" },
      }),
    ).toBeNull();
    expect(
      parseSafeTurnDecision({
        ...serialized,
        capabilities: {
          ...serialized.capabilities,
          memoryDeleteTarget: "training_schedule",
        },
      }),
    ).toBeNull();
  });
});
