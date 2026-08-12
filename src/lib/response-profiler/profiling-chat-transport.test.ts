import type { UIMessage, UIMessageChunk } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { ClientTraceCollector } from "./client-trace";
import { ProfilingChatTransport } from "./profiling-chat-transport";

function collector() {
  return {
    clientMessageId: "user-2",
    markStreamOpened: vi.fn(),
    markFirstChunkReceived: vi.fn(),
    markFirstTextDeltaReceived: vi.fn(),
    markFirstDomText: vi.fn(),
    markFirstVisibleFrame: vi.fn(),
    markStreamCompleted: vi.fn(),
    markPersistedMessageResolved: vi.fn(),
    abandon: vi.fn(),
    waitForPresentation: vi.fn(),
    snapshot: vi.fn(),
  } as unknown as ClientTraceCollector;
}

const messages: UIMessage[] = [
  { id: "user-1", role: "user", parts: [{ type: "text", text: "old" }] },
  {
    id: "assistant-1",
    role: "assistant",
    parts: [{ type: "text", text: "answer" }],
  },
  { id: "user-2", role: "user", parts: [{ type: "text", text: "new" }] },
];

describe("ProfilingChatTransport", () => {
  it("observes parsed chunks once and forwards identical objects", async () => {
    const traceCollector = collector();
    const chunks: UIMessageChunk[] = [
      { type: "start", messageId: "assistant-2" },
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: "" },
      { type: "text-delta", id: "text-1", delta: "Ciao" },
      { type: "finish" },
    ];
    const sendMessages = vi.fn().mockResolvedValue(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      }),
    );
    const transport = new ProfilingChatTransport({
      getCollector: (id) => (id === "user-2" ? traceCollector : undefined),
      sendMessages,
    });

    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat-1",
      messageId: undefined,
      messages,
      abortSignal: undefined,
    });
    expect(traceCollector.markStreamOpened).toHaveBeenCalledTimes(1);

    const received: UIMessageChunk[] = [];
    const reader = stream.getReader();
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      received.push(next.value);
    }
    expect(received).toEqual(chunks);
    expect(received.every((chunk, index) => chunk === chunks[index])).toBe(
      true,
    );
    expect(traceCollector.markFirstChunkReceived).toHaveBeenCalledTimes(1);
    expect(traceCollector.markFirstTextDeltaReceived).toHaveBeenCalledTimes(1);
    expect(traceCollector.markStreamCompleted).toHaveBeenCalledTimes(1);
  });

  it("uses messageId only when regeneration identifies a user message", async () => {
    const traceCollector = collector();
    const sendMessages = vi.fn().mockResolvedValue(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.close();
        },
      }),
    );
    const getCollector = vi.fn(() => traceCollector);
    const transport = new ProfilingChatTransport({
      getCollector,
      sendMessages,
    });
    await transport.sendMessages({
      trigger: "regenerate-message",
      chatId: "chat-1",
      messageId: "assistant-1",
      messages,
      abortSignal: undefined,
    });
    expect(getCollector).toHaveBeenCalledWith(undefined);
  });

  it("forwards stream errors and consumer cancellation while abandoning the trace", async () => {
    const traceCollector = collector();
    const sourceCancel = vi.fn();
    let sourceController:
      | ReadableStreamDefaultController<UIMessageChunk>
      | undefined;
    const sendMessages = vi.fn().mockResolvedValue(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          sourceController = controller;
        },
        cancel: sourceCancel,
      }),
    );
    const transport = new ProfilingChatTransport({
      getCollector: () => traceCollector,
      sendMessages,
    });
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat-1",
      messageId: undefined,
      messages,
      abortSignal: undefined,
    });
    const reader = stream.getReader();
    const error = new Error("stream failed");
    sourceController?.error(error);
    await expect(reader.read()).rejects.toBe(error);
    expect(traceCollector.abandon).toHaveBeenCalledTimes(1);

    const cancelCollector = collector();
    const cancelTransport = new ProfilingChatTransport({
      getCollector: () => cancelCollector,
      sendMessages: vi
        .fn()
        .mockResolvedValue(
          new ReadableStream<UIMessageChunk>({ cancel: sourceCancel }),
        ),
    });
    const cancelStream = await cancelTransport.sendMessages({
      trigger: "submit-message",
      chatId: "chat-1",
      messageId: undefined,
      messages,
      abortSignal: undefined,
    });
    await cancelStream.cancel("stop");
    expect(cancelCollector.abandon).toHaveBeenCalledTimes(1);
  });
});
