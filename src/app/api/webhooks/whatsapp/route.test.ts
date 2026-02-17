import { createHmac } from "node:crypto";
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

import { transcribeAudioWithOpenRouter } from "@/lib/channels/transcription/openrouter";
import {
  downloadWhatsAppMedia,
  getPublicAppUrl,
  isConnectCommand,
  sendWhatsAppVoice,
  verifySignature,
} from "@/lib/channels/whatsapp/utils";
import { GET, POST } from "./route";

const originalEnv = { ...process.env };

function buildPayload() {
  return {
    object: "whatsapp_business_account",
    entry: [],
  };
}

function buildTextPayload(text: string) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "entry_1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "3900000000",
                phone_number_id: "phone_1",
              },
              contacts: [
                {
                  profile: { name: "Mario Rossi" },
                  wa_id: "39333111222",
                },
              ],
              messages: [
                {
                  from: "39333111222",
                  id: "wamid_1",
                  timestamp: "1700000000",
                  type: "text",
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("/api/webhooks/whatsapp", () => {
  beforeEach(() => {
    process.env.WHATSAPP_VERIFY_TOKEN = "verify-token";
    delete process.env.WHATSAPP_APP_SECRET;
    delete process.env.WHATSAPP_SYNC_WEBHOOK;
    delete process.env.WHATSAPP_DISABLE_SEND;
    delete process.env.WHATSAPP_DISABLE_AI;
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

  it("GET returns challenge for valid verification params", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=12345",
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("12345");
  });

  it("GET returns 403 for invalid verification token", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=bad",
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("POST returns 401 on signature mismatch when secret is configured", async () => {
    process.env.WHATSAPP_APP_SECRET = "app-secret";

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildPayload()),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("POST returns 400 for invalid JSON payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: "{ bad",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON" });
  });

  it("POST returns 404 for unsupported object", async () => {
    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify({ object: "other", entry: [] }),
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not Found" });
  });

  it("POST processes synchronously when WHATSAPP_SYNC_WEBHOOK=true", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildPayload()),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.waitUntil).not.toHaveBeenCalled();
  });

  it("POST enqueues async processing by default", async () => {
    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildPayload()),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.waitUntil).toHaveBeenCalledTimes(1);
  });

  it("sync connect command returns early when non-guest identity is already linked", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.WHATSAPP_DISABLE_SEND = "true";

    mocks.prismaMessageFindFirst.mockResolvedValue(null);
    mocks.prismaChannelIdentityFindUnique.mockResolvedValue({
      user: { isGuest: false },
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildTextPayload("/connect")),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.prismaChannelLinkTokenCreate).not.toHaveBeenCalled();
  });

  it("sync connect command creates a link token when no linked identity exists", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.WHATSAPP_DISABLE_SEND = "true";
    process.env.NEXT_PUBLIC_APP_URL = "https://anthon.ai";

    mocks.prismaMessageFindFirst.mockResolvedValue(null);
    mocks.prismaChannelIdentityFindUnique.mockResolvedValue(null);
    mocks.prismaChannelLinkTokenCreate.mockResolvedValue({ id: "wa_link_1" });

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildTextPayload("collega")),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.prismaChannelLinkTokenCreate).toHaveBeenCalledTimes(1);
  });

  it("sync text message stops before persistence when rate limit is exceeded", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.WHATSAPP_DISABLE_SEND = "true";

    mocks.prismaMessageFindFirst.mockResolvedValue(null);
    mocks.prismaChannelIdentityFindUnique.mockResolvedValue({
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
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildTextPayload("ciao")),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.prismaMessageCreate).not.toHaveBeenCalled();
  });

  it("sync text message saves inbound and returns when AI is disabled", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.WHATSAPP_DISABLE_SEND = "true";
    process.env.WHATSAPP_DISABLE_AI = "true";

    mocks.prismaMessageFindFirst.mockResolvedValue(null);
    mocks.prismaChannelIdentityFindUnique.mockResolvedValue({
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
    mocks.prismaMessageCreate.mockResolvedValue({ id: "wa_in_1" });

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildTextPayload("ciao da wa")),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.prismaMessageCreate).toHaveBeenCalledTimes(1);
    expect(mocks.streamChat).not.toHaveBeenCalled();
  });

  it("sync text message runs AI stream path and persists assistant output", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.WHATSAPP_DISABLE_SEND = "true";

    mocks.prismaMessageFindFirst.mockResolvedValue(null);
    mocks.prismaChannelIdentityFindUnique.mockResolvedValue({
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
      .mockResolvedValueOnce({ id: "wa_in_1" })
      .mockResolvedValueOnce({ id: "wa_out_1" });
    mocks.incrementUsage.mockResolvedValue(undefined);
    mocks.extractAndSaveMemories.mockResolvedValue(undefined);
    mocks.isElevenLabsConfigured.mockReturnValue(false);
    mocks.streamChat.mockImplementation(async ({ onFinish }) => {
      await onFinish?.({
        text: "risposta wa",
        metrics: {
          model: "test-model",
          inputTokens: 11,
          outputTokens: 22,
          costUsd: 0.0011,
          generationTimeMs: 35,
        },
      });
      return {
        textStream: (async function* () {
          yield "risposta wa";
        })(),
      };
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildTextPayload("ciao wa ai")),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.streamChat).toHaveBeenCalledTimes(1);
    expect(mocks.prismaMessageCreate).toHaveBeenCalledTimes(2);
    expect(mocks.incrementUsage).toHaveBeenCalledTimes(1);
    expect(mocks.extractAndSaveMemories).toHaveBeenCalledTimes(1);
  });

  it("helper signature and command/url helpers cover validation branches", () => {
    delete process.env.WHATSAPP_APP_SECRET;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;

    const request = new Request("http://localhost/api/webhooks/whatsapp", {
      method: "POST",
      body: "hello",
    });
    expect(verifySignature(request, "hello")).toBe(true);

    process.env.WHATSAPP_APP_SECRET = "app-secret";
    expect(verifySignature(request, "hello")).toBe(false);

    const sig = createHmac("sha256", "app-secret").update("hello").digest("hex");
    const signedRequest = new Request("http://localhost/api/webhooks/whatsapp", {
      method: "POST",
      body: "hello",
      headers: { "x-hub-signature-256": `sha256=${sig}` },
    });
    expect(verifySignature(signedRequest, "hello")).toBe(true);

    expect(isConnectCommand("/connect")).toBe(true);
    expect(isConnectCommand("collega")).toBe(true);
    expect(isConnectCommand("hello")).toBe(false);
    expect(getPublicAppUrl()).toBe("http://localhost:3000");
    process.env.VERCEL_URL = "preview.vercel.app";
    expect(getPublicAppUrl()).toBe("https://preview.vercel.app");
  });

  it("sendWhatsAppVoice handles missing creds, failed upload, and success", async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    await expect(
      sendWhatsAppVoice("39333111222", Buffer.from("audio")),
    ).resolves.toBe(false);

    process.env.WHATSAPP_ACCESS_TOKEN = "wa-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone_1";

    const fetchFailUpload = vi
      .fn()
      .mockResolvedValueOnce(new Response("upload-failed", { status: 500 }));
    vi.stubGlobal("fetch", fetchFailUpload);
    await expect(
      sendWhatsAppVoice("39333111222", Buffer.from("audio")),
    ).resolves.toBe(false);

    const fetchSuccess = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "media_1" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "m1" }] })));
    vi.stubGlobal("fetch", fetchSuccess);
    await expect(
      sendWhatsAppVoice("39333111222", Buffer.from("audio")),
    ).resolves.toBe(true);
  });

  it("downloadWhatsAppMedia handles missing token and successful fetches", async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    await expect(downloadWhatsAppMedia("media_1")).resolves.toBeNull();

    process.env.WHATSAPP_ACCESS_TOKEN = "wa-token";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: "https://example.com/file.bin",
            mime_type: "audio/ogg",
          }),
        ),
      )
      .mockResolvedValueOnce(new Response("bin-data"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(downloadWhatsAppMedia("media_1")).resolves.toEqual({
      base64: Buffer.from("bin-data").toString("base64"),
      mimeType: "audio/ogg",
    });
  });

  it("transcribeWithOpenRouterResponses handles key/config error branches", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(
      transcribeAudioWithOpenRouter({
        base64: "YQ==",
        mimeType: "audio/ogg",
      }),
    ).rejects.toThrow("OPENROUTER_API_KEY not configured");

    process.env.OPENROUTER_API_KEY = "sk-or-test";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("bad", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: " trascrizione wa " } }],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      transcribeAudioWithOpenRouter({
        base64: "YQ==",
        mimeType: "audio/ogg",
      }),
    ).rejects.toThrow("OpenRouter API failed");

    await expect(
      transcribeAudioWithOpenRouter({
        base64: "YQ==",
        mimeType: "audio/ogg",
      }),
    ).resolves.toBe("trascrizione wa");
  });
});
