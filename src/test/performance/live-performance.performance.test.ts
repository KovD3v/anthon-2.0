import { describe, expect, it } from "vitest";
import {
  buildGuestChatPayload,
  extractCookieHeader,
  getLivePerformanceConfig,
  measureHttpExchange,
  summarizeSamples,
} from "@/lib/performance/live-checks";

const runLivePerformance = process.env.RUN_LIVE_PERFORMANCE === "true";
const describeLive = runLivePerformance ? describe : describe.skip;

describeLive("live sitewide performance", () => {
  const config = getLivePerformanceConfig();

  it.each(config.pagePaths)(
    "keeps %s within live page performance budgets",
    async (path) => {
      const result = await measureHttpExchange(`${config.baseUrl}${path}`);
      process.stdout.write(`[performance] page ${path}: ${result.summary}\n`);

      expect(result.status, result.summary).toBeGreaterThanOrEqual(200);
      expect(result.status, result.summary).toBeLessThan(400);
      expect(result.ttfbMs, result.summary).toBeLessThanOrEqual(
        config.pageTtfbBudgetMs,
      );
      expect(result.totalMs, result.summary).toBeLessThanOrEqual(
        config.pageTotalBudgetMs,
      );
    },
    20_000,
  );

  it("keeps public page p95 latency within the sitewide budget", async () => {
    const results = await Promise.all(
      config.pagePaths.map((path) =>
        measureHttpExchange(`${config.baseUrl}${path}`),
      ),
    );
    const summary = summarizeSamples(results.map((result) => result.totalMs));
    process.stdout.write(
      `[performance] sitewide total summary: count=${summary.count} avg=${summary.avgMs}ms p95=${summary.p95Ms}ms max=${summary.maxMs}ms\n`,
    );

    expect(summary.p95Ms, JSON.stringify(results, null, 2)).toBeLessThanOrEqual(
      config.pageTotalBudgetMs,
    );
  }, 30_000);
});

describeLive("live guest chat performance", () => {
  const config = getLivePerformanceConfig();

  it.each(config.chatPrompts)(
    "measures real guest chat setup, first streamed chunk, and total response time for %#",
    async (chatPrompt) => {
      const createChat = await measureHttpExchange(
        `${config.baseUrl}/api/guest/chats`,
        {
          method: "POST",
          body: JSON.stringify({ title: "Performance check" }),
          headers: { "Content-Type": "application/json" },
        },
      );

      expect(createChat.status, createChat.summary).toBe(201);
      process.stdout.write(
        `[performance] guest chat setup: ${createChat.summary}\n`,
      );

      const chat = JSON.parse(createChat.bodyText) as { id?: string };
      const cookieHeader = extractCookieHeader(createChat.headers);
      expect(chat.id).toBeTruthy();
      expect(cookieHeader, createChat.summary).toContain("anthon_guest_token=");

      const chatResult = await measureHttpExchange(
        `${config.baseUrl}/api/guest/chat`,
        {
          method: "POST",
          body: JSON.stringify(
            buildGuestChatPayload(chat.id ?? "", chatPrompt),
          ),
          headers: {
            "Content-Type": "application/json",
            Cookie: cookieHeader,
          },
        },
      );
      process.stdout.write(
        `[performance] guest chat stream: ${chatResult.summary}\n`,
      );

      expect(chatResult.status, chatResult.summary).toBeGreaterThanOrEqual(200);
      expect(chatResult.status, chatResult.summary).toBeLessThan(300);
      expect(chatResult.ttfbMs, chatResult.summary).toBeLessThanOrEqual(
        config.chatTtfbBudgetMs,
      );
      expect(chatResult.firstChunkMs, chatResult.summary).toBeLessThanOrEqual(
        config.chatFirstChunkBudgetMs,
      );
      expect(chatResult.totalMs, chatResult.summary).toBeLessThanOrEqual(
        config.chatTotalBudgetMs,
      );
    },
    45_000,
  );
});
