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
  attachmentCreate: vi.fn(),
  attachmentUpdate: vi.fn(),
  checkRateLimit: vi.fn(),
  incrementUsage: vi.fn(),
  streamChat: vi.fn(),
  generateChatTitle: vi.fn(),
  extractAndSaveMemories: vi.fn(),
  trackInboundUserMessageFunnelProgress: vi.fn(),
  isBillingSyncStale: vi.fn(),
  syncPersonalSubscriptionFromClerk: vi.fn(),
  decideWebVoiceMode: vi.fn(),
  generateVoice: vi.fn(),
  trackVoiceUsage: vi.fn(),
  put: vi.fn(),
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
      create: mocks.attachmentCreate,
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

vi.mock("@/lib/billing/personal-subscription", () => ({
  isBillingSyncStale: mocks.isBillingSyncStale,
  syncPersonalSubscriptionFromClerk: mocks.syncPersonalSubscriptionFromClerk,
}));

vi.mock("@/lib/voice/preflight", () => ({
  decideWebVoiceMode: mocks.decideWebVoiceMode,
}));

vi.mock("@/lib/voice", () => ({
  generateVoice: mocks.generateVoice,
  trackVoiceUsage: mocks.trackVoiceUsage,
}));

vi.mock("@vercel/blob", () => ({
  put: mocks.put,
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
    mocks.attachmentCreate.mockReset();
    mocks.attachmentUpdate.mockReset();
    mocks.checkRateLimit.mockReset();
    mocks.incrementUsage.mockReset();
    mocks.streamChat.mockReset();
    mocks.generateChatTitle.mockReset();
    mocks.extractAndSaveMemories.mockReset();
    mocks.trackInboundUserMessageFunnelProgress.mockReset();
    mocks.isBillingSyncStale.mockReset();
    mocks.syncPersonalSubscriptionFromClerk.mockReset();
    mocks.decideWebVoiceMode.mockReset();
    mocks.generateVoice.mockReset();
    mocks.trackVoiceUsage.mockReset();
    mocks.put.mockReset();

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
      billingSyncedAt: new Date("2026-02-18T10:00:00.000Z"),
      subscription: {
        status: "ACTIVE",
        planId: "my-basic-plan",
      },
      preferences: {
        voiceEnabled: true,
      },
    });
    mocks.userUpsert.mockResolvedValue({
      id: "user-1",
      role: "USER",
      isGuest: false,
      billingSyncedAt: new Date("2026-02-18T10:00:00.000Z"),
      subscription: {
        status: "ACTIVE",
        planId: "my-basic-plan",
      },
      preferences: {
        voiceEnabled: true,
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
    mocks.attachmentCreate.mockResolvedValue({ id: "att-voice-1" });
    mocks.incrementUsage.mockResolvedValue({});
    mocks.extractAndSaveMemories.mockResolvedValue(undefined);
    mocks.trackInboundUserMessageFunnelProgress.mockResolvedValue(undefined);
    mocks.syncPersonalSubscriptionFromClerk.mockResolvedValue(null);
    mocks.isBillingSyncStale.mockImplementation(
      (billingSyncedAt?: Date | null) =>
        !billingSyncedAt ||
        Date.now() - billingSyncedAt.getTime() > 5 * 60 * 1000,
    );
    mocks.generateChatTitle.mockResolvedValue("Generated title");
    mocks.waitUntil.mockImplementation(() => {});
    mocks.decideWebVoiceMode.mockResolvedValue({
      mode: "TEXT",
      reason: "default",
      source: "classifier",
    });
    mocks.generateVoice.mockResolvedValue({
      audioBuffer: Buffer.from("audio"),
      characterCount: 20,
    });
    mocks.put.mockResolvedValue({
      url: "https://blob.example/voice/msg-assistant-1.mp3",
    });
    mocks.trackVoiceUsage.mockResolvedValue(undefined);
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
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed message objects before side effects", async () => {
    const response = await POST(
      buildRequest({ messages: [null], chatId: "chat-1" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "messages must be a non-empty array",
    });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed message parts before side effects", async () => {
    const response = await POST(
      buildRequest({
        messages: [{ role: "user", parts: { type: "text", text: "hello" } }],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "messages must be a non-empty array",
    });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed json", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: "{ bad",
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid JSON body",
    });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.streamChat).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
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
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
  });

  it("returns 404 when chat ownership check fails", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      role: "USER",
      isGuest: false,
      billingSyncedAt: new Date(Date.now() - 6 * 60 * 1000),
      subscription: {
        status: "TRIAL",
        planId: "my-basic-plan",
      },
      preferences: {
        voiceEnabled: true,
      },
    });
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
    expect(mocks.syncPersonalSubscriptionFromClerk).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
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
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for whitespace-only text without attachments", async () => {
    const response = await POST(
      buildRequest({
        messages: [{ role: "user", parts: [{ type: "text", text: "   " }] }],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("Empty message");
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when no user message is provided before side effects", async () => {
    const response = await POST(
      buildRequest({
        messages: [
          {
            role: "assistant",
            parts: [{ type: "text", text: "assistant only" }],
          },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("No user message provided");
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
  });

  it("skips Clerk sync when trial subscription was synced recently", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      role: "USER",
      isGuest: false,
      billingSyncedAt: new Date(),
      subscription: {
        status: "TRIAL",
        planId: "my-basic-plan",
      },
    });

    const response = await POST(
      buildRequest({
        messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.syncPersonalSubscriptionFromClerk).not.toHaveBeenCalled();
  });

  it("syncs stale trial subscription before rate-limit check", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      role: "USER",
      isGuest: false,
      billingSyncedAt: new Date(Date.now() - 6 * 60 * 1000),
      subscription: {
        status: "TRIAL",
        planId: "my-basic-plan",
      },
    });
    mocks.syncPersonalSubscriptionFromClerk.mockResolvedValue({
      status: "ACTIVE",
      planId: "my-pro-plan",
    });

    const response = await POST(
      buildRequest({
        messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.syncPersonalSubscriptionFromClerk).toHaveBeenCalledWith({
      userId: "user-1",
      clerkUserId: "clerk_1",
      current: {
        status: "TRIAL",
        planId: "my-basic-plan",
      },
    });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      "user-1",
      "ACTIVE",
      "USER",
      "my-pro-plan",
      false,
    );
  });

  it("keeps chat flow working when stale sync returns null", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      role: "USER",
      isGuest: false,
      billingSyncedAt: new Date(Date.now() - 6 * 60 * 1000),
      subscription: {
        status: "TRIAL",
        planId: null,
      },
    });
    mocks.syncPersonalSubscriptionFromClerk.mockResolvedValue(null);

    const response = await POST(
      buildRequest({
        messages: [{ role: "user", parts: [{ type: "text", text: "hi" }] }],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.syncPersonalSubscriptionFromClerk).toHaveBeenCalledTimes(1);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      "user-1",
      "TRIAL",
      "USER",
      null,
      false,
    );
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
    expect(mocks.decideWebVoiceMode).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        userMessage: "hello",
        userPreferences: { voiceEnabled: true },
        planId: "my-basic-plan",
      }),
    );
  });

  it("generates a voice-first assistant response when preflight chooses voice", async () => {
    mocks.decideWebVoiceMode.mockResolvedValue({
      mode: "VOICE",
      reason: "User explicitly requested voice",
      source: "deterministic",
    });
    mocks.streamChat.mockImplementation(async ({ onFinish }) => {
      await onFinish?.({
        text: "Respira. Spalle morbide. Ora scegli una sola azione semplice.",
        metrics: {
          model: "qwen/qwen3.5-flash-02-23",
          inputTokens: 11,
          outputTokens: 22,
          reasoningTokens: 0,
          reasoningContent: "",
          toolCalls: [],
          ragUsed: false,
          ragChunksCount: 0,
          costUsd: 0.01,
          generationTimeMs: 250,
          reasoningTimeMs: 0,
        },
      });

      return {
        textStream: (async function* () {
          yield "Respira. Spalle morbide. Ora scegli una sola azione semplice.";
        })(),
      };
    });
    mocks.messageCreate
      .mockResolvedValueOnce({ id: "msg-user-1" })
      .mockResolvedValueOnce({ id: "msg-assistant-1" });

    const response = await POST(
      buildRequest({
        messages: [
          {
            role: "user",
            parts: [{ type: "text", text: "Mandami un vocale rapido" }],
          },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        responseMode: "voice",
        voiceEnabled: true,
      }),
    );
    expect(mocks.generateVoice).toHaveBeenCalledWith(
      "Respira. Spalle morbide. Ora scegli una sola azione semplice.",
    );
    expect(mocks.put).toHaveBeenCalledWith(
      expect.stringMatching(/^voice\/.+\.mp3$/),
      Buffer.from("audio"),
      expect.objectContaining({ contentType: "audio/mpeg" }),
    );
    expect(mocks.trackVoiceUsage).toHaveBeenCalledWith("user-1", 20, "WEB");
  });

  it("does not persist a duplicate text fallback when voice side effects fail after audio persistence", async () => {
    mocks.decideWebVoiceMode.mockResolvedValue({
      mode: "VOICE",
      reason: "User explicitly requested voice",
      source: "deterministic",
    });
    mocks.streamChat.mockImplementation(async ({ onFinish }) => {
      await onFinish?.({
        text: "Respira. Spalle morbide.",
        metrics: {
          model: "qwen/qwen3.5-flash-02-23",
          inputTokens: 11,
          outputTokens: 22,
          reasoningTokens: 0,
          reasoningContent: "",
          toolCalls: [],
          ragUsed: false,
          ragChunksCount: 0,
          costUsd: 0.01,
          generationTimeMs: 250,
          reasoningTimeMs: 0,
        },
      });

      return {
        textStream: (async function* () {
          yield "Respira. Spalle morbide.";
        })(),
      };
    });
    mocks.messageCreate
      .mockResolvedValueOnce({ id: "msg-user-1" })
      .mockResolvedValueOnce({ id: "msg-assistant-1" })
      .mockResolvedValueOnce({ id: "msg-fallback-1" });
    mocks.trackVoiceUsage.mockRejectedValue(new Error("usage write failed"));

    const response = await POST(
      buildRequest({
        messages: [
          {
            role: "user",
            parts: [{ type: "text", text: "Mandami un vocale rapido" }],
          },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.messageCreate).toHaveBeenCalledTimes(2);
    expect(mocks.messageCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "AUDIO",
          mediaUrl: "https://blob.example/voice/msg-assistant-1.mp3",
          metadata: expect.objectContaining({
            responseMode: "voice",
          }),
        }),
      }),
    );
  });

  it("normalizes audio data-url fields into base64 data for the AI flow", async () => {
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
          {
            role: "user",
            parts: [
              {
                type: "file",
                attachmentId: "att-voice",
                mimeType: "audio/wav",
                name: "voice.wav",
                size: 99,
                url: "data:audio/wav;base64,dm9pY2UtYmFzZTY0",
              },
            ],
          },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(streamArgs).toMatchObject({
      hasAudio: true,
      messageParts: [
        expect.objectContaining({
          type: "file",
          attachmentId: "att-voice",
          data: "dm9pY2UtYmFzZTY0",
          mimeType: "audio/wav",
        }),
      ],
    });
  });

  it("returns 400 for unsupported non-image file urls before side effects", async () => {
    const response = await POST(
      buildRequest({
        messages: [
          {
            role: "user",
            parts: [
              { type: "text", text: "trascrivi questo" },
              {
                type: "file",
                attachmentId: "att-voice",
                mimeType: "audio/wav",
                name: "voice.wav",
                size: 99,
                url: "https://blob.example/voice.wav",
              },
            ],
          },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Unsupported file payload",
    });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
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
        model: "google/gemini-2.5-flash",
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
          model: "google/gemini-2.5-flash",
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
      10,
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
