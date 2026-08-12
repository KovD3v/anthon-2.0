import { describe, expect, it } from "vitest";
import { MAX_SERVER_SPANS, parseServerTrace } from "./contracts";
import {
  createServerTraceCollector,
  startModelAttemptTrace,
  startToolExecutionTrace,
} from "./server-trace";

describe("ServerTraceCollector", () => {
  it("records sequential and overlapping spans on one monotonic timeline", () => {
    let clock = 0;
    const collector = createServerTraceCollector({ now: () => clock });
    const parent = collector.startSpan("history");
    clock = 10;
    const left = collector.startSpan("memory_facts", undefined, parent.id);
    const right = collector.startSpan(
      "conversation_recall",
      undefined,
      parent.id,
    );
    clock = 30;
    left.end("completed");
    clock = 40;
    right.end("completed");
    parent.end("completed");

    expect(collector.snapshot("completed")).toEqual({
      version: 1,
      status: "completed",
      totalMs: 40,
      spans: [
        {
          id: 1,
          name: "history",
          startOffsetMs: 0,
          durationMs: 40,
          status: "completed",
        },
        {
          id: 2,
          parentId: 1,
          name: "memory_facts",
          startOffsetMs: 10,
          durationMs: 20,
          status: "completed",
        },
        {
          id: 3,
          parentId: 1,
          name: "conversation_recall",
          startOffsetMs: 10,
          durationMs: 30,
          status: "completed",
        },
      ],
    });
  });

  it("completes a span only once and merges only the first final attributes", () => {
    let clock = 0;
    const collector = createServerTraceCollector({ now: () => clock });
    const span = collector.startSpan("model_stream", {
      attemptSequence: 1,
      profile: "standard",
      model: "model-a",
    });

    clock = 25;
    span.end("completed", {
      provider: "provider-a",
      outcome: "completed",
    });
    clock = 80;
    span.end("failed", {
      provider: "provider-b",
      outcome: "failed_during_stream",
    });

    expect(collector.snapshot("completed").spans[0]).toEqual({
      id: 1,
      name: "model_stream",
      startOffsetMs: 0,
      durationMs: 25,
      status: "completed",
      attributes: {
        attemptSequence: 1,
        profile: "standard",
        model: "model-a",
        provider: "provider-a",
        outcome: "completed",
      },
    });
  });

  it("measures successful and failed asynchronous work without changing results", async () => {
    let clock = 5;
    const collector = createServerTraceCollector({ now: () => clock });

    const value = await collector.measure("auth", async () => {
      clock = 20;
      return "authenticated";
    });
    const failure = new Error("lookup failed");
    await expect(
      collector.measure("user_lookup", async () => {
        clock = 35;
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(value).toBe("authenticated");
    expect(collector.snapshot("partial").spans).toEqual([
      expect.objectContaining({
        name: "auth",
        durationMs: 15,
        status: "completed",
      }),
      expect.objectContaining({
        name: "user_lookup",
        durationMs: 15,
        status: "failed",
      }),
    ]);
  });

  it("records the first generated text token once", () => {
    let clock = 0;
    const collector = createServerTraceCollector({ now: () => clock });
    clock = 45;
    collector.markFirstToken();
    clock = 80;
    collector.markFirstToken();

    expect(collector.snapshot("completed").timeToFirstTokenMs).toBe(45);
  });

  it("keeps failed Light and delivered Standard attempts distinct", () => {
    let clock = 0;
    const collector = createServerTraceCollector({ now: () => clock });
    const light = startModelAttemptTrace(collector, {
      attemptSequence: 1,
      profile: "light",
      model: "light-model",
    });
    clock = 12;
    light.fail("Fireworks");

    clock = 15;
    const standard = startModelAttemptTrace(collector, {
      attemptSequence: 2,
      profile: "standard",
      model: "standard-model",
    });
    clock = 40;
    standard.observeTextDelta("");
    standard.observeTextDelta("prima parola");
    clock = 55;
    standard.observeTextDelta(" seconda parola");
    clock = 80;
    standard.complete("Nebius");

    const trace = collector.snapshot("completed");
    expect(trace.timeToFirstTokenMs).toBe(40);
    expect(trace.spans).toEqual([
      expect.objectContaining({
        name: "provider_wait",
        status: "failed",
        attributes: expect.objectContaining({
          attemptSequence: 1,
          profile: "light",
          model: "light-model",
          provider: "Fireworks",
          outcome: "failed_before_stream",
        }),
      }),
      expect.objectContaining({
        name: "model_stream",
        status: "failed",
        attributes: expect.objectContaining({
          attemptSequence: 1,
          profile: "light",
          model: "light-model",
          provider: "Fireworks",
          outcome: "failed_before_stream",
        }),
      }),
      expect.objectContaining({
        name: "provider_wait",
        durationMs: 25,
        status: "completed",
        attributes: expect.objectContaining({
          attemptSequence: 2,
          profile: "standard",
          provider: "Nebius",
          outcome: "completed",
        }),
      }),
      expect.objectContaining({
        name: "model_stream",
        durationMs: 65,
        status: "completed",
        attributes: expect.objectContaining({
          attemptSequence: 2,
          profile: "standard",
          model: "standard-model",
          provider: "Nebius",
          outcome: "completed",
        }),
      }),
    ]);
  });

  it("records each tool invocation outcome and closes cancelled work", () => {
    let clock = 0;
    const collector = createServerTraceCollector({ now: () => clock });

    const blocked = startToolExecutionTrace(collector, "saveMemory");
    clock = 5;
    blocked.notAllowed();
    const succeeded = startToolExecutionTrace(collector, "searchRag");
    clock = 15;
    succeeded.complete();
    const failed = startToolExecutionTrace(collector, "webFetch");
    clock = 25;
    failed.fail();
    const cancelledTool = startToolExecutionTrace(collector, "webSearch");
    const cancelledAttempt = startModelAttemptTrace(collector, {
      attemptSequence: 1,
      profile: "standard",
      model: "standard-model",
    });
    clock = 40;
    cancelledTool.cancel();
    cancelledAttempt.cancel();
    collector.markCancelled();

    expect(collector.snapshot("completed")).toMatchObject({
      status: "cancelled",
      spans: [
        {
          name: "tool",
          status: "completed",
          attributes: { outcome: "not_allowed", toolName: "saveMemory" },
        },
        {
          name: "tool",
          status: "completed",
          attributes: { outcome: "completed", toolName: "searchRag" },
        },
        {
          name: "tool",
          status: "failed",
          attributes: { outcome: "failed_during_stream", toolName: "webFetch" },
        },
        {
          name: "tool",
          status: "cancelled",
          attributes: { outcome: "cancelled", toolName: "webSearch" },
        },
        expect.objectContaining({ name: "provider_wait", status: "cancelled" }),
        expect.objectContaining({ name: "model_stream", status: "cancelled" }),
      ],
    });
  });

  it("excludes open spans and marks the snapshot partial without closing them", () => {
    let clock = 0;
    const collector = createServerTraceCollector({ now: () => clock });
    const span = collector.startSpan("assistant_persistence");
    clock = 30;

    expect(collector.snapshot("completed")).toEqual({
      version: 1,
      status: "partial",
      totalMs: 30,
      spans: [],
    });

    clock = 50;
    span.end();
    expect(collector.snapshot("completed").spans[0]?.durationMs).toBe(50);
  });

  it("preserves cancellation over later completed snapshots", () => {
    let clock = 0;
    const collector = createServerTraceCollector({ now: () => clock });
    const span = collector.startSpan("provider_wait");
    clock = 10;
    span.end("cancelled", { outcome: "cancelled" });
    collector.markCancelled();

    expect(collector.snapshot("completed")).toEqual({
      version: 1,
      status: "cancelled",
      totalMs: 10,
      spans: [
        expect.objectContaining({
          name: "provider_wait",
          status: "cancelled",
          attributes: { outcome: "cancelled" },
        }),
      ],
    });
  });

  it("closes open provider, model, and tool spans when the request is cancelled", () => {
    let clock = 0;
    const collector = createServerTraceCollector({ now: () => clock });
    collector.startSpan("provider_wait", { attemptSequence: 1 });
    collector.startSpan("model_stream", { attemptSequence: 1 });
    collector.startSpan("tool", { toolName: "searchRag" });
    clock = 30;

    collector.markCancelled();

    expect(collector.snapshot("completed").spans).toEqual([
      expect.objectContaining({
        name: "provider_wait",
        durationMs: 30,
        status: "cancelled",
        attributes: expect.objectContaining({ outcome: "cancelled" }),
      }),
      expect.objectContaining({
        name: "model_stream",
        durationMs: 30,
        status: "cancelled",
        attributes: expect.objectContaining({ outcome: "cancelled" }),
      }),
      expect.objectContaining({
        name: "tool",
        durationMs: 30,
        status: "cancelled",
        attributes: expect.objectContaining({ outcome: "cancelled" }),
      }),
    ]);
  });

  it("caps span collection and returns a valid partial trace", () => {
    let clock = 0;
    const collector = createServerTraceCollector({ now: () => clock });

    for (let index = 0; index < MAX_SERVER_SPANS + 5; index += 1) {
      const span = collector.startSpan("tool", {
        toolName: `tool-${index}`,
      });
      clock += 1;
      span.end();
    }

    const trace = collector.snapshot("completed");
    expect(trace.status).toBe("partial");
    expect(trace.spans).toHaveLength(MAX_SERVER_SPANS);
    expect(parseServerTrace(trace)).not.toBeNull();
  });

  it("bounds timings and sanitizes labels and attributes", () => {
    let clock = 0;
    const collector = createServerTraceCollector({ now: () => clock });
    const span = collector.startSpan("tool", {
      toolName: `  ${"x".repeat(200)}  `,
      model: "   ",
      ragChunkCount: -3,
      unsafe: "SECRET",
    } as never);
    clock = 1_000_000;
    span.end("completed", { provider: "p".repeat(200) });

    const trace = collector.snapshot("completed");
    expect(trace.totalMs).toBe(900_000);
    expect(trace.spans[0]?.durationMs).toBe(900_000);
    expect(trace.spans[0]?.attributes).toEqual({
      toolName: "x".repeat(128),
      provider: "p".repeat(128),
    });
    expect(JSON.stringify(trace)).not.toContain("SECRET");
    expect(parseServerTrace(trace)).not.toBeNull();
  });

  it("drops newest spans until the serialized trace stays within its byte budget", () => {
    let clock = 0;
    const collector = createServerTraceCollector({ now: () => clock });
    const label = "x".repeat(128);

    for (let index = 0; index < MAX_SERVER_SPANS; index += 1) {
      const span = collector.startSpan("tool", {
        model: label,
        provider: label,
        toolName: label,
        outcome: "completed",
      });
      clock += 1;
      span.end();
    }

    const trace = collector.snapshot("completed");
    expect(trace.status).toBe("partial");
    expect(trace.spans.length).toBeLessThan(MAX_SERVER_SPANS);
    expect(parseServerTrace(trace)).not.toBeNull();
  });
});
