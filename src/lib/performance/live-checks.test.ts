import { describe, expect, it } from "vitest";
import {
  buildGuestChatPayload,
  extractCookieHeader,
  getLivePerformanceConfig,
  summarizeSamples,
} from "./live-checks";

describe("live performance check helpers", () => {
  it("normalizes the base URL, routes, and budgets from environment values", () => {
    const config = getLivePerformanceConfig({
      PERFORMANCE_BASE_URL: "http://localhost:3000/",
      PERFORMANCE_SITE_PATHS: "/,/pricing,/help",
      PERFORMANCE_PAGE_TTFB_BUDGET_MS: "900",
      PERFORMANCE_PAGE_TOTAL_BUDGET_MS: "2500",
      PERFORMANCE_CHAT_TTFB_BUDGET_MS: "3500",
      PERFORMANCE_CHAT_FIRST_CHUNK_BUDGET_MS: "5500",
      PERFORMANCE_CHAT_TOTAL_BUDGET_MS: "20000",
      PERFORMANCE_CHAT_PROMPTS: "uno|due|tre",
    });

    expect(config).toEqual({
      baseUrl: "http://localhost:3000",
      pagePaths: ["/", "/pricing", "/help"],
      pageTtfbBudgetMs: 900,
      pageTotalBudgetMs: 2500,
      chatTtfbBudgetMs: 3500,
      chatFirstChunkBudgetMs: 5500,
      chatTotalBudgetMs: 20000,
      chatPrompts: ["uno", "due", "tre"],
    });
  });

  it("keeps safe defaults for local sitewide and chat performance checks", () => {
    const config = getLivePerformanceConfig({});

    expect(config.baseUrl).toBe("http://localhost:3000");
    expect(config.pagePaths).toEqual(["/", "/pricing", "/help", "/channels"]);
    expect(config.pageTtfbBudgetMs).toBe(1000);
    expect(config.pageTotalBudgetMs).toBe(3000);
    expect(config.chatTtfbBudgetMs).toBe(5000);
    expect(config.chatFirstChunkBudgetMs).toBe(8000);
    expect(config.chatTotalBudgetMs).toBe(30000);
    expect(config.chatPrompts).toEqual([
      "Rispondi in una frase: dimmi un consiglio pratico pre-allenamento.",
      "Ho saltato tre allenamenti e mi sento in colpa: cosa faccio oggi?",
      "Sono un coach: dammi una micro-routine di 20 minuti per una squadra scarica.",
    ]);
  });

  it("builds a valid guest chat payload for live streaming checks", () => {
    expect(buildGuestChatPayload("chat_123", "ciao")).toEqual({
      chatId: "chat_123",
      messages: [
        {
          id: "perf-user-message",
          role: "user",
          parts: [{ type: "text", text: "ciao" }],
        },
      ],
    });
  });

  it("summarizes latency samples with average, max, and p95", () => {
    expect(summarizeSamples([100, 200, 300, 400, 500])).toEqual({
      count: 5,
      avgMs: 300,
      maxMs: 500,
      p95Ms: 500,
    });
  });

  it("extracts a reusable Cookie header from set-cookie response headers", () => {
    expect(
      extractCookieHeader({
        "set-cookie":
          "anthon_guest_token=abc123; Path=/; HttpOnly; SameSite=Lax, another=value; Path=/",
      }),
    ).toBe("anthon_guest_token=abc123; another=value");
  });
});
