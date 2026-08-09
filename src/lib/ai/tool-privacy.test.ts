import { describe, expect, it } from "vitest";
import {
  createToolStreamRedactor,
  redactToolCalls,
  redactTraceMetadata,
  redactTracePayload,
} from "./tool-privacy";

describe("ai/tool-privacy", () => {
  it("keeps only safe aggregate metadata when collecting tool calls", () => {
    const redacted = redactToolCalls([
      {
        name: "saveMemory",
        args: {
          key: "health_condition",
          value: "Dolore persistente al ginocchio",
          category: "health",
        },
        result: { status: "approval_required", approvalId: "approval-1" },
      },
      {
        name: "tinyfishSearch",
        args: { query: "private user query" },
        result: { results: [{ url: "https://example.com" }] },
      },
    ]);

    expect(redacted).toEqual([
      { name: "saveMemory", status: "completed" },
      { name: "tinyfishSearch", status: "completed" },
    ]);
    expect(JSON.stringify(redacted)).not.toContain("health_condition");
    expect(JSON.stringify(redacted)).not.toContain("approval-1");
    expect(JSON.stringify(redacted)).not.toContain("private user query");
  });

  it("removes tool input and output payloads from live UI chunks", () => {
    const redactToolStreamChunk = createToolStreamRedactor();
    const input = redactToolStreamChunk({
      type: "tool-input-available",
      toolCallId: "call-1",
      toolName: "saveMemory",
      input: {
        key: "health_condition",
        value: "Dolore persistente al ginocchio",
      },
    });
    const output = redactToolStreamChunk({
      type: "tool-output-available",
      toolCallId: "call-1",
      output: {
        status: "approval_required",
        approvalId: "approval-1",
      },
    });

    expect(input).toMatchObject({
      type: "tool-input-available",
      toolCallId: "safe-tool-1",
      input: {},
    });
    expect(output).toMatchObject({
      type: "tool-output-available",
      toolCallId: "safe-tool-1",
      output: { status: "completed" },
    });
    expect(JSON.stringify(input)).not.toContain("call-1");
    expect(JSON.stringify(output)).not.toContain("call-1");
    expect(JSON.stringify(input)).not.toContain("health_condition");
    expect(JSON.stringify(input)).not.toContain("Dolore persistente");
    expect(JSON.stringify(output)).not.toContain("approval-1");
  });

  it("drops unknown tool chunks instead of passing a future payload through", () => {
    const redactToolStreamChunk = createToolStreamRedactor();
    expect(
      redactToolStreamChunk({
        type: "tool-future-payload",
        approvalId: "approval-1",
        value: "Diagnosi privata",
      }),
    ).toBeNull();
  });

  it("drops reasoning and unknown provider chunks from the live UI stream", () => {
    const redactToolStreamChunk = createToolStreamRedactor();

    expect(
      redactToolStreamChunk({
        type: "reasoning-delta",
        id: "reasoning-provider-id",
        delta: "private chain of thought",
        providerMetadata: { openrouter: { id: "provider-request-1" } },
      }),
    ).toBeNull();
    expect(
      redactToolStreamChunk({
        type: "provider-metadata",
        requestId: "provider-request-1",
      }),
    ).toBeNull();
  });

  it("keeps text protocol content with synthetic IDs and no provider metadata", () => {
    const redactToolStreamChunk = createToolStreamRedactor();

    const start = redactToolStreamChunk({
      type: "text-start",
      id: "provider-text-id",
      providerMetadata: { openrouter: { id: "provider-request-1" } },
    });
    const delta = redactToolStreamChunk({
      type: "text-delta",
      id: "provider-text-id",
      delta: "Risposta legittima",
      providerMetadata: { openrouter: { id: "provider-request-1" } },
    });
    const end = redactToolStreamChunk({
      type: "text-end",
      id: "provider-text-id",
      providerMetadata: { openrouter: { id: "provider-request-1" } },
    });

    expect(start).toEqual({ type: "text-start", id: "safe-text-1" });
    expect(delta).toEqual({
      type: "text-delta",
      id: "safe-text-1",
      delta: "Risposta legittima",
    });
    expect(end).toEqual({ type: "text-end", id: "safe-text-1" });
    expect(JSON.stringify({ start, delta, end })).not.toContain(
      "provider-request-1",
    );
    expect(JSON.stringify({ start, delta, end })).not.toContain(
      "provider-text-id",
    );
  });

  it("removes persistent-memory context and exact targets from traces", () => {
    const metadata = redactTraceMetadata({
      turnPlan: {
        capabilities: { memoryDelete: true },
        memoryDeleteTarget: "training_schedule",
      },
    });
    const payload = redactTracePayload({
      systemPrompt:
        "BASE\n\nUSER MEMORIES\nDiagnosi privata\n\nTEXT RESPONSE MODE\nAnswer directly.",
      capabilityDecision: {
        memoryDelete: true,
        memoryDeleteTarget: "training_schedule",
      },
      toolCalls: [
        {
          name: "saveMemory",
          args: { key: "health_condition", value: "Diagnosi privata" },
          result: { approvalId: "approval-1", memoryId: "memory-1" },
        },
      ],
    });

    expect(metadata).toEqual({
      turnPlan: { capabilities: { memoryDelete: true } },
    });
    expect(payload).toMatchObject({
      systemPrompt: "BASE\n\nUSER MEMORIES\n[REDACTED]",
      capabilityDecision: { memoryDelete: true },
      toolCalls: [{ name: "saveMemory", status: "completed" }],
    });
    expect(JSON.stringify({ metadata, payload })).not.toContain(
      "training_schedule",
    );
    expect(JSON.stringify({ metadata, payload })).not.toContain(
      "Diagnosi privata",
    );
    expect(JSON.stringify({ metadata, payload })).not.toContain("approval-1");
    expect(JSON.stringify({ metadata, payload })).not.toContain("memory-1");
  });
});
