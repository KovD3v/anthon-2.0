import { tool } from "ai";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const tinyfishLogger = createLogger("ai");
const TINYFISH_SEARCH_URL = "https://api.search.tinyfish.ai";
const TINYFISH_FETCH_URL = "https://api.fetch.tinyfish.ai";
const MAX_RECENCY_MINUTES = 5_256_000;
const MAX_FETCH_TIMEOUT_MS = 110_000;
const DEFAULT_SEARCH_TIMEOUT_MS = 10_000;
const DEFAULT_FETCH_REQUEST_TIMEOUT_MS = 25_000;
const DEFAULT_FETCH_PER_URL_TIMEOUT_MS = 15_000;

export type TinyfishSearchDomainType = "web" | "news" | "research_paper";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format");

type TinyfishSearchResponse = {
  query?: string;
  results?: Array<{
    position?: number;
    site_name?: string;
    title?: string;
    snippet?: string;
    url?: string;
  }>;
  total_results?: number;
  page?: number;
};

type TinyfishFetchResponse = {
  results?: Array<{
    url?: string;
    final_url?: string;
    title?: string | null;
    description?: string | null;
    language?: string | null;
    author?: string | null;
    published_date?: string | null;
    text?: string | object;
    links?: string[];
    image_links?: string[];
    latency_ms?: number | null;
    format?: "markdown" | "html" | "json";
  }>;
  errors?: Array<{
    url?: string;
    error?: string;
    status?: number;
  }>;
};

export type TinyfishSearchToolResult = {
  query?: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    siteName: string;
    position: number | null;
  }>;
  totalResults?: number;
  page?: number;
  error?: string;
};

type TinyfishFetchToolResult = {
  results: Array<{
    url: string;
    finalUrl: string;
    title: string | null;
    description: string | null;
    language: string | null;
    author: string | null;
    publishedDate: string | null;
    text: string | object;
    links?: string[];
    imageLinks?: string[];
    latencyMs: number | null;
    format: "markdown" | "html" | "json";
  }>;
  errors: Array<{
    url?: string;
    error?: string;
    status?: number;
  }>;
};

type TinyfishToolsOptions = {
  maxSearchCalls?: number;
  maxSearchResults?: number;
  maxSearchSnippetChars?: number;
  defaultSearchDomainType?: TinyfishSearchDomainType;
  maxFetchCalls?: number;
  maxFetchUrls?: number;
  maxFetchTextChars?: number;
  defaultFetchTtl?: number;
  defaultFetchPerUrlTimeoutMs?: number;
  fetchRequestTimeoutMs?: number;
};

export type TinyfishDirectSearchInput = {
  query: string;
  location?: string;
  language?: string;
  recencyMinutes?: number;
  afterDate?: string;
  beforeDate?: string;
  maxSearchResults?: number;
  maxSearchSnippetChars?: number;
  defaultSearchDomainType?: TinyfishSearchDomainType;
};

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
}

/**
 * Creates TinyFish web search tool with strict validation.
 */
export function createTinyfishTools({
  maxSearchCalls = Number.POSITIVE_INFINITY,
  maxSearchResults = Number.POSITIVE_INFINITY,
  maxSearchSnippetChars = Number.POSITIVE_INFINITY,
  defaultSearchDomainType,
  maxFetchCalls = Number.POSITIVE_INFINITY,
  maxFetchUrls = 10,
  maxFetchTextChars = Number.POSITIVE_INFINITY,
  defaultFetchTtl,
  defaultFetchPerUrlTimeoutMs = DEFAULT_FETCH_PER_URL_TIMEOUT_MS,
  fetchRequestTimeoutMs = DEFAULT_FETCH_REQUEST_TIMEOUT_MS,
}: TinyfishToolsOptions = {}) {
  const apiKey = process.env.TINYFISH_API_KEY;
  if (!apiKey) {
    throw new Error("TINYFISH_API_KEY environment variable is required");
  }

  let searchCalls = 0;
  let fetchCalls = 0;
  const searchCache = new Map<string, Promise<TinyfishSearchToolResult>>();
  const fetchCache = new Map<string, Promise<TinyfishFetchToolResult>>();

  return {
    tinyfishSearch: tool({
      description: `Search the web for up-to-date information.
CRITICAL: You MUST provide a 'query' argument. NEVER call this tool with empty arguments.`,
      inputSchema: z
        .object({
          query: z
            .string()
            .min(1, "Query cannot be empty")
            .describe(
              "The search query. MANDATORY. Example: 'latest Monza football news'",
            ),
          location: z
            .string()
            .length(2)
            .optional()
            .describe(
              "Optional country code for geo-targeted results, e.g. IT.",
            ),
          language: z
            .string()
            .min(2)
            .max(5)
            .optional()
            .describe("Optional language code for results, e.g. it or en."),
          recencyMinutes: z
            .number()
            .int()
            .min(1)
            .max(MAX_RECENCY_MINUTES)
            .optional()
            .describe("Optional freshness window in minutes."),
          afterDate: dateSchema
            .optional()
            .describe("Optional lower date bound in YYYY-MM-DD format."),
          beforeDate: dateSchema
            .optional()
            .describe("Optional upper date bound in YYYY-MM-DD format."),
        })
        .refine(
          (value) =>
            value.recencyMinutes === undefined ||
            (value.afterDate === undefined && value.beforeDate === undefined),
          {
            message:
              "recencyMinutes cannot be combined with afterDate or beforeDate",
          },
        ),
      execute: async ({
        query,
        location,
        language,
        recencyMinutes,
        afterDate,
        beforeDate,
      }) => {
        const cacheKey = JSON.stringify({
          query,
          location,
          language,
          recencyMinutes,
          afterDate,
          beforeDate,
          domainType: defaultSearchDomainType,
        });
        const cachedResult = searchCache.get(cacheKey);
        if (cachedResult) {
          return cachedResult;
        }

        searchCalls += 1;
        if (searchCalls > maxSearchCalls) {
          return {
            results: [],
            error:
              "Search limit reached for this response. Use the existing search results instead.",
          };
        }

        const resultPromise = (async (): Promise<TinyfishSearchToolResult> => {
          return searchTinyfish({
            apiKey,
            query,
            location,
            language,
            recencyMinutes,
            afterDate,
            beforeDate,
            maxSearchResults,
            maxSearchSnippetChars,
            defaultSearchDomainType,
          });
        })();
        searchCache.set(cacheKey, resultPromise);
        return resultPromise;
      },
    }),
    tinyfishFetch: tool({
      description: `Fetch and extract readable page content from known URLs using TinyFish.
Use this after search when you need to read source pages. Only pass http or https URLs.`,
      inputSchema: z.object({
        urls: z
          .array(z.string().url())
          .min(1, "At least one URL is required")
          .max(10, "TinyFish fetch supports up to 10 URLs per request")
          .describe("HTTP or HTTPS URLs to fetch and extract."),
        format: z
          .enum(["markdown", "html", "json"])
          .optional()
          .default("markdown")
          .describe("Output format for extracted page content."),
        links: z
          .boolean()
          .optional()
          .describe("Include resolved page links when true."),
        imageLinks: z
          .boolean()
          .optional()
          .describe("Include resolved image links when true."),
        ttl: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            "Cache freshness tolerance in seconds. Use 0 for live fetch.",
          ),
        perUrlTimeoutMs: z
          .number()
          .int()
          .min(1)
          .max(MAX_FETCH_TIMEOUT_MS)
          .optional()
          .describe("Per-URL timeout budget in milliseconds."),
      }),
      execute: async ({
        urls,
        format = "markdown",
        links,
        imageLinks,
        ttl,
        perUrlTimeoutMs,
      }) => {
        const limitedUrls = urls.slice(0, maxFetchUrls);
        const body: Record<string, unknown> = {
          urls: limitedUrls,
          format,
        };
        if (links !== undefined) {
          body.links = links;
        }
        if (imageLinks !== undefined) {
          body.image_links = imageLinks;
        }
        if (ttl !== undefined) {
          body.ttl = ttl;
        } else if (defaultFetchTtl !== undefined) {
          body.ttl = defaultFetchTtl;
        }
        body.per_url_timeout_ms =
          perUrlTimeoutMs ?? defaultFetchPerUrlTimeoutMs;

        const cacheKey = JSON.stringify(body);
        const cachedResult = fetchCache.get(cacheKey);
        if (cachedResult) {
          return cachedResult;
        }

        fetchCalls += 1;
        if (fetchCalls > maxFetchCalls) {
          return {
            results: [],
            errors: [
              {
                error:
                  "Fetch limit reached for this response. Use the already fetched pages instead.",
              },
            ],
          };
        }

        const resultPromise = (async (): Promise<TinyfishFetchToolResult> => {
          const timeout = createTimeoutSignal(fetchRequestTimeoutMs);
          try {
            const response = await fetch(new URL(TINYFISH_FETCH_URL), {
              method: "POST",
              headers: {
                "X-API-Key": apiKey,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify(body),
              signal: timeout.signal,
            });

            if (!response.ok) {
              throw new Error(`TinyFish fetch failed with ${response.status}`);
            }

            const data = (await response.json()) as TinyfishFetchResponse;

            return {
              results: (data.results ?? []).map((result) => ({
                url: result.url ?? "",
                finalUrl: result.final_url ?? "",
                title: result.title ?? null,
                description: result.description ?? null,
                language: result.language ?? null,
                author: result.author ?? null,
                publishedDate: result.published_date ?? null,
                text:
                  typeof result.text === "string"
                    ? compactText(result.text, maxFetchTextChars)
                    : (result.text ?? ""),
                links: result.links,
                imageLinks: result.image_links,
                latencyMs: result.latency_ms ?? null,
                format: result.format ?? format,
              })),
              errors: data.errors ?? [],
            };
          } catch (error) {
            tinyfishLogger.error("fetch.failed", "TinyFish fetch error", {
              error,
            });
            return {
              results: [],
              errors: [
                {
                  error: "Failed to fetch content.",
                },
              ],
            };
          } finally {
            timeout.clear();
          }
        })();
        fetchCache.set(cacheKey, resultPromise);
        return resultPromise;
      },
    }),
  };
}

export async function searchTinyfishDirect({
  maxSearchResults = Number.POSITIVE_INFINITY,
  maxSearchSnippetChars = Number.POSITIVE_INFINITY,
  ...input
}: TinyfishDirectSearchInput): Promise<TinyfishSearchToolResult> {
  const apiKey = process.env.TINYFISH_API_KEY;
  if (!apiKey) {
    throw new Error("TINYFISH_API_KEY environment variable is required");
  }

  return searchTinyfish({
    ...input,
    apiKey,
    maxSearchResults,
    maxSearchSnippetChars,
  });
}

async function searchTinyfish({
  apiKey,
  query,
  location,
  language,
  recencyMinutes,
  afterDate,
  beforeDate,
  maxSearchResults,
  maxSearchSnippetChars,
  defaultSearchDomainType,
}: TinyfishDirectSearchInput & {
  apiKey: string;
  maxSearchResults: number;
  maxSearchSnippetChars: number;
}): Promise<TinyfishSearchToolResult> {
  const timeout = createTimeoutSignal(DEFAULT_SEARCH_TIMEOUT_MS);
  try {
    const url = new URL(TINYFISH_SEARCH_URL);
    url.searchParams.set("query", query);
    if (location) {
      url.searchParams.set("location", location);
    }
    if (language) {
      url.searchParams.set("language", language);
    }
    if (recencyMinutes !== undefined) {
      url.searchParams.set("recency_minutes", String(recencyMinutes));
    }
    if (afterDate) {
      url.searchParams.set("after_date", afterDate);
    }
    if (beforeDate) {
      url.searchParams.set("before_date", beforeDate);
    }
    if (defaultSearchDomainType) {
      url.searchParams.set("domain_type", defaultSearchDomainType);
    }

    const response = await fetch(url, {
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
      signal: timeout.signal,
    });

    if (!response.ok) {
      throw new Error(`TinyFish search failed with ${response.status}`);
    }

    const data = (await response.json()) as TinyfishSearchResponse;

    const compactResults = (data.results ?? [])
      .slice(0, maxSearchResults)
      .map((result) => ({
        title: result.title ?? "",
        url: result.url ?? "",
        content: compactText(result.snippet ?? "", maxSearchSnippetChars),
        siteName: result.site_name ?? "",
        position: result.position ?? null,
      }));

    return {
      query: data.query ?? query,
      results: compactResults,
      totalResults: data.total_results ?? 0,
      page: data.page ?? 0,
    };
  } catch (error) {
    tinyfishLogger.error("search.failed", "TinyFish search error", {
      error,
    });
    return {
      results: [],
      error: "Failed to perform search.",
    };
  } finally {
    timeout.clear();
  }
}

function compactText(value: string, maxChars: number) {
  if (!Number.isFinite(maxChars) || value.length <= maxChars) {
    return value;
  }
  return value.slice(0, Math.max(0, maxChars)).trimEnd();
}
