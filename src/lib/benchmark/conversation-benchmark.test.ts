import { describe, expect, it } from "vitest";
import {
  assertCompatibleConversationRuns,
  type ConversationRunArtifact,
  diagnoseConversationStructure,
} from "./conversation-benchmark";

function artifact(variant: "baseline" | "candidate"): ConversationRunArtifact {
  return {
    artifactVersion: 1,
    scenarioVersion: "conversation-v1",
    variant,
    label: variant,
    commit: "a".repeat(40),
    createdAt: "2026-08-10T10:00:00.000Z",
    modelId: "openai/gpt-5.6-luna",
    samples: 1,
    scenarioIds: ["scenario-a"],
    configurationFingerprint: "fingerprint",
    summaries: [],
    replicas: [
      {
        replicaId: "sample-1",
        scenarioId: "scenario-a",
        turnIndex: 0,
        assistantText: "Risposta",
        diagnostics: diagnoseConversationStructure("Risposta"),
        metrics: {
          costUsd: 0,
          generationTimeMs: 100,
          inputTokens: 1,
          outputTokens: 1,
        },
        guardrails: { safety: 10, concision: 10, coachingUsefulness: 10 },
      },
    ],
  };
}

describe("benchmark/conversation-benchmark", () => {
  it("detects the observed formula-list-question structure", () => {
    expect(
      diagnoseConversationStructure(
        "Capisco.\n\n- Primo passo\n- Secondo passo\n\nVuoi provarlo?",
      ),
    ).toMatchObject({
      formulaicOpening: true,
      hasMarkdownList: true,
      hasQuestion: true,
      endsWithQuestion: true,
      acknowledgmentListQuestion: true,
      phraseHits: ["capisco", "vuoi"],
    });
  });

  it("accepts exactly compatible baseline and candidate artifacts", () => {
    expect(() =>
      assertCompatibleConversationRuns(
        artifact("baseline"),
        artifact("candidate"),
      ),
    ).not.toThrow();
  });

  it.each([
    ["modelId", "different-model", /modelId/],
    ["samples", 2, /samples/],
    ["scenarioVersion", "conversation-v2", /scenarioVersion/],
    ["scenarioIds", ["scenario-b"], /scenarioIds/],
  ] as const)("rejects incompatible %s", (field, value, message) => {
    const candidate = artifact("candidate") as unknown as Record<
      string,
      unknown
    >;
    candidate[field] = value;
    expect(() =>
      assertCompatibleConversationRuns(
        artifact("baseline"),
        candidate as unknown as ConversationRunArtifact,
      ),
    ).toThrow(message);
  });

  it("rejects duplicate or missing replica keys", () => {
    const candidate = artifact("candidate");
    candidate.replicas.push(candidate.replicas[0]);
    expect(() =>
      assertCompatibleConversationRuns(artifact("baseline"), candidate),
    ).toThrow(/replica/);
  });
});
