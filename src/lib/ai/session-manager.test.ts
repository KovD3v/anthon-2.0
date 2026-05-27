import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  messageFindMany: vi.fn(),
  messageFindFirst: vi.fn(),
  getCachedSummary: vi.fn(),
  cacheSummary: vi.fn(),
  trackSupportAiUsage: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    message: {
      findMany: mocks.messageFindMany,
      findFirst: mocks.messageFindFirst,
    },
  },
}));

vi.mock("@/lib/ai/session-cache", () => ({
  getCachedSummary: mocks.getCachedSummary,
  cacheSummary: mocks.cacheSummary,
}));

vi.mock("@/lib/ai/providers/openrouter", () => ({
  subAgentModel: "test-sub-model",
  SUB_AGENT_MODEL_ID: "test-sub-model-id",
}));

vi.mock("@/lib/ai/usage-meter", () => ({
  trackSupportAiUsage: mocks.trackSupportAiUsage,
}));

import { buildConversationContext } from "./session-manager";

function buildDbMessage({
  id,
  role,
  content,
  createdAt,
}: {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: Date;
}) {
  return {
    id,
    userId: "user-1",
    chatId: "chat-1",
    channel: "WEB",
    direction: role === "ASSISTANT" ? "OUTBOUND" : "INBOUND",
    role,
    type: "TEXT",
    parts: [{ type: "text", text: content }],
    mediaUrl: null,
    mediaType: null,
    externalMessageId: null,
    metadata: null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    reasoningContent: null,
    toolCalls: null,
    ragUsed: false,
    ragChunksCount: null,
    costUsd: null,
    generationTimeMs: null,
    reasoningTimeMs: null,
    feedback: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}

describe("ai/session-manager", () => {
  beforeEach(() => {
    mocks.generateText.mockReset();
    mocks.messageFindMany.mockReset();
    mocks.messageFindFirst.mockReset();
    mocks.getCachedSummary.mockReset();
    mocks.cacheSummary.mockReset();
    mocks.trackSupportAiUsage.mockReset();
    mocks.trackSupportAiUsage.mockResolvedValue(undefined);
  });

  it("returns chat-scoped messages mapped to AI SDK message roles", async () => {
    const older = buildDbMessage({
      id: "m1",
      role: "USER",
      content: "hello",
      createdAt: new Date("2026-02-17T10:00:00.000Z"),
    });
    const newer = buildDbMessage({
      id: "m2",
      role: "ASSISTANT",
      content: "hi there",
      createdAt: new Date("2026-02-17T10:01:00.000Z"),
    });

    // Prisma query returns newest first; buildConversationContext reverses it.
    mocks.messageFindMany.mockResolvedValue([newer, older]);

    const result = await buildConversationContext("user-1", 10, "chat-1");

    expect(mocks.messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { chatId: "chat-1", userId: "user-1" },
        take: 10,
      }),
    );
    expect(result).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ]);
  });

  it("truncates oversized chat-scoped history messages before sending context", async () => {
    const longContent = "x".repeat(5000);
    mocks.messageFindMany.mockResolvedValue([
      buildDbMessage({
        id: "m2",
        role: "ASSISTANT",
        content: "latest",
        createdAt: new Date("2026-02-17T10:01:00.000Z"),
      }),
      buildDbMessage({
        id: "m1",
        role: "USER",
        content: longContent,
        createdAt: new Date("2026-02-17T10:00:00.000Z"),
      }),
    ]);

    const result = await buildConversationContext("user-1", 10, "chat-1");

    expect(result).toHaveLength(2);
    expect(String(result[0]?.content).length).toBeLessThan(longContent.length);
    expect(result[0]?.content).toContain("[truncated]");
    expect(result[1]).toEqual({ role: "assistant", content: "latest" });
  });

  it("uses cached summaries for oversized sessions", async () => {
    const messages = Array.from({ length: 30 }, (_, i) =>
      buildDbMessage({
        id: `m-${i}`,
        role: "USER",
        content: `msg-${i}`,
        createdAt: new Date(`2026-02-17T10:${String(i).padStart(2, "0")}:00Z`),
      }),
    );
    const desc = [...messages].reverse();

    mocks.messageFindMany.mockResolvedValue(desc);
    mocks.getCachedSummary.mockResolvedValue("Cached session summary");

    const result = await buildConversationContext("user-1");

    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe("system");
    expect(result[0]?.content).toContain("Cached session summary");
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("falls back to recent messages and asynchronously kicks off summarization on cache miss", async () => {
    const messages = Array.from({ length: 30 }, (_, i) =>
      buildDbMessage({
        id: `m-${i}`,
        role: "USER",
        content: `msg-${i}`,
        createdAt: new Date(`2026-02-17T11:${String(i).padStart(2, "0")}:00Z`),
      }),
    );
    const desc = [...messages].reverse();

    mocks.messageFindMany.mockResolvedValue(desc);
    mocks.getCachedSummary.mockResolvedValue(null);
    mocks.generateText.mockResolvedValue({
      text: "Generated summary",
      usage: { inputTokens: 200, outputTokens: 50 },
    });
    mocks.cacheSummary.mockResolvedValue(undefined);

    const result = await buildConversationContext("user-1");

    expect(result).toHaveLength(6);
    expect(result[0]?.content).toBe("msg-24");
    expect(result[5]?.content).toBe("msg-29");

    await vi.waitFor(() => {
      expect(mocks.generateText).toHaveBeenCalledTimes(1);
      expect(mocks.cacheSummary).toHaveBeenCalledTimes(1);
      expect(mocks.trackSupportAiUsage).toHaveBeenCalledWith({
        userId: "user-1",
        modelId: "test-sub-model-id",
        usage: { inputTokens: 200, outputTokens: 50 },
        providerMetadata: undefined,
      });
    });
  });
});
