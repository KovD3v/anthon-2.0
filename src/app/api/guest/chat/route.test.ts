import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  waitUntil: vi.fn(),
  start: vi.fn(),
  measure: vi.fn(),
  authenticateGuest: vi.fn(),
  chatFindFirst: vi.fn(),
  chatUpdate: vi.fn(),
  messageCreate: vi.fn(),
  messageCount: vi.fn(),
  checkRateLimit: vi.fn(),
  incrementUsage: vi.fn(),
  streamChat: vi.fn(),
  generateChatTitle: vi.fn(),
}));

vi.mock("@vercel/functions", () => ({
  waitUntil: mocks.waitUntil,
}));

vi.mock("@/lib/latency-logger", () => ({
  LatencyLogger: {
    start: mocks.start,
    measure: mocks.measure,
  },
}));

vi.mock("@/lib/guest-auth", () => ({
  authenticateGuest: mocks.authenticateGuest,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    chat: {
      findFirst: mocks.chatFindFirst,
      update: mocks.chatUpdate,
    },
    message: {
      create: mocks.messageCreate,
      count: mocks.messageCount,
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  incrementUsage: mocks.incrementUsage,
}));

vi.mock("@/lib/ai/orchestrator", () => ({
  streamChat: mocks.streamChat,
}));

vi.mock("@/lib/ai/chat-title", () => ({
  generateChatTitle: mocks.generateChatTitle,
}));

import { POST } from "./route";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/guest/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const guestUser = {
  id: "guest-1",
  role: "USER",
  isGuest: true,
  subscription: null,
};

const allowedRateLimit = {
  allowed: true,
  usage: {
    requestCount: 1,
    inputTokens: 10,
    outputTokens: 20,
    totalCostUsd: 0.1,
  },
  limits: {
    maxRequestsPerDay: 10,
    maxInputTokensPerDay: 1000,
    maxOutputTokensPerDay: 1000,
    maxCostPerDay: 10,
    maxContextMessages: 20,
  },
  percentUsed: {
    requests: 10,
    inputTokens: 1,
    outputTokens: 2,
    cost: 1,
  },
  effectiveEntitlements: {
    limits: {
      maxRequestsPerDay: 10,
      maxInputTokensPerDay: 1000,
      maxOutputTokensPerDay: 1000,
      maxCostPerDay: 10,
      maxContextMessages: 20,
    },
    modelTier: "TRIAL",
    sources: [
      {
        type: "personal" as const,
        sourceId: "personal-subscription",
        sourceLabel: "Guest",
        limits: {
          maxRequestsPerDay: 10,
          maxInputTokensPerDay: 1000,
          maxOutputTokensPerDay: 1000,
          maxCostPerDay: 10,
          maxContextMessages: 20,
        },
        modelTier: "TRIAL" as const,
      },
    ],
  },
};

describe("POST /api/guest/chat", () => {
  beforeEach(() => {
    mocks.waitUntil.mockReset();
    mocks.start.mockReset();
    mocks.measure.mockReset();
    mocks.authenticateGuest.mockReset();
    mocks.chatFindFirst.mockReset();
    mocks.chatUpdate.mockReset();
    mocks.messageCreate.mockReset();
    mocks.messageCount.mockReset();
    mocks.checkRateLimit.mockReset();
    mocks.incrementUsage.mockReset();
    mocks.streamChat.mockReset();
    mocks.generateChatTitle.mockReset();

    mocks.start.mockReturnValue({
      end: vi.fn(),
      split: vi.fn(),
    });
    mocks.measure.mockImplementation(
      async (_name: string, fn: () => unknown) => await fn(),
    );
    mocks.waitUntil.mockImplementation(() => {});
    mocks.authenticateGuest.mockResolvedValue({
      user: guestUser,
      token: "token-1",
      isNew: false,
    });
    mocks.checkRateLimit.mockResolvedValue(allowedRateLimit);
    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-1",
      title: "Guest Chat",
      customTitle: true,
    });
    mocks.messageCreate.mockResolvedValue({ id: "msg-guest-1" });
    mocks.messageCount.mockResolvedValue(1);
    mocks.chatUpdate.mockResolvedValue({});
    mocks.incrementUsage.mockResolvedValue({});
    mocks.generateChatTitle.mockResolvedValue("Guest title");
    mocks.streamChat.mockResolvedValue({
      toUIMessageStreamResponse: () =>
        Response.json({ ok: true, stream: true }, { status: 200 }),
    });
  });

  it("returns 429 when rate limit is denied", async () => {
    mocks.checkRateLimit.mockResolvedValue({
      allowed: false,
      reason: "Daily request limit reached",
      usage: {
        requestCount: 10,
        inputTokens: 0,
        outputTokens: 0,
        totalCostUsd: 0,
      },
      limits: {
        maxRequestsPerDay: 10,
        maxInputTokensPerDay: 1000,
        maxOutputTokensPerDay: 1000,
        maxCostPerDay: 10,
        maxContextMessages: 20,
      },
      upgradeInfo: null,
    });

    const response = await POST(
      buildRequest({
        messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: "Rate limit exceeded",
      reason: "Daily request limit reached",
    });
  });

  it("returns 400 for invalid messages", async () => {
    const response = await POST(
      buildRequest({ messages: [], chatId: "chat-1" }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "messages must be a non-empty array",
    });
  });

  it("returns 400 when chatId is missing", async () => {
    const response = await POST(
      buildRequest({
        messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "chatId is required",
    });
  });

  it("returns 404 when chat ownership check fails", async () => {
    mocks.chatFindFirst.mockResolvedValue(null);
    const response = await POST(
      buildRequest({
        messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
        chatId: "chat-1",
      }),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Chat not found or access denied",
    });
  });

  it("returns 403 when guest message contains attachments", async () => {
    const response = await POST(
      buildRequest({
        messages: [
          {
            role: "user",
            parts: [
              { type: "file", name: "file.pdf", mimeType: "application/pdf" },
            ],
          },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "File uploads are not available for guest users",
      hint: "Sign up to upload files",
    });
  });

  it("returns 400 for empty text-only payload", async () => {
    const response = await POST(
      buildRequest({
        messages: [{ role: "user", parts: [{ type: "text", text: "   " }] }],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Empty message");
  });

  it("saves inbound guest message and calls streamChat with guest flags", async () => {
    let streamArgs: Record<string, unknown> | undefined;
    mocks.streamChat.mockImplementation(
      async (args: Record<string, unknown>) => {
        streamArgs = args;
        return {
          toUIMessageStreamResponse: () =>
            Response.json({ ok: true, stream: true }, { status: 200 }),
        };
      },
    );

    const response = await POST(
      buildRequest({
        messages: [
          { role: "user", parts: [{ type: "text", text: "hello guest" }] },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, stream: true });
    expect(mocks.messageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "guest-1",
        chatId: "chat-1",
        role: "USER",
        direction: "INBOUND",
        content: "hello guest",
      }),
    });
    expect(streamArgs).toMatchObject({
      userId: "guest-1",
      chatId: "chat-1",
      userMessage: "hello guest",
      planId: null,
      userRole: "USER",
      subscriptionStatus: undefined,
      isGuest: true,
      hasImages: false,
      hasAudio: false,
      effectiveEntitlements: allowedRateLimit.effectiveEntitlements,
    });
  });

  it("runs onFinish side effects and does not schedule memory extraction", async () => {
    let streamArgs: Record<string, unknown> | undefined;
    mocks.streamChat.mockImplementation(
      async (args: Record<string, unknown>) => {
        streamArgs = args;
        return {
          toUIMessageStreamResponse: () =>
            Response.json({ ok: true, stream: true }, { status: 200 }),
        };
      },
    );
    mocks.messageCreate.mockResolvedValueOnce({ id: "msg-user-1" });
    mocks.messageCreate.mockResolvedValueOnce({ id: "msg-assistant-1" });

    const response = await POST(
      buildRequest({
        messages: [
          { role: "user", parts: [{ type: "text", text: "hello guest" }] },
        ],
        chatId: "chat-1",
      }),
    );
    expect(response.status).toBe(200);

    const onFinish = streamArgs?.onFinish as
      | ((input: {
          text: string;
          metrics: {
            model: string;
            inputTokens: number;
            outputTokens: number;
            reasoningTokens: number;
            reasoningContent: string;
            toolCalls: unknown[];
            ragUsed: boolean;
            ragChunksCount: number;
            costUsd: number;
            generationTimeMs: number;
            reasoningTimeMs: number;
          };
        }) => Promise<void>)
      | undefined;

    await onFinish?.({
      text: "Guest assistant reply",
      metrics: {
        model: "google/gemini-2.0-flash-lite-001",
        inputTokens: 12,
        outputTokens: 34,
        reasoningTokens: 0,
        reasoningContent: "",
        toolCalls: [],
        ragUsed: false,
        ragChunksCount: 0,
        costUsd: 0.01,
        generationTimeMs: 100,
        reasoningTimeMs: 0,
      },
    });

    expect(mocks.messageCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          role: "ASSISTANT",
          content: "Guest assistant reply",
          userId: "guest-1",
        }),
      }),
    );
    expect(mocks.chatUpdate).toHaveBeenCalledWith({
      where: { id: "chat-1" },
      data: { updatedAt: expect.any(Date) },
    });
    expect(mocks.incrementUsage).toHaveBeenCalledWith("guest-1", 12, 34, 0.01);
    expect(mocks.waitUntil).not.toHaveBeenCalled();
  });

  it("returns 500 when guest authentication throws", async () => {
    mocks.authenticateGuest.mockRejectedValue(new Error("guest auth failed"));

    const response = await POST(
      buildRequest({
        messages: [{ role: "user", parts: [{ type: "text", text: "hello" }] }],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });
});
