import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  outputObject: vi.fn(),
  openrouter: vi.fn(),
  ragDocumentCount: vi.fn(),
  ragDocumentCreate: vi.fn(),
  ragDocumentDelete: vi.fn(),
  ragDocumentFindMany: vi.fn(),
  ragChunkDeleteMany: vi.fn(),
  queryRawUnsafe: vi.fn(),
  queryRaw: vi.fn(),
  executeRawUnsafe: vi.fn(),
  measure: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: {
    object: mocks.outputObject,
  },
}));

vi.mock("@/lib/ai/providers/openrouter", () => ({
  openrouter: mocks.openrouter,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    ragDocument: {
      count: mocks.ragDocumentCount,
      create: mocks.ragDocumentCreate,
      delete: mocks.ragDocumentDelete,
      findMany: mocks.ragDocumentFindMany,
    },
    ragChunk: {
      deleteMany: mocks.ragChunkDeleteMany,
    },
    $queryRawUnsafe: mocks.queryRawUnsafe,
    $queryRaw: mocks.queryRaw,
    $executeRawUnsafe: mocks.executeRawUnsafe,
  },
}));

vi.mock("@/lib/latency-logger", () => ({
  LatencyLogger: {
    measure: mocks.measure,
  },
}));

const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

async function loadModule() {
  return await import("./rag");
}

describe("ai/rag", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();

    mocks.generateText.mockReset();
    mocks.outputObject.mockReset();
    mocks.openrouter.mockReset();
    mocks.ragDocumentCount.mockReset();
    mocks.ragDocumentCreate.mockReset();
    mocks.ragDocumentDelete.mockReset();
    mocks.ragDocumentFindMany.mockReset();
    mocks.ragChunkDeleteMany.mockReset();
    mocks.queryRawUnsafe.mockReset();
    mocks.queryRaw.mockReset();
    mocks.executeRawUnsafe.mockReset();
    mocks.measure.mockReset();

    mocks.openrouter.mockReturnValue("rag-classifier-model");
    mocks.outputObject.mockImplementation(
      ({ schema }: { schema: unknown }) => ({ schema }),
    );
    mocks.measure.mockImplementation(
      async (_name: string, fn: () => unknown | Promise<unknown>) => await fn(),
    );

    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  });

  afterEach(() => {
    process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });

  it("shouldUseRag returns false immediately when no documents exist", async () => {
    mocks.ragDocumentCount.mockResolvedValue(0);
    const { shouldUseRag } = await loadModule();

    const result = await shouldUseRag("come migliorare la tecnica di servizio");

    expect(result).toBe(false);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("shouldUseRag returns true for positive keywords when documents exist", async () => {
    mocks.ragDocumentCount.mockResolvedValue(1);
    const { shouldUseRag } = await loadModule();

    const result = await shouldUseRag("come strutturo un allenamento tecnico?");

    expect(result).toBe(true);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("shouldUseRag uses LLM classification and caches decision", async () => {
    mocks.ragDocumentCount.mockResolvedValue(1);
    mocks.generateText.mockResolvedValue({
      output: { needsRag: true, reason: "technical methodology request" },
    });
    const { shouldUseRag } = await loadModule();
    const query = "Can you compare periodization frameworks for athletes?";

    const first = await shouldUseRag(query);
    const second = await shouldUseRag(query);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });

  it("shouldUseRag returns false when LLM classification throws", async () => {
    mocks.ragDocumentCount.mockResolvedValue(1);
    mocks.generateText.mockRejectedValue(new Error("classifier failure"));
    const { shouldUseRag } = await loadModule();

    const result = await shouldUseRag(
      "Please evaluate this training framework for youth athletes.",
    );

    expect(result).toBe(false);
  });

  it("searchDocuments returns filtered semantic matches by similarity threshold", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.queryRawUnsafe.mockResolvedValue([
      { content: "High relevance", title: "Doc A", similarity: 0.91 },
      { content: "Low relevance", title: "Doc B", similarity: 0.2 },
    ]);

    const { searchDocuments } = await loadModule();
    const result = await searchDocuments("query text", 5);

    expect(result).toEqual([
      { content: "High relevance", title: "Doc A", similarity: 0.91 },
    ]);
    expect(mocks.queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY rc.embedding <=> $1::vector"),
      "[0.1,0.2,0.3]",
      5,
    );
  });

  it("getRagContext formats search results for prompt injection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ embedding: [0.5, 0.6] }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.queryRawUnsafe.mockResolvedValue([
      { content: "Chunk content", title: "Doc X", similarity: 0.88 },
    ]);

    const { getRagContext } = await loadModule();
    const context = await getRagContext("topic");

    expect(context).toContain("### Documenti rilevanti:");
    expect(context).toContain("**Doc X**");
    expect(context).toContain("Chunk content");
  });

  it("addDocument creates document and inserts only chunks with embeddings", async () => {
    const longContent = `${"a ".repeat(500)}\n\n${"b ".repeat(500)}`;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { index: 1 },
            { index: 0, embedding: [0.11, 0.22] },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.ragDocumentCreate.mockResolvedValue({ id: "doc-1" });
    mocks.executeRawUnsafe.mockResolvedValue({});

    const { addDocument } = await loadModule();
    const documentId = await addDocument("Playbook", longContent, "upload");

    expect(documentId).toBe("doc-1");
    expect(mocks.ragDocumentCreate).toHaveBeenCalledWith({
      data: {
        title: "Playbook",
        source: "upload",
        url: undefined,
      },
    });
    expect(mocks.executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(mocks.executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "RagChunk"'),
      expect.stringContaining("chunk_doc-1_"),
      "doc-1",
      expect.any(String),
      expect.any(Number),
      "[0.11,0.22]",
    );
  });

  it("updateMissingEmbeddings returns 0 when there are no chunks to update", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    const { updateMissingEmbeddings } = await loadModule();

    await expect(updateMissingEmbeddings()).resolves.toBe(0);
    expect(mocks.executeRawUnsafe).not.toHaveBeenCalled();
  });

  it("updateMissingEmbeddings updates all chunks with generated embeddings", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { index: 1, embedding: [0.9, 0.8] },
            { index: 0, embedding: [0.1, 0.2] },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.queryRaw.mockResolvedValue([
      { id: "chunk-1", content: "first" },
      { id: "chunk-2", content: "second" },
    ]);
    mocks.executeRawUnsafe.mockResolvedValue({});

    const { updateMissingEmbeddings } = await loadModule();
    const updated = await updateMissingEmbeddings();

    expect(updated).toBe(2);
    expect(mocks.executeRawUnsafe).toHaveBeenCalledTimes(2);
    expect(mocks.executeRawUnsafe).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE "RagChunk" SET embedding'),
      "[0.1,0.2]",
      "chunk-1",
    );
    expect(mocks.executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE "RagChunk" SET embedding'),
      "[0.9,0.8]",
      "chunk-2",
    );
  });

  it("lists documents with mapped chunk counts and deletes documents with chunks first", async () => {
    const createdAt = new Date("2026-02-17T12:00:00.000Z");
    mocks.ragDocumentFindMany.mockResolvedValue([
      {
        id: "doc-1",
        title: "Doc 1",
        source: "upload",
        createdAt,
        _count: { chunks: 3 },
      },
    ]);
    mocks.ragChunkDeleteMany.mockResolvedValue({ count: 3 });
    mocks.ragDocumentDelete.mockResolvedValue({});

    const { listDocuments, deleteDocument } = await loadModule();
    const docs = await listDocuments();
    await deleteDocument("doc-1");

    expect(docs).toEqual([
      {
        id: "doc-1",
        title: "Doc 1",
        source: "upload",
        chunkCount: 3,
        createdAt,
      },
    ]);
    expect(mocks.ragChunkDeleteMany).toHaveBeenCalledWith({
      where: { documentId: "doc-1" },
    });
    expect(mocks.ragDocumentDelete).toHaveBeenCalledWith({
      where: { id: "doc-1" },
    });
  });
});
