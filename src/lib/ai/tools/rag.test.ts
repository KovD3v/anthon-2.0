import type { ToolExecutionOptions } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tool: vi.fn((config) => config),
  getRagContext: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("ai", () => ({
  tool: mocks.tool,
}));

vi.mock("@/lib/ai/rag", () => ({
  getRagContext: mocks.getRagContext,
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.loggerError,
  }),
}));

type RagTools = ReturnType<typeof import("./rag").createRagTools>;
type RagSearchInput = Parameters<
  NonNullable<RagTools["searchRag"]["execute"]>
>[0];

const toolExecutionOptions: ToolExecutionOptions<Record<string, unknown>> = {
  toolCallId: "rag-test-call",
  messages: [],
  context: {},
};

async function executeSearch(tools: RagTools, input: RagSearchInput) {
  const execute = tools.searchRag.execute;
  if (!execute) {
    throw new Error("searchRag execute is missing");
  }
  return await execute(input, toolExecutionOptions);
}

describe("ai/tools/rag", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.tool.mockClear();
    mocks.getRagContext.mockReset();
    mocks.loggerError.mockReset();
  });

  it("searchRag calls the retrieval boundary once with a trimmed bounded query", async () => {
    mocks.getRagContext.mockResolvedValue({
      text: "### Documenti rilevanti:\nAllenamento",
      chunkCount: 1,
    });
    const { createRagTools } = await import("./rag");

    const result = await executeSearch(
      createRagTools({ maxQueryCharacters: 24 }),
      {
        query: "  come preparo la gara?  ",
      },
    );

    expect(mocks.getRagContext).toHaveBeenCalledTimes(1);
    expect(mocks.getRagContext).toHaveBeenCalledWith("come preparo la gara?");
    expect(result).toEqual({
      success: true,
      chunkCount: 1,
      context: "### Documenti rilevanti:\nAllenamento",
    });
  });

  it.each(["   ", "questa domanda supera il limite configurato"])(
    "searchRag rejects an invalid query without retrieving context",
    async (query) => {
      const { createRagTools } = await import("./rag");

      const result = await executeSearch(
        createRagTools({ maxQueryCharacters: 12 }),
        { query },
      );

      expect(result).toEqual({ success: false, chunkCount: 0, context: "" });
      expect(mocks.getRagContext).not.toHaveBeenCalled();
    },
  );

  it("searchRag returns an empty closed result when no chunks match", async () => {
    mocks.getRagContext.mockResolvedValue({
      text: "Nessun documento rilevante trovato.",
      chunkCount: 0,
    });
    const { createRagTools } = await import("./rag");

    const result = await executeSearch(createRagTools(), { query: "mobilità" });

    expect(result).toEqual({ success: true, chunkCount: 0, context: "" });
  });

  it("searchRag allows at most one retrieval per tool instance", async () => {
    mocks.getRagContext.mockResolvedValue({
      text: "Contesto sicuro",
      chunkCount: 1,
    });
    const { createRagTools } = await import("./rag");
    const tools = createRagTools();

    await executeSearch(tools, { query: "mobilità" });
    const secondResult = await executeSearch(tools, { query: "recupero" });

    expect(mocks.getRagContext).toHaveBeenCalledTimes(1);
    expect(secondResult).toEqual({
      success: false,
      chunkCount: 0,
      context: "",
    });
  });

  it("searchRag logs failures and returns no diagnostic payload", async () => {
    mocks.getRagContext.mockRejectedValue(new Error("database detail"));
    const { createRagTools } = await import("./rag");

    const result = await executeSearch(createRagTools(), { query: "mobilità" });

    expect(result).toEqual({ success: false, chunkCount: 0, context: "" });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "ai.rag.tool.failed",
      "RAG tool retrieval failed",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it("searchRag returns a safe failure when retrieval reports a provider or database error", async () => {
    mocks.getRagContext.mockResolvedValue({
      text: "",
      chunkCount: 0,
      failed: true,
    });
    const { createRagTools } = await import("./rag");

    const result = await executeSearch(createRagTools(), { query: "mobilità" });

    expect(result).toEqual({ success: false, chunkCount: 0, context: "" });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      "ai.rag.tool.failed",
      "RAG tool retrieval failed",
      expect.anything(),
    );
  });

  it("searchRag exposes only context and chunk count", async () => {
    mocks.getRagContext.mockResolvedValue({
      text: "Contesto sicuro",
      chunkCount: 1,
      embedding: [0.1, 0.2],
      documentId: "document-secret",
      diagnostic: { query: "raw query" },
    });
    const { createRagTools } = await import("./rag");

    const result = await executeSearch(createRagTools(), { query: "mobilità" });

    expect(result).toEqual({
      success: true,
      chunkCount: 1,
      context: "Contesto sicuro",
    });
    expect(Object.keys(result).sort()).toEqual([
      "chunkCount",
      "context",
      "success",
    ]);
  });
});
