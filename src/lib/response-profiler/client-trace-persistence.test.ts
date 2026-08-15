import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  messageFindFirst: vi.fn(),
  messageMetricsUpdateMany: vi.fn(),
  messageMetricsFindUnique: vi.fn(),
  captureClientTraceStored: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    message: { findFirst: mocks.messageFindFirst },
    messageMetrics: {
      updateMany: mocks.messageMetricsUpdateMany,
      findUnique: mocks.messageMetricsFindUnique,
    },
  },
}));

vi.mock("@/lib/ai/telemetry", () => ({
  captureClientTraceStored: mocks.captureClientTraceStored,
}));

import { persistClientTrace } from "./client-trace-persistence";
import type { ClientTraceV1 } from "./contracts";

const trace: ClientTraceV1 = {
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
};

function target(overrides: Record<string, unknown> = {}) {
  return {
    chat: { visibility: "PRIVATE", userId: "user-1" },
    generatedResponse: {
      id: "assistant-1",
      metrics: {
        messageId: "assistant-1",
        clientTrace: null,
        model: "standard-model",
        provider: "Nebius",
      },
    },
    ...overrides,
  };
}

describe("persistClientTrace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.messageFindFirst.mockResolvedValue(target());
    mocks.messageMetricsUpdateMany.mockResolvedValue({ count: 1 });
    mocks.messageMetricsFindUnique.mockResolvedValue(null);
  });

  it("stores a first valid trace on the owner-correlated private response", async () => {
    await expect(
      persistClientTrace({
        userId: "user-1",
        chatId: "chat-1",
        clientMessageId: "client-user-1",
        trace,
      }),
    ).resolves.toEqual({ status: "stored" });

    expect(mocks.messageFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          chatId: "chat-1",
          channel: "WEB",
          role: "USER",
          clientMessageId: "client-user-1",
          chat: { is: { userId: "user-1" } },
        }),
      }),
    );
    expect(mocks.messageMetricsUpdateMany).toHaveBeenCalledWith({
      where: {
        messageId: "assistant-1",
        clientTrace: { equals: expect.anything() },
      },
      data: { clientTrace: trace },
    });
    expect(mocks.captureClientTraceStored).toHaveBeenCalledWith({
      distinctId: "user-1",
      trace,
      model: "standard-model",
      provider: "Nebius",
    });
  });

  it("returns unchanged for an identical immutable retry", async () => {
    mocks.messageFindFirst.mockResolvedValue(
      target({
        generatedResponse: {
          id: "assistant-1",
          metrics: {
            ...target().generatedResponse.metrics,
            clientTrace: trace,
          },
        },
      }),
    );

    await expect(
      persistClientTrace({
        userId: "user-1",
        chatId: "chat-1",
        clientMessageId: "client-user-1",
        trace,
      }),
    ).resolves.toEqual({ status: "unchanged" });
    expect(mocks.messageMetricsUpdateMany).not.toHaveBeenCalled();
    expect(mocks.captureClientTraceStored).not.toHaveBeenCalled();
  });

  it("rejects a different retry without overwriting", async () => {
    mocks.messageFindFirst.mockResolvedValue(
      target({
        generatedResponse: {
          id: "assistant-1",
          metrics: {
            ...target().generatedResponse.metrics,
            clientTrace: {
              ...trace,
              status: "partial",
            },
          },
        },
      }),
    );

    await expect(
      persistClientTrace({
        userId: "user-1",
        chatId: "chat-1",
        clientMessageId: "client-user-1",
        trace,
      }),
    ).resolves.toEqual({ status: "conflict" });
    expect(mocks.messageMetricsUpdateMany).not.toHaveBeenCalled();
  });

  it.each([
    ["generated response", { generatedResponse: null }],
    ["metrics", { generatedResponse: { id: "assistant-1", metrics: null } }],
  ])(
    "returns pending when %s is not durable yet",
    async (_label, overrides) => {
      mocks.messageFindFirst.mockResolvedValue(target(overrides));

      await expect(
        persistClientTrace({
          userId: "user-1",
          chatId: "chat-1",
          clientMessageId: "client-user-1",
          trace,
        }),
      ).resolves.toEqual({ status: "pending" });
    },
  );

  it("does not disclose a cross-user target", async () => {
    mocks.messageFindFirst.mockResolvedValue(null);

    await expect(
      persistClientTrace({
        userId: "user-1",
        chatId: "other-chat",
        clientMessageId: "other-client-message",
        trace,
      }),
    ).resolves.toEqual({ status: "not_found" });
  });

  it("forbids profiling an owned public chat", async () => {
    mocks.messageFindFirst.mockResolvedValue(
      target({ chat: { visibility: "PUBLIC", userId: "user-1" } }),
    );

    await expect(
      persistClientTrace({
        userId: "user-1",
        chatId: "chat-1",
        clientMessageId: "client-user-1",
        trace,
      }),
    ).resolves.toEqual({ status: "forbidden" });
  });

  it.each([
    ["unchanged", trace, "unchanged"],
    ["conflict", { ...trace, status: "partial" }, "conflict"],
  ] as const)(
    "rereads a concurrent winner and returns %s",
    async (_label, winningTrace, expectedStatus) => {
      mocks.messageMetricsUpdateMany.mockResolvedValue({ count: 0 });
      mocks.messageMetricsFindUnique.mockResolvedValue({
        clientTrace: winningTrace,
      });

      await expect(
        persistClientTrace({
          userId: "user-1",
          chatId: "chat-1",
          clientMessageId: "client-user-1",
          trace,
        }),
      ).resolves.toEqual({ status: expectedStatus });
      expect(mocks.captureClientTraceStored).not.toHaveBeenCalled();
    },
  );
});
