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
  messageFindUnique: vi.fn(),
  messageCreate: vi.fn(),
  messageMetricsCreate: vi.fn(),
  voiceGenerationJobCreate: vi.fn(),
  messageCount: vi.fn(),
  attachmentCreate: vi.fn(),
  attachmentFindMany: vi.fn(),
  attachmentUpdateMany: vi.fn(),
  checkRateLimit: vi.fn(),
  incrementUsage: vi.fn(),
  reserveAiUsage: vi.fn(),
  releaseAiUsageReservation: vi.fn(),
  reconcileAiUsageForRecovery: vi.fn(),
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
  putPrivateVoiceBlob: vi.fn(),
  getVoiceGenerationExpiry: vi.fn(),
  scheduleVoiceGenerationJob: vi.fn(),
  withVoiceGenerationStatus: vi.fn(),
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
      findUnique: mocks.messageFindUnique,
      create: mocks.messageCreate,
      count: mocks.messageCount,
    },
    messageMetrics: {
      create: mocks.messageMetricsCreate,
    },
    attachment: {
      create: mocks.attachmentCreate,
      findMany: mocks.attachmentFindMany,
      updateMany: mocks.attachmentUpdateMany,
    },
  },
}));

vi.mock("@/lib/conversations/threads", () => ({
  ensureConversationThread: mocks.ensureConversationThread,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  incrementUsage: mocks.incrementUsage,
  reserveAiUsage: mocks.reserveAiUsage,
  releaseAiUsageReservation: mocks.releaseAiUsageReservation,
  reconcileAiUsageForRecovery: mocks.reconcileAiUsageForRecovery,
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

vi.mock("@/lib/voice/storage", () => ({
  putPrivateVoiceBlob: mocks.putPrivateVoiceBlob,
}));

vi.mock("@/lib/voice/generation-jobs", () => ({
  getVoiceGenerationExpiry: mocks.getVoiceGenerationExpiry,
  scheduleVoiceGenerationJob: mocks.scheduleVoiceGenerationJob,
  withVoiceGenerationStatus: mocks.withVoiceGenerationStatus,
}));

import { POST } from "./route";

const TRUSTED_BLOB_ORIGIN = "https://store.public.blob.vercel-storage.com";
const VALID_WAV_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
]);
const VALID_MP3_BYTES = Buffer.from("ID3safe audio");

function canonicalAttachment(
  id: string,
  overrides: Partial<{
    name: string;
    contentType: string;
    size: number;
    blobUrl: string;
  }> = {},
) {
  return {
    id,
    name: `${id}.png`,
    contentType: "image/png",
    size: 4,
    blobUrl: `${TRUSTED_BLOB_ORIGIN}/${id}.png`,
    ...overrides,
  };
}

function buildRequest(body: unknown): Request {
  const normalizedBody =
    body && typeof body === "object" && !Array.isArray(body)
      ? {
          ...(body as Record<string, unknown>),
          ...("messages" in body && Array.isArray(body.messages)
            ? {
                messages: body.messages.map((message, index) =>
                  message &&
                  typeof message === "object" &&
                  (message as { role?: unknown }).role === "user" &&
                  !("id" in message)
                    ? { ...message, id: `client-user-${index}` }
                    : message,
                ),
              }
            : {}),
        }
      : body;
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify(normalizedBody),
    headers: { "Content-Type": "application/json" },
  });
}

function emptyUiStream() {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
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
    mocks.messageFindUnique.mockReset();
    mocks.messageCreate.mockReset();
    mocks.messageMetricsCreate.mockReset();
    mocks.voiceGenerationJobCreate.mockReset();
    mocks.messageCount.mockReset();
    mocks.attachmentCreate.mockReset();
    mocks.attachmentFindMany.mockReset();
    mocks.attachmentUpdateMany.mockReset();
    mocks.checkRateLimit.mockReset();
    mocks.incrementUsage.mockReset();
    mocks.reserveAiUsage.mockReset();
    mocks.releaseAiUsageReservation.mockReset();
    mocks.reconcileAiUsageForRecovery.mockReset();
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
    mocks.putPrivateVoiceBlob.mockReset();
    mocks.getVoiceGenerationExpiry.mockReset();
    mocks.scheduleVoiceGenerationJob.mockReset();
    mocks.withVoiceGenerationStatus.mockReset();
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
          findUnique: mocks.messageFindUnique,
          create: mocks.messageCreate,
          count: mocks.messageCount,
        },
        messageMetrics: {
          create: mocks.messageMetricsCreate,
        },
        voiceGenerationJob: {
          create: mocks.voiceGenerationJobCreate,
        },
        attachment: {
          updateMany: mocks.attachmentUpdateMany,
        },
      }),
    );

    mocks.messageFindUnique.mockResolvedValue(null);
    mocks.reserveAiUsage.mockResolvedValue(undefined);
    mocks.releaseAiUsageReservation.mockResolvedValue(true);
    mocks.reconcileAiUsageForRecovery.mockResolvedValue({ charged: true });

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
      _count: { messages: 0 },
    });
    mocks.ensureConversationThread.mockResolvedValue({ id: "thread-1" });
    mocks.messageCreate.mockResolvedValue({ id: "msg-user-1" });
    mocks.messageMetricsCreate.mockResolvedValue({ id: "metrics-1" });
    mocks.voiceGenerationJobCreate.mockResolvedValue({ id: "voice-job-1" });
    mocks.messageCount.mockResolvedValue(1);
    mocks.chatUpdate.mockResolvedValue({});
    mocks.attachmentUpdateMany.mockImplementation(
      async ({ where }: { where: { id: string | { in: string[] } } }) => ({
        count:
          typeof where.id === "object" && "in" in where.id
            ? new Set(where.id.in).size
            : 1,
      }),
    );
    mocks.attachmentFindMany.mockImplementation(
      async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => canonicalAttachment(id)),
    );
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
    mocks.putPrivateVoiceBlob.mockResolvedValue({
      url: "https://store.private.blob.vercel-storage.com/voice/msg-assistant-1.mp3",
    });
    mocks.getVoiceGenerationExpiry.mockReturnValue(
      new Date("2026-07-14T12:00:00.000Z"),
    );
    mocks.withVoiceGenerationStatus.mockImplementation(
      (metadata: { voice?: Record<string, unknown> }, status: string) => ({
        ...metadata,
        voice: { ...metadata.voice, status },
      }),
    );
    mocks.trackVoiceUsage.mockResolvedValue(undefined);
    mocks.streamChat.mockResolvedValue({
      toUIMessageStream: emptyUiStream,
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
          toUIMessageStream: emptyUiStream,
          toUIMessageStreamResponse: () =>
            Response.json({ ok: true, stream: true }, { status: 200 }),
        };
      },
    );
    mocks.messageCreate.mockResolvedValueOnce({ id: "msg-user-123" });
    mocks.attachmentFindMany.mockResolvedValue([
      canonicalAttachment("att-1", {
        name: "canonical-image.png",
        size: 42,
        blobUrl: `${TRUSTED_BLOB_ORIGIN}/canonical-image.png`,
      }),
      canonicalAttachment("att-2", {
        name: "canonical-voice.mp3",
        contentType: "audio/mpeg",
        size: VALID_MP3_BYTES.byteLength,
        blobUrl: `${TRUSTED_BLOB_ORIGIN}/canonical-voice.mp3`,
      }),
    ]);

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
                data: "https://127.0.0.1/private.png",
              },
              {
                type: "file",
                attachmentId: "att-2",
                mimeType: "audio/mpeg",
                name: "voice.mp3",
                size: 99,
                data: `data:audio/mpeg;base64,${VALID_MP3_BYTES.toString("base64")}`,
              },
            ],
          },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("[DONE]");

    expect(mocks.messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          chatId: "chat-1",
          role: "USER",
          direction: "INBOUND",
        }),
      }),
    );
    const persistedParts = mocks.messageCreate.mock.calls[0]?.[0].data.parts;
    expect(persistedParts).toEqual([
      { type: "text", text: "hello" },
      expect.objectContaining({
        attachmentId: "att-1",
        data: `${TRUSTED_BLOB_ORIGIN}/canonical-image.png`,
        mimeType: "image/png",
        name: "canonical-image.png",
        size: 42,
      }),
      expect.objectContaining({
        attachmentId: "att-2",
        data: `${TRUSTED_BLOB_ORIGIN}/canonical-voice.mp3`,
        mimeType: "audio/mpeg",
        name: "canonical-voice.mp3",
        size: VALID_MP3_BYTES.byteLength,
      }),
    ]);
    expect(JSON.stringify(persistedParts)).not.toContain("127.0.0.1");
    expect(JSON.stringify(persistedParts)).not.toContain(
      VALID_MP3_BYTES.toString("base64"),
    );
    expect(mocks.attachmentUpdateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["att-1", "att-2"] },
        userId: "user-1",
        messageId: null,
      },
      data: { messageId: "msg-user-123" },
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
          data: `${TRUSTED_BLOB_ORIGIN}/canonical-image.png`,
          name: "canonical-image.png",
          size: 42,
        }),
        expect.objectContaining({
          type: "text",
          text: "Trascrizione del messaggio vocale allegato:\ntrascrizione del vocale",
        }),
      ],
    });
    expect(mocks.transcribeAudio).toHaveBeenCalledWith({
      base64: VALID_MP3_BYTES.toString("base64"),
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
          toUIMessageStream: emptyUiStream,
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

  it("loads persisted history when the client submits only its latest message", async () => {
    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-1",
      title: "Chat",
      customTitle: true,
      _count: { messages: 4 },
    });
    let streamArgs: Record<string, unknown> | undefined;
    mocks.streamChat.mockImplementation(
      async (args: Record<string, unknown>) => {
        streamArgs = args;
        return {
          toUIMessageStream: emptyUiStream,
          toUIMessageStreamResponse: () =>
            Response.json({ ok: true, stream: true }, { status: 200 }),
        };
      },
    );

    const response = await POST(
      buildRequest({
        messages: [
          { role: "user", parts: [{ type: "text", text: "continue" }] },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(streamArgs).toMatchObject({
      chatId: "chat-1",
      userMessage: "continue",
      skipConversationHistory: false,
    });
  });

  it("passes image blob urls to the AI flow as image file parts", async () => {
    let streamArgs: Record<string, unknown> | undefined;
    mocks.streamChat.mockImplementation(
      async (args: Record<string, unknown>) => {
        streamArgs = args;
        return {
          toUIMessageStream: emptyUiStream,
          toUIMessageStreamResponse: () =>
            Response.json({ ok: true, stream: true }, { status: 200 }),
        };
      },
    );
    mocks.attachmentFindMany.mockResolvedValue([
      canonicalAttachment("att-image-url", {
        name: "canonical-photo.jpg",
        contentType: "image/jpeg",
        size: 987,
        blobUrl: `${TRUSTED_BLOB_ORIGIN}/canonical-photo.jpg`,
      }),
    ]);

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
                url: "http://127.0.0.1/private.png",
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
          data: `${TRUSTED_BLOB_ORIGIN}/canonical-photo.jpg`,
          mimeType: "image/jpeg",
          name: "canonical-photo.jpg",
          size: 987,
          attachmentId: "att-image-url",
        },
      ],
    });
  });

  it("discards client image data URLs in favor of canonical blob metadata", async () => {
    let streamArgs: Record<string, unknown> | undefined;
    mocks.streamChat.mockImplementation(
      async (args: Record<string, unknown>) => {
        streamArgs = args;
        return {
          toUIMessageStream: emptyUiStream,
          toUIMessageStreamResponse: () =>
            Response.json({ ok: true, stream: true }, { status: 200 }),
        };
      },
    );
    mocks.attachmentFindMany.mockResolvedValue([
      canonicalAttachment("att-image-data-url", {
        name: "camera.jpg",
        contentType: "image/jpeg",
        size: 321,
        blobUrl: `${TRUSTED_BLOB_ORIGIN}/canonical-camera.jpg`,
      }),
    ]);

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
          data: `${TRUSTED_BLOB_ORIGIN}/canonical-camera.jpg`,
          mimeType: "image/jpeg",
          name: "camera.jpg",
          size: 321,
        }),
      ],
    });
  });

  it("recomputes media flags from canonical attachment metadata", async () => {
    let streamArgs: Record<string, unknown> | undefined;
    mocks.streamChat.mockImplementation(
      async (args: Record<string, unknown>) => {
        streamArgs = args;
        return {
          toUIMessageStream: emptyUiStream,
          toUIMessageStreamResponse: () =>
            Response.json({ ok: true, stream: true }, { status: 200 }),
        };
      },
    );
    mocks.attachmentFindMany.mockResolvedValue([
      canonicalAttachment("att-canonical-audio", {
        name: "canonical.wav",
        contentType: "audio/wav",
        size: VALID_WAV_BYTES.byteLength,
        blobUrl: `${TRUSTED_BLOB_ORIGIN}/canonical.wav`,
      }),
    ]);

    const response = await POST(
      buildRequest({
        messages: [
          {
            role: "user",
            parts: [
              {
                type: "file",
                attachmentId: "att-canonical-audio",
                mimeType: "image/png",
                name: "client-spoof.png",
                size: 999,
                url: `data:audio/wav;base64,${VALID_WAV_BYTES.toString("base64")}`,
              },
            ],
          },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.transcribeAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        base64: VALID_WAV_BYTES.toString("base64"),
        mimeType: "audio/wav",
      }),
    );
    expect(streamArgs).toMatchObject({
      hasImages: false,
      hasAudio: false,
      inputOrigin: "transcribed_voice",
      userMessage:
        "Trascrizione del messaggio vocale:\ntrascrizione del vocale",
    });
  });

  it("uses request messages for title refresh without a blocking message count", async () => {
    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-1",
      title: "Nuova Chat",
      customTitle: false,
      _count: { messages: 0 },
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
      _count: { messages: 0 },
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
    await expect(response.text()).resolves.toContain("[DONE]");
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

  it("persists a voice-first transcript and queues TTS without waiting for audio", async () => {
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
    expect(mocks.generateVoice).not.toHaveBeenCalled();
    expect(mocks.putPrivateVoiceBlob).not.toHaveBeenCalled();
    expect(mocks.trackVoiceUsage).not.toHaveBeenCalled();
    expect(mocks.voiceGenerationJobCreate).toHaveBeenCalledWith({
      data: {
        messageId: "msg-assistant-1",
        userId: "user-1",
        expiresAt: new Date("2026-07-14T12:00:00.000Z"),
      },
    });
    expect(mocks.scheduleVoiceGenerationJob).toHaveBeenCalledWith(
      "msg-assistant-1",
      mocks.waitUntil,
    );
    expect(mocks.messageCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "TEXT",
          metadata: expect.objectContaining({
            responseMode: "voice",
            voice: expect.objectContaining({ status: "pending" }),
          }),
        }),
      }),
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
      classifierDiagnostics: {
        outcome: "success",
        model: "google/gemini-2.5-flash-lite",
        durationMs: 184,
        timeoutMs: 1500,
      },
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
        toUIMessageStream: emptyUiStream,
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
              classifierDiagnostics: {
                outcome: "success",
                model: "google/gemini-2.5-flash-lite",
                durationMs: 184,
                timeoutMs: 1500,
              },
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
    expect(mocks.generateVoice).not.toHaveBeenCalled();
    expect(mocks.scheduleVoiceGenerationJob).toHaveBeenCalledWith(
      "msg-assistant-1",
      mocks.waitUntil,
    );
  });

  it("keeps the explicit voice transcript available while generation runs asynchronously", async () => {
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
    mocks.messageCreate
      .mockResolvedValueOnce({ id: "msg-user-1" })
      .mockResolvedValueOnce({ id: "msg-assistant-1" });

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
              text: "Respira lentamente e scegli una sola azione.",
            },
          ],
          metadata: expect.objectContaining({
            responseMode: "voice",
            voice: expect.objectContaining({
              reasonCode: "EXPLICIT_VOICE",
              status: "pending",
            }),
          }),
        }),
      }),
    );
    expect(mocks.scheduleVoiceGenerationJob).toHaveBeenCalledWith(
      "msg-assistant-1",
      mocks.waitUntil,
    );
  });

  it("does not create an audio message or duplicate transcript before the job runs", async () => {
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
    expect(mocks.messageCreate).toHaveBeenCalledTimes(2);
    expect(mocks.messageCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "TEXT",
          metadata: expect.objectContaining({
            responseMode: "voice",
            voice: expect.objectContaining({ status: "pending" }),
          }),
        }),
      }),
    );
    expect(mocks.scheduleVoiceGenerationJob).toHaveBeenCalledTimes(1);
  });

  it("transcribes audio data-url fields before the AI flow", async () => {
    let streamArgs: Record<string, unknown> | undefined;
    mocks.streamChat.mockImplementation(
      async (args: Record<string, unknown>) => {
        streamArgs = args;
        return {
          toUIMessageStream: emptyUiStream,
          toUIMessageStreamResponse: () =>
            Response.json({ ok: true, stream: true }, { status: 200 }),
        };
      },
    );
    mocks.messageCreate.mockResolvedValueOnce({ id: "msg-user-123" });
    mocks.attachmentFindMany.mockResolvedValue([
      canonicalAttachment("att-voice", {
        name: "canonical-voice.wav",
        contentType: "audio/wav",
        size: VALID_WAV_BYTES.byteLength,
        blobUrl: `${TRUSTED_BLOB_ORIGIN}/canonical-voice.wav`,
      }),
    ]);

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
                url: `data:audio/wav;base64,${VALID_WAV_BYTES.toString("base64")}`,
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
      base64: VALID_WAV_BYTES.toString("base64"),
      mimeType: "audio/wav",
      title: "Web Chat",
      userId: "user-1",
      source: "WEB",
    });
  });

  it("returns a transcription error without calling the AI flow", async () => {
    mocks.transcribeAudio.mockRejectedValue(new Error("provider down"));
    mocks.attachmentFindMany.mockResolvedValue([
      canonicalAttachment("att-voice", {
        name: "canonical-voice.wav",
        contentType: "audio/wav",
        size: VALID_WAV_BYTES.byteLength,
        blobUrl: `${TRUSTED_BLOB_ORIGIN}/canonical-voice.wav`,
      }),
    ]);

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
                url: `data:audio/wav;base64,${VALID_WAV_BYTES.toString("base64")}`,
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

  it("returns 400 when canonical audio has no validated inline payload", async () => {
    mocks.attachmentFindMany.mockResolvedValue([
      canonicalAttachment("att-voice", {
        name: "canonical-voice.wav",
        contentType: "audio/wav",
        size: VALID_WAV_BYTES.byteLength,
        blobUrl: `${TRUSTED_BLOB_ORIGIN}/canonical-voice.wav`,
      }),
    ]);
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
      error: "Invalid or inaccessible attachment",
    });
    expect(mocks.userFindUnique).toHaveBeenCalledTimes(1);
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.attachmentFindMany).toHaveBeenCalledWith({
      where: { id: { in: ["att-voice"] }, userId: "user-1" },
      select: {
        id: true,
        name: true,
        contentType: true,
        size: true,
        blobUrl: true,
      },
    });
    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(mocks.decideWebVoiceMode).not.toHaveBeenCalled();
  });

  it("rejects the whole message when any attachment is not owned", async () => {
    mocks.attachmentFindMany.mockResolvedValue([canonicalAttachment("att-1")]);

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

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid or inaccessible attachment",
    });
    expect(mocks.attachmentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["att-1", "att-2"] }, userId: "user-1" },
      }),
    );
    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(mocks.attachmentUpdateMany).not.toHaveBeenCalled();
    expect(mocks.streamChat).not.toHaveBeenCalled();
  });

  it("rolls back the inbound claim when any attachment cannot be linked", async () => {
    mocks.messageCreate.mockResolvedValueOnce({ id: "msg-user-123" });
    mocks.attachmentUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const response = await POST(
      buildRequest({
        messages: [
          {
            role: "user",
            parts: [
              { type: "text", text: "hello" },
              { type: "file", attachmentId: "att-linked" },
              { type: "file", attachmentId: "att-pending" },
              { type: "file", attachmentId: "att-pending" },
            ],
          },
        ],
        chatId: "chat-1",
      }),
    );

    expect(response.status).toBe(409);
    expect(mocks.attachmentUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.attachmentUpdateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["att-linked", "att-pending"] },
        userId: "user-1",
        messageId: null,
      },
      data: { messageId: "msg-user-123" },
    });
    expect(mocks.streamChat).not.toHaveBeenCalled();
  });

  it("runs onFinish side effects for assistant message, usage, cache tags, and memories", async () => {
    let streamArgs: Record<string, unknown> | undefined;
    mocks.streamChat.mockImplementation(
      async (args: Record<string, unknown>) => {
        streamArgs = args;
        return {
          toUIMessageStream: emptyUiStream,
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
