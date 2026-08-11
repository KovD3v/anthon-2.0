import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  chunkFindFirst: vi.fn(),
  messageFindMany: vi.fn(),
  generateEmbedding: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    conversationRecallChunk: { findFirst: mocks.chunkFindFirst },
    message: { findMany: mocks.messageFindMany },
  },
}));
vi.mock("@/lib/ai/embeddings", () => ({
  generateEmbedding: mocks.generateEmbedding,
}));

const row = (id: string, relevance = 0.9) => ({
  id,
  content:
    "user: Prima della finale ero teso\nassistant: Abbiamo usato la respirazione",
  summary: null,
  channel: "WEB",
  sourceCreatedAt: new Date("2026-08-10T10:00:00Z"),
  relevance,
});

describe("conversation recall", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.generateEmbedding.mockResolvedValue(
      Array.from({ length: 1536 }, () => 0.1),
    );
  });

  it("returns sufficient current-thread evidence without a global query", async () => {
    mocks.queryRaw.mockResolvedValue([row("chunk-1"), row("chunk-2", 0.8)]);
    const { searchPastConversations } = await import("./conversation-recall");

    const result = await searchPastConversations({
      userId: "user-1",
      conversationThreadId: "thread-1",
      query: "come avevo gestito la finale?",
      scope: "all_channels",
    });

    expect(result.scope).toBe("current_thread");
    expect(result.packets).toHaveLength(2);
    expect(mocks.queryRaw).toHaveBeenCalledOnce();
    expect(result.packets[0]?.id).not.toContain("chunk-1");
    expect(JSON.stringify(result)).not.toContain("thread-1");
  });

  it("expands globally only when current-thread evidence is insufficient", async () => {
    mocks.queryRaw
      .mockResolvedValueOnce([row("chunk-current")])
      .mockResolvedValueOnce([row("chunk-old", 0.75)]);
    const { searchPastConversations } = await import("./conversation-recall");

    const result = await searchPastConversations({
      userId: "user-1",
      conversationThreadId: "thread-1",
      query: "finale",
      scope: "all_channels",
    });

    expect(result.scope).toBe("all_channels");
    expect(result.packets).toHaveLength(2);
    expect(mocks.queryRaw).toHaveBeenCalledTimes(2);
    for (const call of mocks.queryRaw.mock.calls) {
      const sql = call[0].strings.join(" ");
      expect(sql).toContain('crc."userId" =');
      expect(sql).toContain('m."deletedAt" IS NULL');
    }
  });

  it("falls back to lexical ranking when query embedding fails", async () => {
    mocks.generateEmbedding.mockResolvedValue(null);
    mocks.queryRaw.mockResolvedValue([row("lexical")]);
    const { searchPastConversations } = await import("./conversation-recall");

    const result = await searchPastConversations({
      userId: "user-1",
      conversationThreadId: "thread-1",
      query: "finale",
      scope: "current_thread",
    });

    expect(result.packets).toHaveLength(1);
    expect(mocks.queryRaw.mock.calls[0]?.[0].values).toContain(null);
  });

  it("revalidates ownership and active source messages during expansion", async () => {
    mocks.queryRaw.mockResolvedValue([row("chunk-1")]);
    mocks.chunkFindFirst.mockResolvedValue({
      conversationThreadId: "thread-1",
      startMessageId: "m1",
      endMessageId: "m2",
      sourceCreatedAt: new Date("2026-08-10T10:00:00Z"),
      channel: "WEB",
    });
    mocks.messageFindMany.mockResolvedValue([
      {
        role: "ASSISTANT",
        parts: [{ type: "text", text: "Respira" }],
        mediaType: null,
      },
      {
        role: "USER",
        parts: [{ type: "text", text: "La finale" }],
        mediaType: null,
      },
    ]);
    const { expandConversationEvidence, searchPastConversations } =
      await import("./conversation-recall");
    const searched = await searchPastConversations({
      userId: "user-1",
      conversationThreadId: "thread-1",
      query: "finale",
      scope: "current_thread",
    });
    const evidence = searched.packets[0];
    expect(evidence).toBeDefined();
    if (!evidence) throw new Error("Expected recall evidence");

    const expanded = await expandConversationEvidence({
      userId: "user-1",
      evidenceId: evidence.id,
      before: 9,
      after: 9,
    });

    expect(expanded?.excerpts).toEqual([
      { role: "user", text: "La finale" },
      { role: "assistant", text: "Respira" },
    ]);
    expect(mocks.chunkFindFirst.mock.calls[0]?.[0].where).toEqual({
      id: "chunk-1",
      userId: "user-1",
    });
    expect(mocks.messageFindMany.mock.calls[0]?.[0].where.deletedAt).toBeNull();
  });
});
