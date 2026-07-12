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
  transaction: vi.fn(),
  messageCreate: vi.fn(),
  messageMetricsCreate: vi.fn(),
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
  getVoiceUnavailability: vi.fn(),
  transcribeAudio: vi.fn(),
  generateVoice: vi.fn(),
  trackVoiceUsage: vi.fn(),
  put: vi.fn(),
  ensureConversationThread: vi.fn(),
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
    $transaction: mocks.transaction,
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
    messageMetrics: {
      create: mocks.messageMetricsCreate,
    },
    attachment: {
      findFirst: mocks.attachmentFindFirst,
      create: mocks.attachmentCreate,
      update: mocks.attachmentUpdate,
    },
  },
}));

vi.mock("@/lib/conversations/threads", () => ({
  ensureConversationThread: mocks.ensureConversationThread,
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

vi.mock("@/lib/transcription", () => ({
  transcribeAudio: mocks.transcribeAudio,
}));

vi.mock("@/lib/voice", () => ({
  decideWebVoiceMode: mocks.decideWebVoiceMode,
  generateVoice: mocks.generateVoice,
  getVoiceUnavailability: mocks.getVoiceUnavailability,
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
    mocks.transaction.mockReset();
    mocks.messageCreate.mockReset();
    mocks.messageMetricsCreate.mockReset();
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
    mocks.getVoiceUnavailability.mockReset();
    mocks.transcribeAudio.mockReset();
    mocks.generateVoice.mockReset();
    mocks.trackVoiceUsage.mockReset();
    mocks.put.mockReset();
    mocks.ensureConversationThread.mockReset();

    mocks.start.mockReturnValue({
      end: vi.fn(),
      split: vi.fn(),
    });
    mocks.measure.mockImplementation(
      async (_name: string, fn: () => unknown) => await fn(),
    );
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        message: {
          create: mocks.messageCreate,
          count: mocks.messageCount,
        },
        messageMetrics: {
          create: mocks.messageMetricsCreate,
        },
      }),
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
    mocks.ensureConversationThread.mockResolvedValue({ id: "thread-1" });
    mocks.messageCreate.mockResolvedValue({ id: "msg-user-1" });
    mocks.messageMetricsCreate.mockResolvedValue({ id: "metrics-1" });
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
    mocks.getVoiceUnavailability.mockImplementation((code: string) => ({
      code,
      userMessage:
        code === "PROVIDER_UNAVAILABLE"
          ? "Voice is temporarily unavailable, so I'm replying in text."
          : `Voice unavailable: ${code}`,
    }));
    mocks.transcribeAudio.mockResolvedValue({
      text: "trascrizione del vocale",
      provider: "openrouter-gemini",
      modelId: "google/gemini-2.5-flash-lite",
    });
    mocks.generateVoice.mockResolvedValue({
      audioBuffer: Buffer.from("audio"),
      characterCount: 20,
      costUsd: 0.001,
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
      userMessage:
        "hello\n\nTrascrizione del messaggio vocale allegato:\ntrascrizione del vocale",
      hasImages: true,
      hasAudio: false,
      effectiveEntitlements: rateLimitAllowed.effectiveEntitlements,
      messageParts: [
        { type: "text", text: "hello" },
        expect.objectContaining({
          type: "file",
          attachmentId: "att-1",
          mimeType: "image/png",
        }),
        expect.objectContaining({
          type: "text",
          text: "Trascrizione del messaggio vocale allegato:\ntrascrizione del vocale",
        }),
      ],
    });
    expect(mocks.transcribeAudio).toHaveBeenCalledWith({
      base64: "data:audio",
      mimeType: "audio/mpeg",
      title: "Web Chat",
      userId: "user-1",
      source: "WEB",
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
        userMessage:
          "hello\n\nTrascrizione del messaggio vocale allegato:\ntrascrizione del vocale",
        userPreferences: { voiceEnabled: true },
        planId: "my-basic-plan",
      }),
    );
  });

  it("passes first-message history skip to the AI flow", async () => {
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
          {
            role: "user",
            parts: [{ type: "text", text: "first prompt" }],
          },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(streamArgs).toMatchObject({
      userId: "user-1",
      chatId: "chat-1",
      userMessage: "first prompt",
      skipConversationHistory: true,
    });
  });

  it("passes image blob urls to the AI flow as image file parts", async () => {
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
          {
            role: "user",
            parts: [
              { type: "text", text: "che vedi?" },
              {
                type: "file",
                attachmentId: "att-image-url",
                mimeType: "image/png",
                name: "photo.png",
                size: 1234,
                url: "https://blob.example/uploads/user-1/chat-1/photo.png",
              },
            ],
          },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(streamArgs).toMatchObject({
      userMessage: "che vedi?",
      hasImages: true,
      hasAudio: false,
      messageParts: [
        { type: "text", text: "che vedi?" },
        {
          type: "file",
          data: "https://blob.example/uploads/user-1/chat-1/photo.png",
          mimeType: "image/png",
          name: "photo.png",
          size: 1234,
          attachmentId: "att-image-url",
        },
      ],
    });
  });

  it("keeps image data urls supported as file payloads", async () => {
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
          {
            role: "user",
            parts: [
              {
                type: "file",
                attachmentId: "att-image-data-url",
                mimeType: "image/jpeg",
                name: "camera.jpg",
                size: 4321,
                url: "data:image/jpeg;base64,aW1hZ2UtYmFzZTY0",
              },
            ],
          },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.streamChat).toHaveBeenCalledTimes(1);
    expect(streamArgs).toMatchObject({
      userMessage: "",
      hasImages: true,
      messageParts: [
        expect.objectContaining({
          type: "file",
          data: "data:image/jpeg;base64,aW1hZ2UtYmFzZTY0",
          mimeType: "image/jpeg",
        }),
      ],
    });
  });

  it("uses request messages for title refresh without a blocking message count", async () => {
    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-1",
      title: "Nuova Chat",
      customTitle: false,
    });

    const response = await POST(
      buildRequest({
        messages: [
          {
            role: "user",
            parts: [{ type: "text", text: "first prompt" }],
          },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.messageCount).not.toHaveBeenCalled();
    expect(mocks.waitUntil).toHaveBeenCalledTimes(2);
    expect(mocks.generateChatTitle).toHaveBeenCalledWith("USER: first prompt", {
      userId: "user-1",
    });
  });

  it("keeps the response successful when title generation fails in waitUntil", async () => {
    const scheduled: Promise<unknown>[] = [];
    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-1",
      title: "Nuova Chat",
      customTitle: false,
    });
    mocks.generateChatTitle.mockRejectedValue(new Error("title service down"));
    mocks.waitUntil.mockImplementation((promise: Promise<unknown>) => {
      scheduled.push(promise.catch((error) => error));
    });

    const response = await POST(
      buildRequest({
        messages: [
          {
            role: "user",
            parts: [{ type: "text", text: "first prompt" }],
          },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, stream: true });
    expect(mocks.generateChatTitle).toHaveBeenCalledWith("USER: first prompt", {
      userId: "user-1",
    });
    expect(scheduled).toHaveLength(2);
    await expect(scheduled[1]).resolves.toEqual(expect.any(Error));
    expect(mocks.chatUpdate).not.toHaveBeenCalledWith({
      where: { id: "chat-1" },
      data: { title: expect.any(String) },
    });
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
    expect(mocks.trackVoiceUsage).toHaveBeenCalledWith(
      "user-1",
      20,
      "WEB",
      0.001,
    );
    expect(mocks.decideWebVoiceMode).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        hasAttachments: false,
      }),
    );
  });

  it("passes the exact fallback reason only for a blocked explicit voice request", async () => {
    mocks.decideWebVoiceMode.mockResolvedValue({
      mode: "TEXT",
      reason: "Voice provider capacity is unavailable",
      source: "deterministic",
      category: "VOICE_REQUIRED",
      capacityState: "RED",
      reasonCode: "PROVIDER_RED",
    });

    const response = await POST(
      buildRequest({
        messages: [
          {
            role: "user",
            parts: [{ type: "text", text: "Mandami un vocale" }],
          },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        responseMode: "text",
        voiceEnabled: false,
        voiceUnavailableReason:
          "Voice is temporarily unavailable, so I'm replying in text.",
      }),
    );
  });

  it("does not explain voice policy for an ordinary text-suitable response", async () => {
    mocks.decideWebVoiceMode.mockResolvedValue({
      mode: "TEXT",
      reason: "Text is the better delivery format",
      source: "classifier",
      category: "TEXT_PREFERRED",
      capacityState: "GREEN",
      reasonCode: "TEXT_PREFERRED",
      suitabilityReason: "short_factual",
      suitabilityConfidence: 0.92,
    });
    mocks.streamChat.mockImplementation(async ({ onFinish }) => {
      await onFinish?.({
        text: "Sono le dieci.",
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
        toUIMessageStreamResponse: () =>
          Response.json({ ok: true, stream: true }, { status: 200 }),
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
            parts: [{ type: "text", text: "Che ore sono?" }],
          },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    const streamArgs = mocks.streamChat.mock.calls[0]?.[0] as {
      voiceEnabled?: boolean;
      voiceUnavailableReason?: string;
    };
    expect(streamArgs.voiceEnabled).toBeUndefined();
    expect(streamArgs.voiceUnavailableReason).toBeUndefined();
    expect(mocks.messageCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            voice: {
              mode: "TEXT",
              reason: "Text is the better delivery format",
              reasonCode: "TEXT_PREFERRED",
              category: "TEXT_PREFERRED",
              capacityState: "GREEN",
              source: "classifier",
              suitabilityReason: "short_factual",
              suitabilityConfidence: 0.92,
            },
          }),
        }),
      }),
    );
  });

  it("keeps attachments as a soft signal for an explicit voice request", async () => {
    mocks.decideWebVoiceMode.mockResolvedValue({
      mode: "VOICE",
      reason: "User explicitly requested voice",
      source: "deterministic",
      category: "VOICE_REQUIRED",
      capacityState: "GREEN",
      reasonCode: "EXPLICIT_VOICE",
    });
    mocks.streamChat.mockImplementation(async ({ onFinish }) => {
      await onFinish?.({
        text: "Ti descrivo a voce ciò che vedo nell'immagine.",
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
          yield "Ti descrivo a voce ciò che vedo nell'immagine.";
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
            parts: [
              { type: "text", text: "Descrivimela con un messaggio vocale" },
              {
                type: "file",
                attachmentId: "att-image",
                mimeType: "image/png",
                name: "photo.png",
                url: "data:image/png;base64,aW1hZ2U=",
              },
            ],
          },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.decideWebVoiceMode).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        hasAttachments: true,
      }),
    );
    expect(mocks.generateVoice).toHaveBeenCalledWith(
      "Ti descrivo a voce ciò che vedo nell'immagine.",
    );
  });

  it("explains the fallback when TTS fails for an explicit voice request", async () => {
    mocks.decideWebVoiceMode.mockResolvedValue({
      mode: "VOICE",
      reason: "User explicitly requested voice",
      source: "deterministic",
      category: "VOICE_REQUIRED",
      capacityState: "GREEN",
      reasonCode: "EXPLICIT_VOICE",
    });
    mocks.streamChat.mockImplementation(async ({ onFinish }) => {
      await onFinish?.({
        text: "Respira lentamente e scegli una sola azione.",
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
          yield "Respira lentamente e scegli una sola azione.";
        })(),
      };
    });
    mocks.generateVoice.mockRejectedValue(new Error("TTS unavailable"));
    mocks.messageCreate
      .mockResolvedValueOnce({ id: "msg-user-1" })
      .mockResolvedValueOnce({ id: "msg-fallback-1" });

    const response = await POST(
      buildRequest({
        messages: [
          {
            role: "user",
            parts: [{ type: "text", text: "Mandami un vocale" }],
          },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.messageCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "TEXT",
          parts: [
            {
              type: "text",
              text: "Voice is temporarily unavailable, so I'm replying in text.\n\nRespira lentamente e scegli una sola azione.",
            },
          ],
          metadata: expect.objectContaining({
            responseMode: "text_fallback",
            voice: expect.objectContaining({
              reasonCode: "EXPLICIT_VOICE",
              status: "failed",
              deliveryReason: "generation_or_storage_failed",
            }),
          }),
        }),
      }),
    );
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

  it("transcribes audio data-url fields before the AI flow", async () => {
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
      userMessage:
        "Trascrizione del messaggio vocale:\ntrascrizione del vocale",
      hasAudio: false,
      messageParts: [
        expect.objectContaining({
          type: "text",
          text: "Trascrizione del messaggio vocale:\ntrascrizione del vocale",
        }),
      ],
    });
    expect(streamArgs?.messageParts).not.toContainEqual(
      expect.objectContaining({
        type: "file",
        mimeType: "audio/wav",
      }),
    );
    expect(mocks.transcribeAudio).toHaveBeenCalledWith({
      base64: "dm9pY2UtYmFzZTY0",
      mimeType: "audio/wav",
      title: "Web Chat",
      userId: "user-1",
      source: "WEB",
    });
  });

  it("returns a transcription error without calling the AI flow", async () => {
    mocks.transcribeAudio.mockRejectedValue(new Error("provider down"));

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

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error:
        "Non sono riuscito a trascrivere l'audio in questo momento. Riprova o invia un messaggio testuale.",
    });
    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(mocks.streamChat).not.toHaveBeenCalled();
    expect(mocks.decideWebVoiceMode).not.toHaveBeenCalled();
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
    expect(mocks.decideWebVoiceMode).not.toHaveBeenCalled();
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
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chats-user-1", "max");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("chat-chat-1", "max");
    expect(mocks.extractAndSaveMemories).toHaveBeenCalledWith(
      "user-1",
      "hello world",
      "Assistant reply",
    );
    expect(mocks.waitUntil).toHaveBeenCalledTimes(3);
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
