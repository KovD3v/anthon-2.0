import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  waitUntil: vi.fn(),
  prismaMessageFindFirst: vi.fn(),
  prismaChannelIdentityFindUnique: vi.fn(),
  prismaChannelLinkTokenCreate: vi.fn(),
  prismaUserCreate: vi.fn(),
  prismaChannelIdentityCreate: vi.fn(),
  prismaChatUpsert: vi.fn(),
  prismaMessageCreate: vi.fn(),
  prismaChatUpdate: vi.fn(),
  prismaAttachmentCreate: vi.fn(),
  prismaSubscriptionFindUnique: vi.fn(),
  checkRateLimit: vi.fn(),
  incrementUsage: vi.fn(),
  streamChat: vi.fn(),
  extractAndSaveMemories: vi.fn(),
  start: vi.fn(),
  measure: vi.fn(),
  isElevenLabsConfigured: vi.fn(),
  shouldGenerateVoice: vi.fn(),
  getVoicePlanConfig: vi.fn(),
  getSystemLoad: vi.fn(),
  generateVoice: vi.fn(),
  trackVoiceUsage: vi.fn(),
}));

vi.mock("@vercel/functions", () => ({
  waitUntil: mocks.waitUntil,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    message: {
      findFirst: mocks.prismaMessageFindFirst,
      create: mocks.prismaMessageCreate,
    },
    channelIdentity: {
      findUnique: mocks.prismaChannelIdentityFindUnique,
      create: mocks.prismaChannelIdentityCreate,
    },
    channelLinkToken: {
      create: mocks.prismaChannelLinkTokenCreate,
    },
    user: {
      create: mocks.prismaUserCreate,
    },
    chat: {
      upsert: mocks.prismaChatUpsert,
      update: mocks.prismaChatUpdate,
    },
    attachment: {
      create: mocks.prismaAttachmentCreate,
    },
    subscription: {
      findUnique: mocks.prismaSubscriptionFindUnique,
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

vi.mock("@/lib/ai/memory-extractor", () => ({
  extractAndSaveMemories: mocks.extractAndSaveMemories,
}));

vi.mock("@/lib/latency-logger", () => ({
  LatencyLogger: {
    start: mocks.start,
    measure: mocks.measure,
  },
}));

vi.mock("@/lib/voice", () => ({
  isElevenLabsConfigured: mocks.isElevenLabsConfigured,
  shouldGenerateVoice: mocks.shouldGenerateVoice,
  getVoicePlanConfig: mocks.getVoicePlanConfig,
  getSystemLoad: mocks.getSystemLoad,
  generateVoice: mocks.generateVoice,
  trackVoiceUsage: mocks.trackVoiceUsage,
}));

import { __testables, GET, POST } from "./route";

const originalEnv = { ...process.env };

function buildMinimalUpdate() {
  return {
    update_id: 1,
    message: {
      message_id: 2,
      date: 1700000000,
      chat: { id: 100, type: "private" },
      from: { id: 200, is_bot: false },
    },
  };
}

function buildTextUpdate(text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 2,
      date: 1700000000,
      text,
      chat: { id: 100, type: "private" },
      from: { id: 200, is_bot: false, username: "test-user" },
    },
  };
}

describe("/api/webhooks/telegram", () => {
  beforeEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "tg-secret";
    delete process.env.TELEGRAM_SYNC_WEBHOOK;
    delete process.env.TELEGRAM_DISABLE_SEND;
    delete process.env.NEXT_PUBLIC_APP_URL;

    mocks.waitUntil.mockReset();
    mocks.prismaMessageFindFirst.mockReset();
    mocks.prismaChannelIdentityFindUnique.mockReset();
    mocks.prismaChannelLinkTokenCreate.mockReset();
    mocks.prismaUserCreate.mockReset();
    mocks.prismaChannelIdentityCreate.mockReset();
    mocks.prismaChatUpsert.mockReset();
    mocks.prismaMessageCreate.mockReset();
    mocks.prismaChatUpdate.mockReset();
    mocks.prismaAttachmentCreate.mockReset();
    mocks.prismaSubscriptionFindUnique.mockReset();
    mocks.checkRateLimit.mockReset();
    mocks.incrementUsage.mockReset();
    mocks.streamChat.mockReset();
    mocks.extractAndSaveMemories.mockReset();
    mocks.start.mockReset();
    mocks.measure.mockReset();
    mocks.isElevenLabsConfigured.mockReset();
    mocks.shouldGenerateVoice.mockReset();
    mocks.getVoicePlanConfig.mockReset();
    mocks.getSystemLoad.mockReset();
    mocks.generateVoice.mockReset();
    mocks.trackVoiceUsage.mockReset();

    mocks.waitUntil.mockImplementation(() => {});
    mocks.start.mockReturnValue({ end: vi.fn(), split: vi.fn() });
    mocks.measure.mockImplementation(
      async (_name: string, fn: () => unknown) => await fn(),
    );
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GET returns health payload", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      channel: "telegram",
    });
  });

  it("POST returns 500 when secret is missing", async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;

    const response = await POST(
      new Request("http://localhost/api/webhooks/telegram", {
        method: "POST",
        body: JSON.stringify(buildMinimalUpdate()),
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "TELEGRAM_WEBHOOK_SECRET not configured",
    });
  });

  it("POST returns 401 for invalid secret header", async () => {
    const response = await POST(
      new Request("http://localhost/api/webhooks/telegram", {
        method: "POST",
        body: JSON.stringify(buildMinimalUpdate()),
        headers: { "x-telegram-bot-api-secret-token": "wrong" },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Unauthorized",
    });
  });

  it("POST returns 400 for invalid json", async () => {
    const response = await POST(
      new Request("http://localhost/api/webhooks/telegram", {
        method: "POST",
        body: "{ bad",
        headers: { "x-telegram-bot-api-secret-token": "tg-secret" },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Invalid JSON",
    });
  });

  it("POST runs sync handler when TELEGRAM_SYNC_WEBHOOK=true", async () => {
    process.env.TELEGRAM_SYNC_WEBHOOK = "true";

    const response = await POST(
      new Request("http://localhost/api/webhooks/telegram", {
        method: "POST",
        body: JSON.stringify(buildMinimalUpdate()),
        headers: { "x-telegram-bot-api-secret-token": "tg-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.waitUntil).not.toHaveBeenCalled();
  });

  it("POST enqueues async handler by default", async () => {
    const response = await POST(
      new Request("http://localhost/api/webhooks/telegram", {
        method: "POST",
        body: JSON.stringify(buildMinimalUpdate()),
        headers: { "x-telegram-bot-api-secret-token": "tg-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.waitUntil).toHaveBeenCalledTimes(1);
  });

  it("sync connect command returns early when non-guest identity is already linked", async () => {
    process.env.TELEGRAM_SYNC_WEBHOOK = "true";
    process.env.TELEGRAM_DISABLE_SEND = "true";

    mocks.prismaMessageFindFirst.mockResolvedValue(null);
    mocks.prismaChannelIdentityFindUnique.mockResolvedValue({
      user: { isGuest: false },
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/telegram", {
        method: "POST",
        body: JSON.stringify(buildTextUpdate("/connect")),
        headers: { "x-telegram-bot-api-secret-token": "tg-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.prismaChannelLinkTokenCreate).not.toHaveBeenCalled();
    expect(mocks.prismaMessageCreate).not.toHaveBeenCalled();
  });

  it("sync connect command creates a link token when identity is not linked", async () => {
    process.env.TELEGRAM_SYNC_WEBHOOK = "true";
    process.env.TELEGRAM_DISABLE_SEND = "true";
    process.env.NEXT_PUBLIC_APP_URL = "https://anthon.ai";

    mocks.prismaMessageFindFirst.mockResolvedValue(null);
    mocks.prismaChannelIdentityFindUnique.mockResolvedValue(null);
    mocks.prismaChannelLinkTokenCreate.mockResolvedValue({ id: "lt_1" });

    const response = await POST(
      new Request("http://localhost/api/webhooks/telegram", {
        method: "POST",
        body: JSON.stringify(buildTextUpdate("collega")),
        headers: { "x-telegram-bot-api-secret-token": "tg-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.prismaChannelLinkTokenCreate).toHaveBeenCalledTimes(1);
  });

  it("sync text message stops before persistence when rate limit is exceeded", async () => {
    process.env.TELEGRAM_SYNC_WEBHOOK = "true";
    process.env.TELEGRAM_DISABLE_SEND = "true";

    mocks.prismaMessageFindFirst.mockResolvedValue(null);
    mocks.prismaChannelIdentityFindUnique.mockResolvedValue({
      id: "ci_1",
      userId: "user_1",
      user: {
        id: "user_1",
        role: "USER",
        isGuest: true,
        subscription: null,
      },
    });
    mocks.checkRateLimit.mockResolvedValue({
      allowed: false,
      upgradeInfo: null,
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/telegram", {
        method: "POST",
        body: JSON.stringify(buildTextUpdate("ciao")),
        headers: { "x-telegram-bot-api-secret-token": "tg-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.prismaMessageCreate).not.toHaveBeenCalled();
  });

  it("sync text message saves inbound content and returns when OPENROUTER key is missing", async () => {
    process.env.TELEGRAM_SYNC_WEBHOOK = "true";
    process.env.TELEGRAM_DISABLE_SEND = "true";
    delete process.env.OPENROUTER_API_KEY;

    mocks.prismaMessageFindFirst.mockResolvedValue(null);
    mocks.prismaChannelIdentityFindUnique.mockResolvedValue({
      id: "ci_1",
      userId: "user_1",
      user: {
        id: "user_1",
        role: "USER",
        isGuest: true,
        subscription: null,
      },
    });
    mocks.checkRateLimit.mockResolvedValue({
      allowed: true,
      effectiveEntitlements: null,
    });
    mocks.prismaMessageCreate.mockResolvedValue({ id: "msg_in_1" });

    const response = await POST(
      new Request("http://localhost/api/webhooks/telegram", {
        method: "POST",
        body: JSON.stringify(buildTextUpdate("ciao dal bot")),
        headers: { "x-telegram-bot-api-secret-token": "tg-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.prismaMessageCreate).toHaveBeenCalledTimes(1);
    expect(mocks.streamChat).not.toHaveBeenCalled();
  });

  it("sync text message runs AI stream path and persists assistant output", async () => {
    process.env.TELEGRAM_SYNC_WEBHOOK = "true";
    process.env.TELEGRAM_DISABLE_SEND = "true";
    process.env.OPENROUTER_API_KEY = "sk-test";

    mocks.prismaMessageFindFirst.mockResolvedValue(null);
    mocks.prismaChannelIdentityFindUnique.mockResolvedValue({
      id: "ci_1",
      userId: "user_1",
      user: {
        id: "user_1",
        role: "USER",
        isGuest: true,
        subscription: null,
      },
    });
    mocks.checkRateLimit.mockResolvedValue({
      allowed: true,
      effectiveEntitlements: { modelTier: "STANDARD" },
    });
    mocks.prismaMessageCreate
      .mockResolvedValueOnce({ id: "msg_in_1" })
      .mockResolvedValueOnce({ id: "msg_out_1" });
    mocks.incrementUsage.mockResolvedValue(undefined);
    mocks.extractAndSaveMemories.mockResolvedValue(undefined);
    mocks.isElevenLabsConfigured.mockReturnValue(false);
    mocks.streamChat.mockImplementation(async ({ onFinish }) => {
      await onFinish?.({
        text: "risposta finale",
        metrics: {
          model: "test-model",
          inputTokens: 10,
          outputTokens: 20,
          reasoningTokens: 0,
          reasoningContent: null,
          toolCalls: [],
          ragUsed: false,
          ragChunksCount: 0,
          costUsd: 0.001,
          generationTimeMs: 42,
          reasoningTimeMs: 0,
        },
      });
      return {
        textStream: (async function* () {
          yield "risposta finale";
        })(),
      };
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/telegram", {
        method: "POST",
        body: JSON.stringify(buildTextUpdate("ciao ai")),
        headers: { "x-telegram-bot-api-secret-token": "tg-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.streamChat).toHaveBeenCalledTimes(1);
    expect(mocks.prismaMessageCreate).toHaveBeenCalledTimes(2);
    expect(mocks.incrementUsage).toHaveBeenCalledTimes(1);
    expect(mocks.extractAndSaveMemories).toHaveBeenCalledTimes(1);
  });

  it("helper utils normalize errors and command/url detection", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;

    expect(__testables.safeErrorSummary(undefined)).toBe("Unknown error");
    expect(__testables.safeErrorSummary("x".repeat(400)).length).toBe(300);
    expect(__testables.safeErrorSummary(new Error("boom"))).toContain("Error: boom");
    expect(__testables.safeErrorSummary({ a: 1 })).toBe('{"a":1}');

    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(__testables.safeErrorSummary(circular)).toBe("Unserializable error");

    expect(__testables.isTelegramConnectCommand("/connect")).toBe(true);
    expect(__testables.isTelegramConnectCommand("collega account")).toBe(true);
    expect(__testables.isTelegramConnectCommand("hello")).toBe(false);
    expect(__testables.getPublicAppUrl()).toBe("http://localhost:3000");

    process.env.NEXT_PUBLIC_APP_URL = "https://anthon.ai";
    expect(__testables.getPublicAppUrl()).toBe("https://anthon.ai");
    process.env.TELEGRAM_WEBHOOK_SECRET = "hash-secret";
    expect(typeof __testables.hashLinkToken("abc")).toBe("string");
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    expect(__testables.hashLinkToken("abc")).toBeNull();
  });

  it("getTelegramFilePath handles missing token and malformed API responses", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    await expect(__testables.getTelegramFilePath("file_1")).resolves.toBeNull();

    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("bad", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: {} })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(__testables.getTelegramFilePath("file_2")).resolves.toBeNull();
    await expect(__testables.getTelegramFilePath("file_3")).resolves.toBeNull();
  });

  it("downloadTelegramAudio returns null when file ids are missing", async () => {
    await expect(
      __testables.downloadTelegramAudio(undefined, undefined),
    ).resolves.toBeNull();
  });

  it("downloadTelegramAudio downloads and returns base64 payload", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, result: { file_path: "voice/file.ogg" } }),
        ),
      )
      .mockResolvedValueOnce(new Response("audio-data"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await __testables.downloadTelegramAudio(
      {
        file_id: "voice_1",
        file_unique_id: "u1",
        duration: 3,
      },
      undefined,
    );

    expect(result).toEqual({
      base64: Buffer.from("audio-data").toString("base64"),
      mimeType: "audio/ogg",
    });
  });

  it("transcribeWithOpenRouterResponses handles API errors and success", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(
      __testables.transcribeWithOpenRouterResponses({
        base64: "YQ==",
        mimeType: "audio/ogg",
      }),
    ).rejects.toThrow("OPENROUTER_API_KEY not configured");

    process.env.OPENROUTER_API_KEY = "sk-or-test";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("bad", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: " trascrizione ok " } }],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      __testables.transcribeWithOpenRouterResponses({
        base64: "YQ==",
        mimeType: "audio/ogg",
      }),
    ).rejects.toThrow("OpenRouter API failed");
    await expect(
      __testables.transcribeWithOpenRouterResponses({
        base64: "YQ==",
        mimeType: "audio/ogg",
      }),
    ).rejects.toThrow("OpenRouter returned no text output");
    await expect(
      __testables.transcribeWithOpenRouterResponses({
        base64: "YQ==",
        mimeType: "audio/ogg",
      }),
    ).resolves.toBe("trascrizione ok");
  });
});
