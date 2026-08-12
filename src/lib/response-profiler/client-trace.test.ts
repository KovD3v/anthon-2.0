import { describe, expect, it, vi } from "vitest";
import { createClientTraceCollector, submitClientTrace } from "./client-trace";

function completedCollector() {
  let clock = 100;
  const collector = createClientTraceCollector({
    clientMessageId: "client-user-1",
    now: () => clock,
    documentVisibility: () => "visible",
  });
  clock = 110;
  collector.markStreamOpened();
  clock = 120;
  collector.markFirstChunkReceived();
  clock = 130;
  collector.markFirstTextDeltaReceived();
  clock = 140;
  collector.markFirstDomText();
  clock = 150;
  collector.markFirstVisibleFrame();
  clock = 160;
  collector.markStreamCompleted();
  clock = 170;
  collector.markPersistedMessageResolved();
  return {
    collector,
    setClock(value: number) {
      clock = value;
    },
  };
}

describe("ClientTraceCollector", () => {
  it("records ordered milestones once relative to a zero request start", () => {
    const { collector, setClock } = completedCollector();
    setClock(500);
    collector.markStreamOpened();
    collector.markFirstTextDeltaReceived();

    expect(collector.snapshot()).toEqual({
      version: 1,
      status: "completed",
      milestones: {
        requestStartedMs: 0,
        streamOpenedMs: 10,
        firstChunkReceivedMs: 20,
        firstTextDeltaReceivedMs: 30,
        firstDomTextMs: 40,
        firstVisibleFrameMs: 50,
        streamCompletedMs: 60,
        persistedMessageResolvedMs: 70,
      },
    });
  });

  it("suppresses a visible-frame milestone while hidden and stays partial", async () => {
    let clock = 0;
    const collector = createClientTraceCollector({
      clientMessageId: "client-user-1",
      now: () => clock,
      documentVisibility: () => "hidden",
    });
    clock = 1;
    collector.markStreamOpened();
    clock = 2;
    collector.markFirstChunkReceived();
    clock = 3;
    collector.markFirstTextDeltaReceived();
    clock = 4;
    collector.markFirstDomText();
    clock = 5;
    collector.markStreamCompleted();
    clock = 6;
    collector.markPersistedMessageResolved();

    await expect(collector.waitForPresentation()).resolves.toBeUndefined();
    expect(collector.snapshot().status).toBe("partial");
    expect(collector.snapshot().milestones).not.toHaveProperty(
      "firstVisibleFrameMs",
    );
  });

  it("marks an unfinished response abandoned", () => {
    const collector = createClientTraceCollector({
      clientMessageId: "client-user-1",
      now: () => 0,
    });
    collector.markStreamOpened();
    collector.abandon();
    expect(collector.snapshot().status).toBe("abandoned");
  });

  it("waits for the first visible frame before immutable submission", async () => {
    let clock = 0;
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const collector = createClientTraceCollector({
      clientMessageId: "client-user-1",
      now: () => clock,
      documentVisibility: () => "visible",
    });
    clock = 1;
    collector.markStreamOpened();
    clock = 2;
    collector.markFirstChunkReceived();
    clock = 3;
    collector.markFirstTextDeltaReceived();
    clock = 4;
    collector.markFirstDomText();
    clock = 5;
    collector.markStreamCompleted();
    clock = 6;
    collector.markPersistedMessageResolved();

    const submission = submitClientTrace({
      chatId: "chat-1",
      collector,
      fetchImpl,
    });
    await Promise.resolve();
    expect(fetchImpl).not.toHaveBeenCalled();
    clock = 7;
    collector.markFirstVisibleFrame();
    await expect(submission).resolves.toBe("stored");

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/chat/messages/client-trace",
      expect.objectContaining({
        method: "PUT",
        credentials: "same-origin",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const requestBody = JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body);
    expect(requestBody).toEqual({
      chatId: "chat-1",
      clientMessageId: "client-user-1",
      trace: collector.snapshot(),
    });
  });

  it("submits a valid partial trace after the presentation deadline", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const collector = createClientTraceCollector({
      clientMessageId: "client-user-1",
      now: () => 0,
      documentVisibility: () => "visible",
    });
    collector.markStreamOpened();
    collector.markFirstChunkReceived();
    collector.markFirstTextDeltaReceived();
    collector.markStreamCompleted();
    collector.markPersistedMessageResolved();

    const submission = submitClientTrace({
      chatId: "chat-1",
      collector,
      fetchImpl,
      presentationTimeoutMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(submission).resolves.toBe("stored");
    const requestBody = JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body);
    expect(requestBody.trace.status).toBe("partial");
    vi.useRealTimers();
  });

  it("retries only retryable pending conflicts with bounded delays", async () => {
    const { collector } = completedCollector();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ retryable: true }, { status: 409 }),
      )
      .mockResolvedValueOnce(
        Response.json({ retryable: true }, { status: 409 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      submitClientTrace({ chatId: "chat-1", collector, fetchImpl, sleep }),
    ).resolves.toBe("stored");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 150);
    expect(sleep).toHaveBeenNthCalledWith(2, 400);
  });

  it.each([400, 401, 403, 404, 409])(
    "does not retry terminal HTTP %s",
    async (status) => {
      const { collector } = completedCollector();
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(
          status === 409
            ? Response.json({ retryable: false }, { status })
            : Response.json({}, { status }),
        );
      await expect(
        submitClientTrace({ chatId: "chat-1", collector, fetchImpl }),
      ).resolves.toBe("failed");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it("swallows network failures instead of affecting chat", async () => {
    const { collector } = completedCollector();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(
      submitClientTrace({ chatId: "chat-1", collector, fetchImpl }),
    ).resolves.toBe("failed");
  });
});
