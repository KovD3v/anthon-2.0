import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  waitUntil: vi.fn(),
  revalidateTag: vi.fn(),
  start: vi.fn(),
  measure: vi.fn(),
  userFindUnique: vi.fn(),
  userUpsert: vi.fn(),
  chatFindFirst: vi.fn(),
  chatUpdate: vi.fn(),
  messageCreate: vi.fn(),
  messageCount: vi.fn(),
  attachmentFindFirst: vi.fn(),
  attachmentUpdate: vi.fn(),
  checkRateLimit: vi.fn(),
  incrementUsage: vi.fn(),
  streamChat: vi.fn(),
  generateChatTitle: vi.fn(),
  extractAndSaveMemories: vi.fn(),
  trackInboundUserMessageFunnelProgress: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@vercel/functions", () => ({
  waitUntil: mocks.waitUntil,
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
}));

vi.mock("@/lib/latency-logger", () => ({
  LatencyLogger: {
    start: mocks.start,
    measure: mocks.measure,
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      upsert: mocks.userUpsert,
    },
    chat: {
      findFirst: mocks.chatFindFirst,
      update: mocks.chatUpdate,
    },
    message: {
      create: mocks.messageCreate,
      count: mocks.messageCount,
    },
    attachment: {
      findFirst: mocks.attachmentFindFirst,
      update: mocks.attachmentUpdate,
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

vi.mock("@/lib/ai/memory-extractor", () => ({
  extractAndSaveMemories: mocks.extractAndSaveMemories,
}));

vi.mock("@/lib/analytics/funnel", () => ({
  trackInboundUserMessageFunnelProgress:
    mocks.trackInboundUserMessageFunnelProgress,
}));

import { POST } from "./route";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const rateLimitAllowed = {
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
    modelTier: "BASIC",
    sources: [
      {
        type: "personal" as const,
        sourceId: "personal-subscription",
        sourceLabel: "Personal basic",
        limits: {
          maxRequestsPerDay: 10,
          maxInputTokensPerDay: 1000,
          maxOutputTokensPerDay: 1000,
          maxCostPerDay: 10,
          maxContextMessages: 20,
        },
        modelTier: "BASIC" as const,
      },
    ],
  },
};

describe("POST /api/chat", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.waitUntil.mockReset();
    mocks.revalidateTag.mockReset();
    mocks.start.mockReset();
    mocks.measure.mockReset();
    mocks.userFindUnique.mockReset();
    mocks.userUpsert.mockReset();
    mocks.chatFindFirst.mockReset();
    mocks.chatUpdate.mockReset();
    mocks.messageCreate.mockReset();
    mocks.messageCount.mockReset();
    mocks.attachmentFindFirst.mockReset();
    mocks.attachmentUpdate.mockReset();
    mocks.checkRateLimit.mockReset();
    mocks.incrementUsage.mockReset();
    mocks.streamChat.mockReset();
    mocks.generateChatTitle.mockReset();
    mocks.extractAndSaveMemories.mockReset();
    mocks.trackInboundUserMessageFunnelProgress.mockReset();

    mocks.start.mockReturnValue({
      end: vi.fn(),
      split: vi.fn(),
    });
    mocks.measure.mockImplementation(
      async (_name: string, fn: () => unknown) => await fn(),
    );

    mocks.auth.mockResolvedValue({ userId: "clerk_1" });
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      role: "USER",
      isGuest: false,
      subscription: {
        status: "ACTIVE",
        planId: "my-basic-plan",
      },
    });
    mocks.userUpsert.mockResolvedValue({
      id: "user-1",
      role: "USER",
      isGuest: false,
      subscription: {
        status: "ACTIVE",
        planId: "my-basic-plan",
      },
    });
    mocks.checkRateLimit.mockResolvedValue(rateLimitAllowed);
    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-1",
      title: "Chat",
      customTitle: true,
    });
    mocks.messageCreate.mockResolvedValue({ id: "msg-user-1" });
    mocks.messageCount.mockResolvedValue(1);
    mocks.chatUpdate.mockResolvedValue({});
    mocks.attachmentFindFirst.mockImplementation(
      async (input: { where?: { id?: string } }) => ({
        id: input.where?.id || "att-1",
        messageId: null,
        blobUrl: "https://blob.example/attachments/user-1/chat-1/file.png",
        message: null,
      }),
    );
    mocks.attachmentUpdate.mockResolvedValue({});
    mocks.incrementUsage.mockResolvedValue({});
    mocks.extractAndSaveMemories.mockResolvedValue(undefined);
    mocks.trackInboundUserMessageFunnelProgress.mockResolvedValue(undefined);
    mocks.generateChatTitle.mockResolvedValue("Generated title");
    mocks.waitUntil.mockImplementation(() => {});
    mocks.streamChat.mockResolvedValue({
      toUIMessageStreamResponse: () =>
        Response.json({ ok: true, stream: true }, { status: 200 }),
    });
  });

  it("returns 401 when Clerk auth has no userId", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await POST(
      buildRequest({
        messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
  });

  it("returns 429 when rate limit is denied", async () => {
    mocks.checkRateLimit.mockResolvedValue({
      allowed: false,
      reason: "Daily request limit reached",
      usage: {
        requestCount: 10,
        inputTokens: 100,
        outputTokens: 100,
        totalCostUsd: 1,
      },
      limits: {
        maxRequestsPerDay: 10,
        maxInputTokensPerDay: 1000,
        maxOutputTokensPerDay: 1000,
        maxCostPerDay: 10,
        maxContextMessages: 20,
      },
      upgradeInfo: {
        currentPlan: "Basic",
        suggestedPlan: "Basic Plus",
        upgradeUrl: "/pricing",
        ctaMessage: "Passa a Basic Plus",
        limitType: "requests",
        headline: "Limite richieste raggiunto",
        primaryCta: {
          label: "Passa a Basic Plus",
          url: "/pricing",
          intent: "upgrade",
        },
      },
    });

    const response = await POST(
      buildRequest({
        messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: "Rate limit exceeded",
      reason: "Daily request limit reached",
      upgradeInfo: {
        primaryCta: {
          label: "Passa a Basic Plus",
          url: "/pricing",
          intent: "upgrade",
        },
      },
    });
  });

  it("returns 400 for invalid messages input", async () => {
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

  it("returns 400 for empty text without attachments", async () => {
    const response = await POST(
      buildRequest({
        messages: [{ role: "user", parts: [{ type: "text", text: "" }] }],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Empty message");
  });

  it("persists user message, links attachments, and streams response on success", async () => {
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
    mocks.messageCreate.mockResolvedValueOnce({ id: "msg-user-123" });

    const response = await POST(
      buildRequest({
        messages: [
          { role: "assistant", parts: [{ type: "text", text: "previous" }] },
          {
            role: "user",
            parts: [
              { type: "text", text: "hello" },
              {
                type: "file",
                attachmentId: "att-1",
                mimeType: "image/png",
                name: "image.png",
                size: 42,
                data: "data:image",
              },
              {
                type: "file",
                attachmentId: "att-2",
                mimeType: "audio/mpeg",
                name: "voice.mp3",
                size: 99,
                data: "data:audio",
              },
            ],
          },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, stream: true });

    expect(mocks.messageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        chatId: "chat-1",
        role: "USER",
        direction: "INBOUND",
        content: "hello",
      }),
    });
    expect(mocks.attachmentUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "att-1" },
      data: { messageId: "msg-user-123" },
    });
    expect(mocks.attachmentUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "att-2" },
      data: { messageId: "msg-user-123" },
    });
    expect(mocks.attachmentFindFirst).toHaveBeenNthCalledWith(1, {
      where: { id: "att-1" },
      select: {
        id: true,
        messageId: true,
        blobUrl: true,
        message: {
          select: {
            userId: true,
          },
        },
      },
    });
    expect(mocks.attachmentFindFirst).toHaveBeenNthCalledWith(2, {
      where: { id: "att-2" },
      select: {
        id: true,
        messageId: true,
        blobUrl: true,
        message: {
          select: {
            userId: true,
          },
        },
      },
    });

    expect(streamArgs).toMatchObject({
      userId: "user-1",
      chatId: "chat-1",
      userMessage: "hello",
      hasImages: true,
      hasAudio: true,
      effectiveEntitlements: rateLimitAllowed.effectiveEntitlements,
      messageParts: [
        { type: "text", text: "hello" },
        expect.objectContaining({
          type: "file",
          attachmentId: "att-1",
          mimeType: "image/png",
        }),
        expect.objectContaining({
          type: "file",
          attachmentId: "att-2",
          mimeType: "audio/mpeg",
        }),
      ],
    });
    expect(mocks.trackInboundUserMessageFunnelProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        channel: "WEB",
      }),
    );
  });

  it("skips linking attachments that are not owned by the current user", async () => {
    mocks.messageCreate.mockResolvedValueOnce({ id: "msg-user-123" });
    mocks.attachmentFindFirst
      .mockResolvedValueOnce({
        id: "att-1",
        messageId: null,
        blobUrl: "https://blob.example/uploads/user-1/file-a.png",
        message: null,
      })
      .mockResolvedValueOnce({
        id: "att-2",
        messageId: "msg-other",
        blobUrl: "https://blob.example/attachments/user-2/chat-9/file-b.png",
        message: { userId: "user-2" },
      });

    const response = await POST(
      buildRequest({
        messages: [
          {
            role: "user",
            parts: [
              { type: "text", text: "hello" },
              { type: "file", attachmentId: "att-1" },
              { type: "file", attachmentId: "att-2" },
            ],
          },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.attachmentUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.attachmentUpdate).toHaveBeenCalledWith({
      where: { id: "att-1" },
      data: { messageId: "msg-user-123" },
    });
  });

  it("runs onFinish side effects for assistant message, usage, cache tags, and memories", async () => {
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
          { role: "user", parts: [{ type: "text", text: "hello world" }] },
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

    expect(onFinish).toBeTypeOf("function");
    await onFinish?.({
      text: "Assistant reply",
      metrics: {
        model: "google/gemini-2.0-flash-001",
        inputTokens: 111,
        outputTokens: 222,
        reasoningTokens: 10,
        reasoningContent: "reasoning",
        toolCalls: [{ name: "tool", args: { a: 1 } }],
        ragUsed: true,
        ragChunksCount: 3,
        costUsd: 0.123,
        generationTimeMs: 456,
        reasoningTimeMs: 78,
      },
    });

    expect(mocks.messageCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          role: "ASSISTANT",
          content: "Assistant reply",
          model: "google/gemini-2.0-flash-001",
          inputTokens: 111,
          outputTokens: 222,
          costUsd: 0.123,
        }),
      }),
    );
    expect(mocks.incrementUsage).toHaveBeenCalledWith(
      "user-1",
      111,
      222,
      0.123,
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chats-user-1", "page");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chat-chat-1", "page");
    expect(mocks.extractAndSaveMemories).toHaveBeenCalledWith(
      "user-1",
      "hello world",
      "Assistant reply",
    );
    expect(mocks.waitUntil).toHaveBeenCalledTimes(2);
  });

  it("returns 500 when downstream streaming fails", async () => {
    mocks.streamChat.mockRejectedValue(new Error("stream failure"));

    const response = await POST(
      buildRequest({
        messages: [
          { role: "user", parts: [{ type: "text", text: "hello world" }] },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });
});
