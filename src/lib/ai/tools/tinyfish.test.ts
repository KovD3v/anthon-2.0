import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tool: vi.fn((config) => config),
}));

vi.mock("ai", () => ({
  tool: mocks.tool,
}));

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
    const tools = createTinyfishTools();
    const result = await tools.tinyfishSearch.execute({
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
      }),
    );
    const url = fetchMock.mock.calls[0]?.[0] as URL;
    expect(url.searchParams.get("query")).toBe("monza serie 2026");
    expect(url.searchParams.get("language")).toBe("it");
    expect(url.searchParams.get("location")).toBe("IT");
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
      tools.tinyfishSearch.execute({ query: "latest sports news" }),
    ).resolves.toEqual({
      results: [],
      error: "Failed to perform search.",
    });
  });

  it("creates a TinyFish fetch tool that posts URLs to the Fetch API", async () => {
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
            text: "# Article\nContent",
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
    const tools = createTinyfishTools();
    const result = await tools.tinyfishFetch.execute({
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
          text: "# Article\nContent",
          links: ["https://example.com/related"],
          imageLinks: ["https://example.com/image.jpg"],
          latencyMs: 123,
          format: "markdown",
        },
      ],
      errors: [],
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
      tools.tinyfishFetch.execute({ urls: ["https://example.com"] }),
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
