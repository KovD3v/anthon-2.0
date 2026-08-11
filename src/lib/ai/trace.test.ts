import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    aiTurnTrace: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import type { ExecutionRouteTrace } from "./execution-route-trace";
import { buildExecutionRoutingTraceMetadata } from "./trace";
import {
  decryptAiTurnTracePayload,
  encryptAiTurnTracePayload,
} from "./trace-crypto";

const originalKey = process.env.AI_TRACE_ENCRYPTION_KEY;

afterEach(() => {
  if (originalKey) {
    process.env.AI_TRACE_ENCRYPTION_KEY = originalKey;
  } else {
    delete process.env.AI_TRACE_ENCRYPTION_KEY;
  }
});

describe("AI turn trace encryption", () => {
  it("round-trips AES-256-GCM payloads", () => {
    process.env.AI_TRACE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const encrypted = encryptAiTurnTracePayload({
      text: "riservato",
      count: 2,
    });

    expect(
      decryptAiTurnTracePayload({
        payloadCiphertext: encrypted.ciphertext,
        payloadIv: encrypted.iv,
        payloadTag: encrypted.tag,
      }),
    ).toEqual({ text: "riservato", count: 2 });
  });

  it("rejects altered ciphertext", () => {
    process.env.AI_TRACE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    const encrypted = encryptAiTurnTracePayload({ text: "riservato" });
    encrypted.ciphertext[0] ^= 1;

    expect(() =>
      decryptAiTurnTracePayload({
        payloadCiphertext: encrypted.ciphertext,
        payloadIv: encrypted.iv,
        payloadTag: encrypted.tag,
      }),
    ).toThrow();
  });
});

describe("AI turn trace routing metadata", () => {
  it("keeps only bounded route summary and timing fields", () => {
    const executionRoute: ExecutionRouteTrace = {
      schemaVersion: 1,
      routingMode: "active",
      policyVersion: 1,
      classifierVersion: 1,
      eligibleProfile: "light",
      plannedProfile: "light",
      executedProfile: "standard",
      taskKind: "rewrite",
      decisionSource: "classifier",
      confidenceBucket: "high",
      reasonCodes: ["classifier_light", "task_allowlisted"],
      classificationLatencyMs: 14,
      routingOverheadMs: 3,
      totalRequestTimeToFirstTokenMs: 210,
      attempts: [
        {
          sequence: 1,
          profile: "light",
          outcome: "failed_before_stream",
          generationTimeMs: 40,
          inputTokens: 10,
          costUsd: 0.001,
        },
        {
          sequence: 2,
          profile: "standard",
          outcome: "completed",
          timeToFirstTokenMs: 150,
          generationTimeMs: 300,
          inputTokens: 30,
          outputTokens: 20,
          reasoningTokens: 4,
          costUsd: 0.006,
        },
      ],
      escalation: {
        from: "light",
        to: "standard",
        reason: "empty_response",
      },
    };

    const summary = buildExecutionRoutingTraceMetadata(executionRoute);

    expect(summary).toEqual({
      eligibleProfile: "light",
      plannedProfile: "light",
      executedProfile: "standard",
      taskKind: "rewrite",
      policyVersion: 1,
      attemptCount: 2,
      escalated: true,
      totalRequestTimeToFirstTokenMs: 210,
      routingOverheadMs: 3,
      escalationReason: "empty_response",
    });
    expect(summary).not.toHaveProperty("attempts");
    expect(summary).not.toHaveProperty("reasonCodes");
    expect(summary).not.toHaveProperty("classificationLatencyMs");
    expect(JSON.stringify(summary)).not.toContain("classifier_light");
  });
});
