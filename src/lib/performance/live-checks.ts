export interface LivePerformanceConfig {
  baseUrl: string;
  pagePaths: string[];
  pageTtfbBudgetMs: number;
  pageTotalBudgetMs: number;
  chatTtfbBudgetMs: number;
  chatFirstChunkBudgetMs: number;
  chatTotalBudgetMs: number;
  chatPrompts: string[];
}

export interface PerformanceSummary {
  count: number;
  avgMs: number;
  maxMs: number;
  p95Ms: number;
}

export interface HttpExchangeTiming {
  url: string;
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  ttfbMs: number;
  firstChunkMs: number;
  totalMs: number;
  bodyBytes: number;
  bodyText: string;
  summary: string;
}

type Environment = Record<string, string | undefined>;

const defaultConfig: LivePerformanceConfig = {
  baseUrl: "http://localhost:3000",
  pagePaths: ["/", "/pricing", "/help", "/channels"],
  pageTtfbBudgetMs: 1000,
  pageTotalBudgetMs: 3000,
  chatTtfbBudgetMs: 5000,
  chatFirstChunkBudgetMs: 8000,
  chatTotalBudgetMs: 30000,
  chatPrompts: [
    "Rispondi in una frase: dimmi un consiglio pratico pre-allenamento.",
    "Ho saltato tre allenamenti e mi sento in colpa: cosa faccio oggi?",
    "Sono un coach: dammi una micro-routine di 20 minuti per una squadra scarica.",
  ],
};

export function getLivePerformanceConfig(
  env: Environment = process.env,
): LivePerformanceConfig {
  return {
    baseUrl: normalizeBaseUrl(env.PERFORMANCE_BASE_URL),
    pagePaths: parsePagePaths(env.PERFORMANCE_SITE_PATHS),
    pageTtfbBudgetMs: parsePositiveInteger(
      env.PERFORMANCE_PAGE_TTFB_BUDGET_MS,
      defaultConfig.pageTtfbBudgetMs,
    ),
    pageTotalBudgetMs: parsePositiveInteger(
      env.PERFORMANCE_PAGE_TOTAL_BUDGET_MS,
      defaultConfig.pageTotalBudgetMs,
    ),
    chatTtfbBudgetMs: parsePositiveInteger(
      env.PERFORMANCE_CHAT_TTFB_BUDGET_MS,
      defaultConfig.chatTtfbBudgetMs,
    ),
    chatFirstChunkBudgetMs: parsePositiveInteger(
      env.PERFORMANCE_CHAT_FIRST_CHUNK_BUDGET_MS,
      defaultConfig.chatFirstChunkBudgetMs,
    ),
    chatTotalBudgetMs: parsePositiveInteger(
      env.PERFORMANCE_CHAT_TOTAL_BUDGET_MS,
      defaultConfig.chatTotalBudgetMs,
    ),
    chatPrompts: parseChatPrompts(env),
  };
}

export function buildGuestChatPayload(chatId: string, prompt: string) {
  return {
    chatId,
    messages: [
      {
        id: "perf-user-message",
        role: "user",
        parts: [{ type: "text", text: prompt }],
      },
    ],
  };
}

export function summarizeSamples(samples: number[]): PerformanceSummary {
  if (samples.length === 0) {
    return { count: 0, avgMs: 0, maxMs: 0, p95Ms: 0 };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const p95Index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * 0.95) - 1,
  );

  return {
    count: sorted.length,
    avgMs: roundMs(total / sorted.length),
    maxMs: roundMs(sorted.at(-1) ?? 0),
    p95Ms: roundMs(sorted[p95Index] ?? 0),
  };
}

export async function measureHttpExchange(
  input: string | URL,
  init?: RequestInit,
): Promise<HttpExchangeTiming> {
  const url = input.toString();
  const start = performance.now();
  const response = await fetch(input, init);
  const ttfbMs = roundMs(performance.now() - start);
  const headers = collectHeaders(response.headers);

  let firstChunkMs = ttfbMs;
  let sawFirstChunk = false;
  let bodyText = "";

  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (!sawFirstChunk) {
        firstChunkMs = roundMs(performance.now() - start);
        sawFirstChunk = true;
      }

      bodyText += decoder.decode(value, { stream: true });
    }

    bodyText += decoder.decode();
  } else {
    bodyText = await response.text();
    firstChunkMs = roundMs(performance.now() - start);
  }

  const totalMs = roundMs(performance.now() - start);
  const bodyBytes = new TextEncoder().encode(bodyText).byteLength;

  return {
    url,
    status: response.status,
    ok: response.ok,
    headers,
    ttfbMs,
    firstChunkMs,
    totalMs,
    bodyBytes,
    bodyText,
    summary: `${url} status=${response.status} ttfb=${ttfbMs}ms firstChunk=${firstChunkMs}ms total=${totalMs}ms bytes=${bodyBytes}`,
  };
}

export function extractCookieHeader(
  headers: Record<string, string | string[] | undefined>,
) {
  const rawSetCookie = headers["set-cookie"] ?? headers["Set-Cookie"];
  const values = Array.isArray(rawSetCookie)
    ? rawSetCookie
    : splitCombinedSetCookie(rawSetCookie ?? "");

  return values
    .map((value) => value.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

function normalizeBaseUrl(value: string | undefined) {
  const baseUrl = value?.trim() || defaultConfig.baseUrl;
  return baseUrl.replace(/\/+$/, "");
}

function parsePagePaths(value: string | undefined) {
  const paths = value
    ?.split(",")
    .map((path) => path.trim())
    .filter(Boolean);

  if (!paths || paths.length === 0) {
    return defaultConfig.pagePaths;
  }

  return paths.map((path) => (path.startsWith("/") ? path : `/${path}`));
}

function parseChatPrompts(env: Environment) {
  const prompts = env.PERFORMANCE_CHAT_PROMPTS?.split("|")
    .map((prompt) => prompt.trim())
    .filter(Boolean);

  if (prompts && prompts.length > 0) {
    return prompts;
  }

  const singlePrompt = env.PERFORMANCE_CHAT_PROMPT?.trim();
  return singlePrompt ? [singlePrompt] : defaultConfig.chatPrompts;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function roundMs(value: number) {
  return Number(value.toFixed(1));
}

function collectHeaders(headers: Headers) {
  const result = Object.fromEntries(headers.entries());
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie;
  const setCookieValues = getSetCookie?.call(headers);

  if (setCookieValues && setCookieValues.length > 0) {
    result["set-cookie"] = setCookieValues.join(", ");
  }

  return result;
}

function splitCombinedSetCookie(value: string) {
  if (!value.trim()) return [];
  return value.split(/,(?=\s*[^;,=\s]+=[^;,\s]*)/);
}
