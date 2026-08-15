import { describe, expect, it } from "vitest";
import type { TurnDecision } from "./turn-decision";
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
      source: "rule",
      reasonCodes: ["delete_requires_exact_target"],
    },
  };
}

describe("safe turn decision metadata", () => {
  it("serializes only the closed capability decision", () => {
    const decision = turnDecision() as TurnDecision & {
      rawClassifierOutput: string;
      userText: string;
    };
    decision.rawClassifierOutput = "private classifier output";
    decision.userText = "private user text";

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
        source: "rule",
        reasonCodes: ["delete_requires_exact_target"],
      },
    });
    expect(JSON.stringify(serialized)).not.toContain("training_schedule");
    expect(JSON.stringify(serialized)).not.toContain("private");
  });

  it("reconstructs a deeply frozen runtime decision without a delete target", () => {
    const parsed = parseSafeTurnDecision(
      serializeSafeTurnDecision(turnDecision()),
    );

    expect(parsed).toMatchObject({
      version: 1,
      capabilities: {
        memoryDelete: true,
        memoryDeleteTarget: null,
        source: "rule",
      },
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.capabilities)).toBe(true);
    expect(Object.isFrozen(parsed?.capabilities.reasonCodes)).toBe(true);
    expect(parsed).not.toHaveProperty("execution");
  });

  it("reads historical profile metadata but drops it before live reuse", () => {
    const parsed = parseSafeTurnDecision({
      version: 1,
      capabilities: {
        ...serializeSafeTurnDecision(turnDecision()).capabilities,
      },
      execution: {
        eligibleProfile: "light",
        plannedProfile: "standard",
        classifierVersion: 1,
      },
    });

    expect(parsed?.capabilities.source).toBe("rule");
    expect(parsed).not.toHaveProperty("execution");
  });

  it("rejects unknown persisted fields and unsupported versions", () => {
    const serialized = serializeSafeTurnDecision(turnDecision());

    expect(
      parseSafeTurnDecision({ ...serialized, rawClassifierOutput: "private" }),
    ).toBeNull();
    expect(parseSafeTurnDecision({ ...serialized, version: 2 })).toBeNull();
    expect(
      parseSafeTurnDecision({
        ...serialized,
        capabilities: {
          ...serialized.capabilities,
          reasonCodes: ["unknown"],
        },
      }),
    ).toBeNull();
  });
});
