import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createUser, resetIntegrationDb } from "@/test/integration/factories";

const mocks = vi.hoisted(() => ({
  verifyQStashAuth: vi.fn(),
  publishToQueue: vi.fn(),
  checkRateLimit: vi.fn(),
  trackInboundUserMessageFunnelProgress: vi.fn(),
  waitUntil: vi.fn(),
}));

vi.mock("@/lib/qstash", () => ({
  publishToQueue: mocks.publishToQueue,
  verifyQStashAuth: mocks.verifyQStashAuth,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("@/lib/analytics/funnel", () => ({
  trackInboundUserMessageFunnelProgress:
    mocks.trackInboundUserMessageFunnelProgress,
}));

vi.mock("@vercel/functions", () => ({
  waitUntil: mocks.waitUntil,
}));

import { POST } from "./route";

const originalEnvironment = { ...process.env };

function restoreEnvironment() {
  process.env = { ...originalEnvironment };
}

function telegramPayload(messageId: number, text = "ciao") {
  return {
    channel: "TELEGRAM" as const,
    update: {
      update_id: 1_000 + messageId,
      message: {
        message_id: messageId,
        date: 1_700_000_000,
        text,
        from: { id: 200, is_bot: false },
        chat: { id: 100, type: "private" },
      },
    },
  };
}

function queueRequest() {
  return new Request("http://localhost/api/queues/external-inbound", {
    method: "POST",
  });
}

async function createTelegramIdentityAndThread() {
  const user = await createUser({
    clerkId: "clerk-external-inbound-worker",
  });
  await prisma.channelIdentity.create({
    data: {
      channel: "TELEGRAM",
      externalId: "200",
      userId: user.id,
    },
  });
  const thread = await prisma.conversationThread.create({
    data: {
      channel: "TELEGRAM",
      externalThreadId: "100",
      userId: user.id,
    },
  });
  return { user, thread };
}

describe("integration /api/queues/external-inbound worker", () => {
  beforeEach(async () => {
    await resetIntegrationDb();
    mocks.verifyQStashAuth.mockReset();
    mocks.publishToQueue.mockReset();
    mocks.checkRateLimit.mockReset();
    mocks.trackInboundUserMessageFunnelProgress.mockReset();
    mocks.waitUntil.mockReset();
    mocks.publishToQueue.mockResolvedValue({ messageId: "queued-1" });
    mocks.checkRateLimit.mockResolvedValue({ allowed: true });
    mocks.trackInboundUserMessageFunnelProgress.mockResolvedValue(undefined);
    mocks.waitUntil.mockImplementation(() => undefined);
    delete process.env.TELEGRAM_SYNC_WEBHOOK;
    delete process.env.OPENROUTER_API_KEY;
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    restoreEnvironment();
  });

  it("retries persisted outbound delivery through the worker without sync mode", async () => {
    const { user, thread } = await createTelegramIdentityAndThread();
    const inbound = await prisma.message.create({
      data: {
        userId: user.id,
        conversationThreadId: thread.id,
        channel: "TELEGRAM",
        direction: "INBOUND",
        role: "USER",
        type: "TEXT",
        externalMessageId: "100:7",
        externalInboundStatus: "FAILED",
        externalInboundAttempts: 1,
        parts: [{ type: "text", text: "retry me" }],
      },
    });
    await prisma.message.create({
      data: {
        userId: user.id,
        conversationThreadId: thread.id,
        channel: "TELEGRAM",
        direction: "OUTBOUND",
        role: "ASSISTANT",
        type: "TEXT",
        sourceInboundMessageId: inbound.id,
        parts: [{ type: "text", text: "saved response" }],
      },
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("provider unavailable", { status: 503 }),
      )
      .mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    const payload = telegramPayload(7);
    mocks.verifyQStashAuth.mockResolvedValue(payload);

    const first = await POST(queueRequest());
    expect(first.status).toBe(503);
    await expect(
      prisma.message.findUnique({
        where: { id: inbound.id },
        select: { externalInboundStatus: true },
      }),
    ).resolves.toEqual({ externalInboundStatus: "FAILED" });

    const second = await POST(queueRequest());
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({
      success: true,
      result: "completed",
    });
    await expect(
      prisma.message.findUnique({
        where: { id: inbound.id },
        select: { externalInboundStatus: true },
      }),
    ).resolves.toEqual({ externalInboundStatus: "COMPLETED" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(process.env.TELEGRAM_SYNC_WEBHOOK).toBeUndefined();
  });

  it("acknowledges a delivered fallback through the worker without sync mode", async () => {
    const { user, thread } = await createTelegramIdentityAndThread();
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    const payload = telegramPayload(8, "fallback me");
    mocks.verifyQStashAuth.mockResolvedValue(payload);

    const first = await POST(queueRequest());
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({
      success: true,
      result: "completed",
    });

    const inbound = await prisma.message.findUniqueOrThrow({
      where: {
        channel_externalMessageId: {
          channel: "TELEGRAM",
          externalMessageId: "100:8",
        },
      },
      select: {
        userId: true,
        externalInboundStatus: true,
      },
    });
    expect(inbound).toEqual({
      userId: user.id,
      externalInboundStatus: "COMPLETED",
    });

    const duplicate = await POST(queueRequest());
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toEqual({
      success: true,
      result: "completed",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(process.env.TELEGRAM_SYNC_WEBHOOK).toBeUndefined();
    expect(thread.channel).toBe("TELEGRAM");
  });
});
