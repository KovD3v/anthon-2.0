import type { ToolExecutionOptions } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tool: vi.fn((config) => config),
}));

vi.mock("ai", () => ({
  tool: mocks.tool,
}));

type TinyfishTools = ReturnType<
  typeof import("./tinyfish").createTinyfishTools
>;
type TinyfishSearchInput = Parameters<
  NonNullable<TinyfishTools["tinyfishSearch"]["execute"]>
>[0];
type TinyfishFetchInput = Parameters<
  NonNullable<TinyfishTools["tinyfishFetch"]["execute"]>
>[0];
type TinyfishFetchTestInput = Omit<TinyfishFetchInput, "format"> &
  Partial<Pick<TinyfishFetchInput, "format">>;
type TestInputSchema = {
  safeParse: (
    input: unknown,
  ) => { success: true; data: unknown } | { success: false; error: unknown };
};

const toolExecutionOptions: ToolExecutionOptions<Record<string, unknown>> = {
  toolCallId: "tinyfish-test-call",
  messages: [],
  context: {},
};

async function executeSearch(tools: TinyfishTools, input: TinyfishSearchInput) {
  const execute = tools.tinyfishSearch.execute;
  if (!execute) {
    throw new Error("tinyfishSearch execute is missing");
  }
  return await execute(input, toolExecutionOptions);
}

async function executeFetch(
  tools: TinyfishTools,
  input: TinyfishFetchTestInput,
) {
  const execute = tools.tinyfishFetch.execute;
  if (!execute) {
    throw new Error("tinyfishFetch execute is missing");
  }
  return await execute(input as TinyfishFetchInput, toolExecutionOptions);
}

describe("ai/tools/tinyfish", () => {
  const originalApiKey = process.env.TINYFISH_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    mocks.tool.mockClear();
    process.env.TINYFISH_API_KEY = "tinyfish-test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.TINYFISH_API_KEY = originalApiKey;
  });

  it("creates a TinyFish search tool that calls the Search API with the API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query: "monza serie 2026",
        results: [
          {
            position: 1,
            site_name: "example.com",
            title: "Monza news",
            snippet: "Latest Monza category update.",
            url: "https://example.com/monza",
          },
        ],
        total_results: 1,
        page: 0,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { createTinyfishTools } = await import("./tinyfish");
    const tools = createTinyfishTools({ defaultSearchDomainType: "news" });
    const result = await executeSearch(tools, {
      query: "monza serie 2026",
      language: "it",
      location: "IT",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining("https://api.search.tinyfish.ai/"),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-API-Key": "tinyfish-test-key",
        }),
        signal: expect.any(Object),
      }),
    );
    const url = fetchMock.mock.calls[0]?.[0] as URL;
    expect(url.searchParams.get("query")).toBe("monza serie 2026");
    expect(url.searchParams.get("language")).toBe("it");
    expect(url.searchParams.get("location")).toBe("IT");
    expect(url.searchParams.get("domain_type")).toBe("news");
    expect(result).toEqual({
      query: "monza serie 2026",
      results: [
        {
          title: "Monza news",
          url: "https://example.com/monza",
          content: "Latest Monza category update.",
          siteName: "example.com",
          position: 1,
        },
      ],
      totalResults: 1,
      page: 0,
    });
  });

  it("keeps search domain type controlled by code instead of tool input", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query: "world cup results",
        results: [],
        total_results: 0,
        page: 0,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { createTinyfishTools } = await import("./tinyfish");
    const tools = createTinyfishTools({ defaultSearchDomainType: "web" });
    const inputSchema = tools.tinyfishSearch.inputSchema as TestInputSchema;
    const parsed = inputSchema.safeParse({
      query: "world cup results",
      domainType: "news",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error("Expected search input schema to parse query");
    }
    expect(parsed.data).toEqual({ query: "world cup results" });

    await executeSearch(tools, {
      query: "world cup results",
      domainType: "news",
    } as TinyfishSearchInput & { domainType: "news" });

    const url = fetchMock.mock.calls[0]?.[0] as URL;
    expect(url.searchParams.get("domain_type")).toBe("web");
  });

  it("returns a structured error when TinyFish search fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      }),
    );

    const { createTinyfishTools } = await import("./tinyfish");
    const tools = createTinyfishTools();

    await expect(
      executeSearch(tools, { query: "latest sports news" }),
    ).resolves.toEqual({
      results: [],
      error: "Failed to perform search.",
    });
  });

  it("reuses identical TinyFish search calls from the same response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query: "world cup results",
        results: [
          {
            position: 1,
            title: "World Cup result",
            snippet: "The latest result.",
            url: "https://example.com/result",
          },
        ],
        total_results: 1,
        page: 0,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { createTinyfishTools } = await import("./tinyfish");
    const tools = createTinyfishTools({ maxSearchCalls: 1 });

    const firstResult = await executeSearch(tools, {
      query: "world cup results",
      language: "en",
    });
    const secondResult = await executeSearch(tools, {
      query: "world cup results",
      language: "en",
    });
    const differentResult = await executeSearch(tools, {
      query: "world cup results June 28",
      language: "en",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(secondResult).toEqual(firstResult);
    expect(differentResult).toEqual({
      results: [],
      error:
        "Search limit reached for this response. Use the existing search results instead.",
    });
  });

  it("limits and compacts search results when configured for search-only turns", async () => {
    const longSnippet = `${"A".repeat(260)} trailing content that should be trimmed.`;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query: "world cup today",
        results: Array.from({ length: 6 }, (_, index) => ({
          position: index + 1,
          site_name: `site-${index + 1}.com`,
          title: `Result ${index + 1}`,
          snippet: longSnippet,
          url: `https://example.com/result-${index + 1}`,
        })),
        total_results: 6,
        page: 0,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { createTinyfishTools } = await import("./tinyfish");
    const tools = createTinyfishTools({
      maxSearchResults: 3,
      maxSearchSnippetChars: 120,
    });

    const result = await executeSearch(tools, {
      query: "world cup today",
      language: "en",
    });
    const searchResult = result as Awaited<ReturnType<typeof executeSearch>> & {
      results: Array<{ content: string }>;
      totalResults?: number;
    };

    expect(searchResult.results).toHaveLength(3);
    expect(searchResult.totalResults).toBe(6);
    expect(searchResult.results[0]?.content.length).toBeLessThanOrEqual(120);
    expect(JSON.stringify(searchResult).length).toBeLessThan(1000);
  });

  it("short-circuits repeated search calls from the same response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query: "world cup results",
        results: [],
        total_results: 0,
        page: 0,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { createTinyfishTools } = await import("./tinyfish");
    const tools = createTinyfishTools({ maxSearchCalls: 1 });

    await executeSearch(tools, { query: "world cup results" });
    const secondResult = await executeSearch(tools, {
      query: "world cup results June 28",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(secondResult).toEqual({
      results: [],
      error:
        "Search limit reached for this response. Use the existing search results instead.",
    });
  });

  it("creates a TinyFish fetch tool that posts URLs to the Fetch API", async () => {
    const longText = `${"A".repeat(80)} content that should be trimmed.`;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            url: "https://example.com/article",
            final_url: "https://example.com/article",
            title: "Article title",
            description: "Article description",
            language: "en",
            author: "Reporter",
            published_date: "2026-06-29",
            text: longText,
            links: ["https://example.com/related"],
            image_links: ["https://example.com/image.jpg"],
            latency_ms: 123,
            format: "markdown",
          },
        ],
        errors: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { createTinyfishTools } = await import("./tinyfish");
    const tools = createTinyfishTools({ maxFetchTextChars: 40 });
    const result = await executeFetch(tools, {
      urls: ["https://example.com/article"],
      links: true,
      imageLinks: true,
      ttl: 0,
      perUrlTimeoutMs: 45_000,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining("https://api.fetch.tinyfish.ai/"),
      }),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-API-Key": "tinyfish-test-key",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          urls: ["https://example.com/article"],
          format: "markdown",
          links: true,
          image_links: true,
          ttl: 0,
          per_url_timeout_ms: 45_000,
        }),
      }),
    );
    expect(result).toEqual({
      results: [
        {
          url: "https://example.com/article",
          finalUrl: "https://example.com/article",
          title: "Article title",
          description: "Article description",
          language: "en",
          author: "Reporter",
          publishedDate: "2026-06-29",
          text: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          links: ["https://example.com/related"],
          imageLinks: ["https://example.com/image.jpg"],
          latencyMs: 123,
          format: "markdown",
        },
      ],
      errors: [],
    });
  });

  it("limits TinyFish fetch batches before posting URLs", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [],
        errors: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { createTinyfishTools } = await import("./tinyfish");
    const tools = createTinyfishTools({ maxFetchUrls: 2 });
    await executeFetch(tools, {
      urls: [
        "https://example.com/one",
        "https://example.com/two",
        "https://example.com/three",
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: JSON.stringify({
          urls: ["https://example.com/one", "https://example.com/two"],
          format: "markdown",
          per_url_timeout_ms: 15_000,
        }),
      }),
    );
  });

  it("uses configured fetch defaults for interactive chat", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [],
        errors: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { createTinyfishTools } = await import("./tinyfish");
    const tools = createTinyfishTools({
      defaultFetchTtl: 3600,
      defaultFetchPerUrlTimeoutMs: 8_000,
      fetchRequestTimeoutMs: 12_000,
    });
    await executeFetch(tools, {
      urls: ["https://example.com/one"],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        body: JSON.stringify({
          urls: ["https://example.com/one"],
          format: "markdown",
          ttl: 3600,
          per_url_timeout_ms: 8_000,
        }),
      }),
    );
  });

  it("reuses identical TinyFish fetch calls from the same response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            url: "https://example.com/one",
            final_url: "https://example.com/one",
            title: "One",
            text: "Fetched content",
            format: "markdown",
          },
        ],
        errors: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { createTinyfishTools } = await import("./tinyfish");
    const tools = createTinyfishTools({ maxFetchCalls: 1 });

    const firstResult = await executeFetch(tools, {
      urls: ["https://example.com/one"],
    });
    const secondResult = await executeFetch(tools, {
      urls: ["https://example.com/one"],
    });
    const differentResult = await executeFetch(tools, {
      urls: ["https://example.com/two"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(secondResult).toEqual(firstResult);
    expect(differentResult).toEqual({
      results: [],
      errors: [
        {
          error:
            "Fetch limit reached for this response. Use the already fetched pages instead.",
        },
      ],
    });
  });

  it("short-circuits repeated fetch calls from the same response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [],
        errors: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { createTinyfishTools } = await import("./tinyfish");
    const tools = createTinyfishTools({ maxFetchCalls: 1 });

    await executeFetch(tools, { urls: ["https://example.com/one"] });
    const secondResult = await executeFetch(tools, {
      urls: ["https://example.com/two"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(secondResult).toEqual({
      results: [],
      errors: [
        {
          error:
            "Fetch limit reached for this response. Use the already fetched pages instead.",
        },
      ],
    });
  });

  it("returns a structured error when TinyFish fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal error",
      }),
    );

    const { createTinyfishTools } = await import("./tinyfish");
    const tools = createTinyfishTools();

    await expect(
      executeFetch(tools, { urls: ["https://example.com"] }),
    ).resolves.toEqual({
      results: [],
      errors: [
        {
          error: "Failed to fetch content.",
        },
      ],
    });
  });
});
