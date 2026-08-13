import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServerTraceCollector } from "@/lib/response-profiler/server-trace";

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
  trackSupportAiUsage: vi.fn(),
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
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
  },
}));

vi.mock("@/lib/latency-logger", () => ({
  LatencyLogger: {
    measure: mocks.measure,
  },
}));

vi.mock("@/lib/ai/usage-meter", () => ({
  trackSupportAiUsage: mocks.trackSupportAiUsage,
}));

const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const embeddingVector = (first: number, second = first) => [
  first,
  second,
  ...Array.from({ length: 1534 }, () => 0),
];

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
    mocks.trackSupportAiUsage.mockReset();

    mocks.openrouter.mockReturnValue("rag-classifier-model");
    mocks.outputObject.mockImplementation(
      ({ schema }: { schema: unknown }) => ({ schema }),
    );
    mocks.measure.mockImplementation(
      async (_name: string, fn: () => unknown | Promise<unknown>) => await fn(),
    );
    mocks.trackSupportAiUsage.mockResolvedValue(undefined);

    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it("shouldUseRag skips database checks for obvious non-RAG messages", async () => {
    const { shouldUseRag } = await loadModule();

    const result = await shouldUseRag("ciao");

    expect(result).toBe(false);
    expect(mocks.ragDocumentCount).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("shouldUseRag skips database checks for brief conversational requests", async () => {
    const { shouldUseRag } = await loadModule();

    const result = await shouldUseRag("Ciao, dammi una risposta brevissima.");

    expect(result).toBe(false);
    expect(mocks.ragDocumentCount).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("shouldUseRag skips simple short coaching advice even when broad RAG keywords appear", async () => {
    const { shouldUseRag } = await loadModule();

    const result = await shouldUseRag(
      "Rispondi in massimo 45 parole: dammi un consiglio pratico pre-allenamento per restare concentrato.",
    );

    expect(result).toBe(false);
    expect(mocks.ragDocumentCount).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("shouldUseRag skips brief generic motivation even when training keywords appear", async () => {
    const { shouldUseRag } = await loadModule();

    const result = await shouldUseRag(
      "Dammi una risposta breve: motivami prima dell'allenamento.",
    );

    expect(result).toBe(false);
    expect(mocks.ragDocumentCount).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("shouldUseRag skips live web-search requests without invoking the classifier", async () => {
    const { shouldUseRag } = await loadModule();

    const result = await shouldUseRag(
      "Usa internet per verificare una notizia sportiva recente di oggi e dammi un consiglio pratico da coach collegato alla notizia.",
    );

    expect(result).toBe(false);
    expect(mocks.ragDocumentCount).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("shouldUseRag skips live web-search requests even when documents exist", async () => {
    mocks.ragDocumentCount.mockResolvedValue(1);
    const { shouldUseRag } = await loadModule();

    const result = await shouldUseRag(
      "Cerca nel web le ultime notizie di oggi su Sinner",
    );

    expect(result).toBe(false);
    expect(mocks.ragDocumentCount).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("shouldUseRag returns true for positive keywords when documents exist", async () => {
    mocks.ragDocumentCount.mockResolvedValue(1);
    const { shouldUseRag } = await loadModule();

    const result = await shouldUseRag("come strutturo un allenamento tecnico?");

    expect(result).toBe(true);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it.each([
    "Vomito spesso prima della partita",
    "Dopo il richiamo del mister perdo lucidità in campo",
    "Ho paura di sbagliare il rigore decisivo",
    "Sono nervoso prima della gara",
    "Ho paura mentre mi alleno",
  ])(
    "shouldUseRag routes explicit sports mental-performance needs without the classifier: %s",
    async (query) => {
      mocks.ragDocumentCount.mockResolvedValue(1);
      const { shouldUseRag } = await loadModule();

      const result = await shouldUseRag(query);

      expect(result).toBe(true);
      expect(mocks.generateText).not.toHaveBeenCalled();
    },
  );

  it.each([
    "Ho ansia per l'esame di matematica",
    "Sono sotto pressione al lavoro",
  ])(
    "shouldUseRag does not treat ambiguous mental terms as sports context: %s",
    async (query) => {
      mocks.ragDocumentCount.mockResolvedValue(1);
      mocks.generateText.mockResolvedValue({
        output: { needsRag: false, reason: "non-sports context" },
      });
      const { shouldUseRag } = await loadModule();

      const result = await shouldUseRag(query);

      expect(result).toBe(false);
      expect(mocks.generateText).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["Ora aiutami a fare gol", "Come mi alleno domani?"])(
    "shouldUseRag leaves generic technical sports requests to the classifier: %s",
    async (query) => {
      mocks.ragDocumentCount.mockResolvedValue(1);
      mocks.generateText.mockResolvedValue({
        output: { needsRag: false, reason: "generic technical request" },
      });
      const { shouldUseRag } = await loadModule();

      const result = await shouldUseRag(query);

      expect(result).toBe(false);
      expect(mocks.generateText).toHaveBeenCalledTimes(1);
    },
  );

  it("shouldUseRag does not treat non-sports fear as a sports coaching need", async () => {
    mocks.ragDocumentCount.mockResolvedValue(1);
    mocks.generateText.mockResolvedValue({
      output: { needsRag: false, reason: "school concern" },
    });
    const { shouldUseRag } = await loadModule();

    const result = await shouldUseRag("Ho paura di essere bocciato a scuola");

    expect(result).toBe(false);
  });

  it("shouldUseRag does not auto-enable RAG for generic question words", async () => {
    mocks.ragDocumentCount.mockResolvedValue(1);
    mocks.generateText.mockResolvedValue({
      output: { needsRag: false, reason: "generic personal question" },
    });
    const { shouldUseRag } = await loadModule();

    const result = await shouldUseRag("Quale approccio mi consigli oggi?");

    expect(result).toBe(false);
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });

  it("shouldUseRag uses LLM classification and caches decision", async () => {
    mocks.ragDocumentCount.mockResolvedValue(1);
    mocks.generateText.mockResolvedValue({
      output: { needsRag: true, reason: "technical methodology request" },
      usage: { inputTokens: 80, outputTokens: 12 },
    });
    const { shouldUseRag } = await loadModule();
    const query = "Can you compare periodization frameworks for athletes?";

    const first = await shouldUseRag(query, { userId: "user-1" });
    const second = await shouldUseRag(query, { userId: "user-1" });

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(mocks.openrouter).toHaveBeenCalledWith(
      "nvidia/nemotron-3.5-lightning",
    );
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: { totalMs: 3000 },
        providerOptions: {
          openrouter: {
            provider: {
              sort: "latency",
              only: ["DeepInfra"],
              allow_fallbacks: false,
              require_parameters: true,
              max_price: { prompt: 0.05, completion: 0.2 },
            },
            reasoning: { enabled: false, max_tokens: 1 },
          },
        },
      }),
    );
    expect(mocks.trackSupportAiUsage).toHaveBeenCalledWith({
      userId: "user-1",
      modelId: "nvidia/nemotron-3.5-lightning",
      usage: { inputTokens: 80, outputTokens: 12 },
      providerMetadata: undefined,
    });
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

  it("shouldUseRag returns false when LLM classification output is malformed", async () => {
    mocks.ragDocumentCount.mockResolvedValue(1);
    mocks.generateText.mockResolvedValue({
      output: { reason: "missing boolean" },
    });
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
          data: [{ embedding: embeddingVector(0.1, 0.2) }],
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
      `[${embeddingVector(0.1, 0.2).join(",")}]`,
      5,
    );
  });

  it("accepts matches above the calibrated similarity threshold only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ embedding: embeddingVector(0.1, 0.2) }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.queryRawUnsafe.mockResolvedValue([
      { content: "Above threshold", title: "Doc A", similarity: 0.39 },
      { content: "At threshold", title: "Doc B", similarity: 0.38 },
    ]);

    const { searchDocuments } = await loadModule();
    const result = await searchDocuments("query text", 5);

    expect(result).toEqual([
      { content: "Above threshold", title: "Doc A", similarity: 0.39 },
    ]);
  });

  it("keeps a close match just above 0.38 and rejects one just below it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ embedding: embeddingVector(0.1, 0.2) }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.queryRawUnsafe.mockResolvedValue([
      { content: "Just above", title: "Doc A", similarity: 0.3801 },
      { content: "Just below", title: "Doc B", similarity: 0.3799 },
    ]);

    const { searchDocuments } = await loadModule();
    const result = await searchDocuments("query text", 5);

    expect(result).toEqual([
      { content: "Just above", title: "Doc A", similarity: 0.3801 },
    ]);
  });

  it("keeps the production-calibrated match at 0.3834 and rejects the 0.3768 candidate", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ embedding: embeddingVector(0.1, 0.2) }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.queryRawUnsafe.mockResolvedValue([
      {
        content: "Production-calibrated accepted match",
        title: "Doc A",
        similarity: 0.3834,
      },
      {
        content: "Production-calibrated rejected candidate",
        title: "Doc B",
        similarity: 0.3768,
      },
    ]);

    const { searchDocuments } = await loadModule();
    const result = await searchDocuments("Ho ansia di perdere la palla", 5);

    expect(result).toEqual([
      {
        content: "Production-calibrated accepted match",
        title: "Doc A",
        similarity: 0.3834,
      },
    ]);
  });

  it("rejects matches that would have passed the previous 0.35 calibration", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ embedding: embeddingVector(0.1, 0.2) }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.queryRawUnsafe.mockResolvedValue([
      { content: "Former threshold match", title: "Doc A", similarity: 0.3799 },
      { content: "Former threshold match", title: "Doc B", similarity: 0.36 },
      { content: "Former threshold match", title: "Doc C", similarity: 0.35 },
    ]);

    const { searchDocuments } = await loadModule();
    const result = await searchDocuments(
      "Vomito spesso prima della partita",
      5,
    );

    expect(result).toEqual([]);
  });

  it("reports an empty but successful retrieval when every match is at the threshold", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ embedding: embeddingVector(0.3, 0.4) }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.queryRawUnsafe.mockResolvedValue([
      { content: "Boundary chunk", title: "Doc A", similarity: 0.38 },
    ]);

    const { getRagContext } = await loadModule();
    const result = await getRagContext("query text");

    expect(result).toEqual({
      text: "Nessun documento rilevante trovato.",
      chunkCount: 0,
      failed: false,
    });
  });

  it("does not query the vector store when the embedding service returns no embedding", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { searchDocuments } = await loadModule();
    const result = await searchDocuments("query text", 5);

    expect(result).toEqual([]);
    expect(mocks.queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("does not query the vector store when the embedding provider rejects the request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { searchDocuments } = await loadModule();
    const result = await searchDocuments("query text", 5);

    expect(result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("does not call the embedding provider for a blank search query", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { searchDocuments } = await loadModule();
    const result = await searchDocuments("   ", 5);

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("getRagContext formats search results for prompt injection", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ embedding: embeddingVector(0.5, 0.6) }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.queryRawUnsafe.mockResolvedValue([
      {
        chunkId: "chunk-x",
        documentId: "document-x",
        documentTitle: "Doc X",
        content: "Chunk content",
        title: "Doc X",
        similarity: 0.88,
      },
    ]);

    const { getRagContext } = await loadModule();
    const context = await getRagContext("topic");

    expect(context.text).toContain("### Documenti rilevanti:");
    expect(context.text).toContain("**Doc X**");
    expect(context.text).toContain("Chunk content");
    expect(context.chunkCount).toBe(1);
    expect(context.diagnostics).toEqual({
      query: "topic",
      chunks: [
        {
          chunkId: "chunk-x",
          documentId: "document-x",
          documentTitle: "Doc X",
          content: "Chunk content",
          title: "Doc X",
          similarity: 0.88,
        },
      ],
      failed: false,
    });
    expect(mocks.queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('rc.id AS "chunkId"'),
      expect.any(String),
      5,
    );
  });

  it("does not construct raw RAG diagnostics outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ embedding: embeddingVector(0.5, 0.6) }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    mocks.queryRawUnsafe.mockResolvedValue([
      { content: "secret", title: "Doc", similarity: 0.88 },
    ]);
    const { getRagContext } = await loadModule();

    const context = await getRagContext("secret query");

    expect(context).not.toHaveProperty("diagnostics");
  });

  it("profiles embedding and vector retrieval without query or chunk content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ embedding: embeddingVector(0.5, 0.6) }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.queryRawUnsafe.mockResolvedValue([
      {
        content: "SECRET_CHUNK_CONTENT",
        title: "SECRET_TITLE",
        similarity: 0.88,
      },
    ]);
    const collector = createServerTraceCollector();
    const { getRagContext } = await loadModule();

    await getRagContext("SECRET_QUERY", collector);

    const trace = collector.snapshot("completed");
    expect(trace.spans).toEqual([
      expect.objectContaining({ name: "rag_embedding", status: "completed" }),
      expect.objectContaining({
        name: "rag_search",
        status: "completed",
        attributes: { ragChunkCount: 1 },
      }),
    ]);
    const serialized = JSON.stringify(trace);
    expect(serialized).not.toContain("SECRET_QUERY");
    expect(serialized).not.toContain("SECRET_CHUNK_CONTENT");
    expect(serialized).not.toContain("SECRET_TITLE");
  });

  it("getRagContext injects all accepted chunks in vector-search order", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ embedding: embeddingVector(0.7, 0.8) }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.queryRawUnsafe.mockResolvedValue([
      { content: "First chunk", title: "Doc A", similarity: 0.61 },
      { content: "Boundary chunk", title: "Doc B", similarity: 0.38 },
      { content: "Second chunk", title: "Doc C", similarity: 0.42 },
    ]);

    const { getRagContext } = await loadModule();
    const context = await getRagContext("topic");

    expect(context.chunkCount).toBe(2);
    expect(context.text).toContain("**Doc A**");
    expect(context.text).toContain("First chunk");
    expect(context.text).toContain("**Doc C**");
    expect(context.text).toContain("Second chunk");
    expect(context.text).not.toContain("Boundary chunk");
    expect(context.text.indexOf("**Doc A**")).toBeLessThan(
      context.text.indexOf("**Doc C**"),
    );
  });

  it("getRagContext marks database failures without exposing diagnostics", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ embedding: embeddingVector(0.5, 0.6) }] }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    mocks.queryRawUnsafe.mockRejectedValue(new Error("database detail"));
    const { getRagContext } = await loadModule();

    const context = await getRagContext("topic");

    expect(context).toMatchObject({
      text: "Nessun documento rilevante trovato.",
      chunkCount: 0,
      failed: true,
      diagnostics: {
        query: "topic",
        chunks: [],
        failed: true,
        error: expect.any(Error),
      },
    });
  });

  it("buildRagContext returns an explicit empty-retrieval marker", async () => {
    const { buildRagContext } = await loadModule();

    expect(buildRagContext([])).toEqual({
      text: "Nessun documento rilevante trovato.",
      chunkCount: 0,
    });
  });

  it("addDocument creates document and inserts only chunks with embeddings", async () => {
    const longContent = `${"a ".repeat(500)}\n\n${"b ".repeat(500)}`;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { index: 1 },
            { index: 0, embedding: embeddingVector(0.11, 0.22) },
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
      `[${embeddingVector(0.11, 0.22).join(",")}]`,
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
            { index: 1, embedding: embeddingVector(0.9, 0.8) },
            { index: 0, embedding: embeddingVector(0.1, 0.2) },
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
      `[${embeddingVector(0.1, 0.2).join(",")}]`,
      "chunk-1",
    );
    expect(mocks.executeRawUnsafe).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE "RagChunk" SET embedding'),
      `[${embeddingVector(0.9, 0.8).join(",")}]`,
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
