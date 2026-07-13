import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDb } from "@/test/integration/factories";

const mocks = vi.hoisted(() => ({
  trackInboundUserMessageFunnelProgress: vi.fn(),
  waitUntil: vi.fn(),
}));

vi.mock("@vercel/functions", () => ({
  waitUntil: mocks.waitUntil,
}));

vi.mock("@/lib/analytics/funnel", () => ({
  trackInboundUserMessageFunnelProgress:
    mocks.trackInboundUserMessageFunnelProgress,
}));

import { POST } from "./route";

const ENV_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "OPENROUTER_API_KEY",
  "POSTHOG_API_KEY",
  "TELEGRAM_DISABLE_AI",
  "TELEGRAM_DISABLE_SEND",
  "TELEGRAM_SYNC_WEBHOOK",
  "TELEGRAM_WEBHOOK_SECRET",
] as const;

const originalEnvironment = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

function restoreWebhookEnvironment() {
  for (const key of ENV_KEYS) {
    const originalValue = originalEnvironment[key];
    if (originalValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
  }
}

function telegramRequest(text: string, messageId = 7) {
  return new Request("http://localhost/api/webhooks/telegram", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-bot-api-secret-token": "integration-telegram-secret",
    },
    body: JSON.stringify({
      update_id: 1_001,
      message: {
        message_id: messageId,
        date: 1_784_312_000,
        text,
        from: { id: 123_456, is_bot: false },
        chat: { id: 987_654, type: "private" },
      },
    }),
  });
}

describe("integration /api/webhooks/telegram persistence", () => {
  beforeEach(async () => {
    await resetIntegrationDb();
    mocks.waitUntil.mockReset();
    mocks.trackInboundUserMessageFunnelProgress.mockReset();
    mocks.trackInboundUserMessageFunnelProgress.mockResolvedValue(undefined);
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
    process.env.TELEGRAM_WEBHOOK_SECRET = "integration-telegram-secret";
    process.env.TELEGRAM_SYNC_WEBHOOK = "true";
    process.env.TELEGRAM_DISABLE_SEND = "true";
    process.env.TELEGRAM_DISABLE_AI = "true";
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.POSTHOG_API_KEY;
  });

  afterEach(() => {
    restoreWebhookEnvironment();
  });

  it("persists one inbound message when Telegram redelivers the same update", async () => {
    const firstResponse = await POST(telegramRequest("Hello from Telegram"));
    const retryResponse = await POST(telegramRequest("Hello from Telegram"));

    expect(firstResponse.status).toBe(200);
    expect(retryResponse.status).toBe(200);

    const messages = await prisma.message.findMany({
      where: {
        channel: "TELEGRAM",
        externalMessageId: "987654:7",
      },
      select: {
        direction: true,
        role: true,
        conversationThread: {
          select: { externalThreadId: true },
        },
      },
    });

    expect(messages).toEqual([
      {
        direction: "INBOUND",
        role: "USER",
        conversationThread: { externalThreadId: "987654" },
      },
    ]);
  });

  it("keeps one durable connect claim and token across duplicate deliveries", async () => {
    const firstResponse = await POST(telegramRequest("/connect", 8));
    const retryResponse = await POST(telegramRequest("/connect", 8));

    expect(firstResponse.status).toBe(200);
    expect(retryResponse.status).toBe(200);

    const claims = await prisma.channelConnectRequest.findMany({
      where: {
        channel: "TELEGRAM",
        externalMessageId: "987654:8",
      },
      select: {
        responseKind: true,
        status: true,
        deliveryAttempts: true,
        deliveredAt: true,
      },
    });
    const tokens = await prisma.channelLinkToken.findMany({
      where: {
        channel: "TELEGRAM",
        externalId: "123456",
        chatId: "987654",
      },
      select: { id: true, tokenHash: true },
    });

    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({
      responseKind: "LINK",
      status: "SENT",
      deliveryAttempts: 1,
    });
    expect(claims[0]?.deliveredAt).toBeInstanceOf(Date);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.tokenHash).toHaveLength(64);
  });
});
