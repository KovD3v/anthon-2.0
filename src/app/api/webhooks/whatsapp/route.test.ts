import { createHmac } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  waitUntil: vi.fn(),
  prismaMessageFindFirst: vi.fn(),
  prismaChannelIdentityFindUnique: vi.fn(),
  prismaChannelLinkTokenCreate: vi.fn(),
  prismaUserCreate: vi.fn(),
  prismaChannelIdentityCreate: vi.fn(),
  prismaChatUpsert: vi.fn(),
  prismaTransaction: vi.fn(),
  prismaMessageCreate: vi.fn(),
  prismaMessageMetricsCreate: vi.fn(),
  prismaMessageUpdate: vi.fn(),
  prismaChatUpdate: vi.fn(),
  prismaAttachmentCreate: vi.fn(),
  prismaPreferencesFindUnique: vi.fn(),
  ensureConversationThread: vi.fn(),
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
  trackInboundUserMessageFunnelProgress: vi.fn(),
  trackSupportAiUsage: vi.fn(),
}));

vi.mock("@vercel/functions", () => ({
  waitUntil: mocks.waitUntil,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.prismaTransaction,
    message: {
      findFirst: mocks.prismaMessageFindFirst,
      create: mocks.prismaMessageCreate,
      update: mocks.prismaMessageUpdate,
    },
    messageMetrics: {
      create: mocks.prismaMessageMetricsCreate,
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
    preferences: {
      findUnique: mocks.prismaPreferencesFindUnique,
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
  detectVoiceRequestIntent: () => "UNSPECIFIED",
  getVoiceUnavailability: () => ({
    code: "PROVIDER_UNAVAILABLE",
    userMessage: "Voice is temporarily unavailable, so I'm replying in text.",
  }),
  isElevenLabsConfigured: mocks.isElevenLabsConfigured,
  shouldGenerateVoice: mocks.shouldGenerateVoice,
  getVoicePlanConfig: mocks.getVoicePlanConfig,
  getSystemLoad: mocks.getSystemLoad,
  generateVoice: mocks.generateVoice,
  trackVoiceUsage: mocks.trackVoiceUsage,
}));

vi.mock("@/lib/analytics/funnel", () => ({
  trackInboundUserMessageFunnelProgress:
    mocks.trackInboundUserMessageFunnelProgress,
}));

vi.mock("@/lib/ai/usage-meter", () => ({
  trackSupportAiUsage: mocks.trackSupportAiUsage,
}));

vi.mock("@/lib/conversations/threads", () => ({
  ensureConversationThread: mocks.ensureConversationThread,
}));

import * as openRouterTranscription from "@/lib/channels/transcription/openrouter";
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

function buildAudioPayload() {
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
                  id: "wamid_audio_1",
                  timestamp: "1700000000",
                  type: "audio",
                  audio: {
                    id: "audio_1",
                    mime_type: "audio/ogg",
                    voice: true,
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function buildImagePayload(caption: string) {
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
                  id: "wamid_image_1",
                  timestamp: "1700000000",
                  type: "image",
                  image: {
                    id: "image_1",
                    caption,
                    mime_type: "image/jpeg",
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function buildDocumentPayload(caption: string) {
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
                  id: "wamid_document_1",
                  timestamp: "1700000000",
                  type: "document",
                  document: {
                    id: "document_1",
                    caption,
                    filename: "report.pdf",
                    mime_type: "application/pdf",
                  },
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
    process.env.OPENROUTER_API_KEY = "sk-test";
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
    mocks.prismaTransaction.mockReset();
    mocks.prismaMessageCreate.mockReset();
    mocks.prismaMessageMetricsCreate.mockReset();
    mocks.prismaMessageUpdate.mockReset();
    mocks.prismaChatUpdate.mockReset();
    mocks.prismaAttachmentCreate.mockReset();
    mocks.prismaPreferencesFindUnique.mockReset();
    mocks.ensureConversationThread.mockReset();
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
    mocks.trackInboundUserMessageFunnelProgress.mockReset();
    mocks.trackSupportAiUsage.mockReset();

    mocks.waitUntil.mockImplementation(() => {});
    mocks.trackInboundUserMessageFunnelProgress.mockResolvedValue(undefined);
    mocks.trackSupportAiUsage.mockResolvedValue(undefined);
    mocks.ensureConversationThread.mockResolvedValue({
      id: "thread-whatsapp-1",
    });
    mocks.prismaTransaction.mockImplementation(async (callback) =>
      callback({
        message: {
          findFirst: mocks.prismaMessageFindFirst,
          create: mocks.prismaMessageCreate,
          update: mocks.prismaMessageUpdate,
        },
        messageMetrics: {
          create: mocks.prismaMessageMetricsCreate,
        },
      }),
    );
    mocks.prismaMessageMetricsCreate.mockResolvedValue({ id: "metrics-1" });
    mocks.prismaPreferencesFindUnique.mockResolvedValue({ voiceEnabled: true });
    mocks.prismaMessageUpdate.mockResolvedValue({});
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

  it("POST accepts a valid HMAC signature when app secret is configured", async () => {
    process.env.WHATSAPP_APP_SECRET = "app-secret";
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";

    const body = JSON.stringify(buildPayload());
    const signature = createHmac("sha256", "app-secret")
      .update(body)
      .digest("hex");

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body,
        headers: { "x-hub-signature-256": `sha256=${signature}` },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.waitUntil).not.toHaveBeenCalled();
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

  it("sync status update without messages is ignored without AI side effects", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify({
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
                    statuses: [
                      {
                        id: "wamid_status_1",
                        status: "delivered",
                        timestamp: "1700000000",
                        recipient_id: "39333111222",
                      },
                    ],
                  },
                },
              ],
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.prismaMessageFindFirst).not.toHaveBeenCalled();
    expect(mocks.prismaMessageCreate).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.streamChat).not.toHaveBeenCalled();
  });

  it("sync duplicate wamid returns ok without AI side effects", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.OPENROUTER_API_KEY = "sk-test";

    mocks.prismaMessageFindFirst.mockResolvedValue({ id: "existing_wa_msg" });

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildTextPayload("ciao di nuovo")),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.prismaMessageFindFirst).toHaveBeenCalledWith({
      where: {
        channel: "WHATSAPP",
        externalMessageId: "wamid_1",
      },
      select: { id: true },
    });
    expect(mocks.prismaMessageCreate).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.streamChat).not.toHaveBeenCalled();
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

  it("sync text message persists inbound idempotency marker when rate limit is exceeded", async () => {
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
    mocks.prismaMessageCreate.mockResolvedValue({ id: "wa_rate_limited" });

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildTextPayload("ciao")),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.prismaMessageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_1",
          channel: "WHATSAPP",
          direction: "INBOUND",
          role: "USER",
          type: "TEXT",
          externalMessageId: "wamid_1",
        }),
      }),
    );
    expect(mocks.prismaMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wa_rate_limited" },
        data: {
          metadata: expect.objectContaining({
            whatsapp: expect.objectContaining({
              id: "wamid_1",
              type: "text",
              error: expect.objectContaining({
                kind: "rate_limit_denied",
              }),
            }),
          }),
        },
      }),
    );
    expect(mocks.streamChat).not.toHaveBeenCalled();
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
    expect(mocks.trackInboundUserMessageFunnelProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        channel: "WHATSAPP",
      }),
    );
    expect(mocks.streamChat).not.toHaveBeenCalled();
  });

  it("WHATSAPP_DISABLE_SEND suppresses Graph API fallback sends", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.WHATSAPP_DISABLE_SEND = "true";
    process.env.WHATSAPP_ACCESS_TOKEN = "wa-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone_1";
    delete process.env.OPENROUTER_API_KEY;

    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

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
    mocks.prismaMessageCreate.mockResolvedValue({ id: "wa_in_1" });

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildTextPayload("ciao da wa")),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.prismaMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wa_in_1" },
        data: {
          metadata: expect.objectContaining({
            whatsapp: expect.objectContaining({
              id: "wamid_1",
              type: "text",
              error: expect.objectContaining({
                kind: "ai_configuration_missing",
              }),
            }),
          }),
        },
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.streamChat).not.toHaveBeenCalled();
  });

  it("sync text message saves inbound and returns when OPENROUTER key is missing", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.WHATSAPP_ACCESS_TOKEN = "wa-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone_1";
    delete process.env.OPENROUTER_API_KEY;

    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

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
    expect(mocks.prismaMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wa_in_1" },
        data: {
          metadata: expect.objectContaining({
            whatsapp: expect.objectContaining({
              id: "wamid_1",
              type: "text",
              error: expect.objectContaining({
                kind: "ai_configuration_missing",
              }),
            }),
          }),
        },
      }),
    );
    expect(mocks.streamChat).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/phone_1/messages",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Servizio AI non configurato"),
      }),
    );
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
        body: JSON.stringify(buildTextPayload("  ciao wa ai  ")),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.streamChat).toHaveBeenCalledTimes(1);
    expect(mocks.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        userMessage: "ciao wa ai",
        effectiveEntitlements: { modelTier: "STANDARD" },
        isGuest: true,
        hasAudio: false,
        hasImages: false,
        chatId: undefined,
      }),
    );
    expect(mocks.prismaMessageCreate).toHaveBeenCalledTimes(2);
    expect(mocks.prismaMessageCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          channel: "WHATSAPP",
          metadata: {
            whatsapp: { inReplyTo: "wa_in_1" },
          },
        }),
      }),
    );
    expect(mocks.trackInboundUserMessageFunnelProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        channel: "WHATSAPP",
      }),
    );
    expect(mocks.incrementUsage).toHaveBeenCalledTimes(1);
    expect(mocks.extractAndSaveMemories).toHaveBeenCalledTimes(1);
  });

  it("sync text message sends fallback when assistant response is empty", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.WHATSAPP_ACCESS_TOKEN = "wa-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone_1";

    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

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
    mocks.prismaMessageCreate.mockResolvedValueOnce({ id: "wa_in_1" });
    mocks.isElevenLabsConfigured.mockReturnValue(false);
    mocks.streamChat.mockResolvedValue({
      textStream: (async function* () {
        yield "";
      })(),
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildTextPayload("ciao wa ai")),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/phone_1/messages",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Non ho generato una risposta"),
      }),
    );
    expect(mocks.prismaMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wa_in_1" },
        data: {
          metadata: expect.objectContaining({
            whatsapp: expect.objectContaining({
              id: "wamid_1",
              type: "text",
              error: expect.objectContaining({
                kind: "empty_assistant_response",
              }),
            }),
          }),
        },
      }),
    );
  });

  it("sync text message sends fallback when assistant persistence fails", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.WHATSAPP_ACCESS_TOKEN = "wa-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone_1";

    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

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
      .mockRejectedValueOnce(new Error("assistant persistence failed"));
    mocks.isElevenLabsConfigured.mockReturnValue(false);
    mocks.streamChat.mockImplementation(async ({ onFinish }) => {
      await onFinish?.({
        text: "risposta non salvata",
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
          yield "risposta non salvata";
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
    expect(mocks.prismaMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wa_in_1" },
        data: {
          metadata: expect.objectContaining({
            whatsapp: expect.objectContaining({
              id: "wamid_1",
              type: "text",
              error: expect.objectContaining({
                kind: "assistant_persistence_failed",
              }),
            }),
          }),
        },
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/phone_1/messages",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Errore temporaneo"),
      }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/phone_1/messages",
      expect.objectContaining({
        body: expect.stringContaining("risposta non salvata"),
      }),
    );
  });

  it("sync text message records inbound metadata when AI streaming fails", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.WHATSAPP_ACCESS_TOKEN = "wa-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone_1";

    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

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
    mocks.prismaMessageCreate.mockResolvedValueOnce({ id: "wa_in_1" });
    mocks.isElevenLabsConfigured.mockReturnValue(false);
    mocks.streamChat.mockRejectedValue(new Error("stream failed"));

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildTextPayload("ciao wa ai")),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.prismaMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wa_in_1" },
        data: {
          metadata: expect.objectContaining({
            whatsapp: expect.objectContaining({
              id: "wamid_1",
              type: "text",
              error: expect.objectContaining({
                kind: "streamChat_failed",
              }),
            }),
          }),
        },
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/phone_1/messages",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Si è verificato un errore"),
      }),
    );
  });

  it("sync audio message sends fallback when media download fails", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.WHATSAPP_ACCESS_TOKEN = "wa-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone_1";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("download-failed", { status: 500 }))
      .mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

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
    mocks.prismaMessageCreate.mockResolvedValueOnce({ id: "wa_in_1" });

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildAudioPayload()),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.streamChat).not.toHaveBeenCalled();
    expect(mocks.prismaMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wa_in_1" },
        data: {
          metadata: expect.objectContaining({
            whatsapp: expect.objectContaining({
              id: "wamid_audio_1",
              type: "audio",
              error: expect.objectContaining({
                kind: "audio_download_failed",
              }),
            }),
          }),
        },
      }),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://graph.facebook.com/v21.0/phone_1/messages",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(
          "Non sono riuscito a scaricare il messaggio audio",
        ),
      }),
    );
  });

  it("sync audio message records inbound metadata when transcription fails", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.WHATSAPP_ACCESS_TOKEN = "wa-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone_1";
    process.env.OPENROUTER_API_KEY = "sk-test";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: "https://example.com/audio.ogg",
            mime_type: "audio/ogg",
          }),
        ),
      )
      .mockResolvedValueOnce(new Response("audio-data"))
      .mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

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
    mocks.prismaMessageCreate.mockResolvedValueOnce({ id: "wa_in_1" });

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildAudioPayload()),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.streamChat).not.toHaveBeenCalled();
    expect(mocks.prismaMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wa_in_1" },
        data: {
          metadata: expect.objectContaining({
            whatsapp: expect.objectContaining({
              id: "wamid_audio_1",
              type: "audio",
              error: expect.objectContaining({
                kind: "transcription_failed",
              }),
            }),
          }),
        },
      }),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://graph.facebook.com/v21.0/phone_1/messages",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(
          "Non sono riuscito a trascrivere il messaggio audio",
        ),
      }),
    );
  });

  it("sync audio message records inbound metadata when transcription is empty", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.WHATSAPP_ACCESS_TOKEN = "wa-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone_1";
    process.env.OPENROUTER_API_KEY = "sk-test";

    vi.spyOn(
      openRouterTranscription,
      "transcribeAudioWithOpenRouter",
    ).mockResolvedValueOnce("   ");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: "https://example.com/audio.ogg",
            mime_type: "audio/ogg",
          }),
        ),
      )
      .mockResolvedValueOnce(new Response("audio-data"))
      .mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

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
    mocks.prismaMessageCreate.mockResolvedValueOnce({ id: "wa_in_1" });

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildAudioPayload()),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.streamChat).not.toHaveBeenCalled();
    expect(mocks.prismaMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wa_in_1" },
        data: {
          metadata: expect.objectContaining({
            whatsapp: expect.objectContaining({
              id: "wamid_audio_1",
              type: "audio",
              error: expect.objectContaining({
                kind: "empty_transcription",
              }),
            }),
          }),
        },
      }),
    );
  });

  it("sync image message sends caption before media part to the AI", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.WHATSAPP_ACCESS_TOKEN = "wa-token";
    process.env.WHATSAPP_DISABLE_SEND = "true";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: "https://example.com/image.jpg",
            mime_type: "image/jpeg",
          }),
        ),
      )
      .mockResolvedValueOnce(new Response("image-data"));
    vi.stubGlobal("fetch", fetchMock);

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
        text: "risposta immagine",
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
          yield "risposta immagine";
        })(),
      };
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildImagePayload("  valuta questa posizione  ")),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: "valuta questa posizione",
        hasImages: true,
        messageParts: [
          { type: "text", text: "valuta questa posizione" },
          {
            type: "file",
            mimeType: "image/jpeg",
            data: Buffer.from("image-data").toString("base64"),
          },
        ],
      }),
    );
  });

  it("sync image-only message uses image fallback text for the channel flow", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.WHATSAPP_ACCESS_TOKEN = "wa-token";
    process.env.WHATSAPP_DISABLE_SEND = "true";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: "https://example.com/image.jpg",
            mime_type: "image/jpeg",
          }),
        ),
      )
      .mockResolvedValueOnce(new Response("image-data"));
    vi.stubGlobal("fetch", fetchMock);

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
        text: "risposta immagine",
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
          yield "risposta immagine";
        })(),
      };
    });

    const payload = buildImagePayload("");
    const image = payload.entry[0].changes[0].value.messages[0].image as {
      caption?: string;
    };
    delete image.caption;

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: "L'utente ha inviato questa immagine.",
        hasImages: true,
        messageParts: [
          { type: "text", text: "L'utente ha inviato questa immagine." },
          {
            type: "file",
            mimeType: "image/jpeg",
            data: Buffer.from("image-data").toString("base64"),
          },
        ],
      }),
    );
  });

  it("sync image message records inbound metadata when media download fails", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.WHATSAPP_ACCESS_TOKEN = "wa-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone_1";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("download-failed", { status: 500 }))
      .mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

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
    mocks.prismaMessageCreate.mockResolvedValueOnce({ id: "wa_in_1" });

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildImagePayload("valuta questa immagine")),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.streamChat).not.toHaveBeenCalled();
    expect(mocks.prismaMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wa_in_1" },
        data: {
          metadata: expect.objectContaining({
            whatsapp: expect.objectContaining({
              id: "wamid_image_1",
              type: "image",
              error: expect.objectContaining({
                kind: "image_download_failed",
              }),
            }),
          }),
        },
      }),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://graph.facebook.com/v21.0/phone_1/messages",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(
          "Non sono riuscito a scaricare l'immagine",
        ),
      }),
    );
  });

  it("sync document message records inbound metadata when media download fails", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.WHATSAPP_ACCESS_TOKEN = "wa-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone_1";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("download-failed", { status: 500 }))
      .mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

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
    mocks.prismaMessageCreate.mockResolvedValueOnce({ id: "wa_in_1" });

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildDocumentPayload("leggi questo documento")),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.streamChat).not.toHaveBeenCalled();
    expect(mocks.prismaMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "wa_in_1" },
        data: {
          metadata: expect.objectContaining({
            whatsapp: expect.objectContaining({
              id: "wamid_document_1",
              type: "document",
              documentName: "report.pdf",
              documentMimeType: "application/pdf",
              error: expect.objectContaining({
                kind: "document_download_failed",
              }),
            }),
          }),
        },
      }),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://graph.facebook.com/v21.0/phone_1/messages",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(
          "Non sono riuscito a scaricare il documento",
        ),
      }),
    );
  });

  it("does not send duplicate text when WhatsApp voice usage tracking fails after send", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.WHATSAPP_ACCESS_TOKEN = "wa-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone_1";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "media_voice_1" })),
      )
      .mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    mocks.prismaMessageFindFirst.mockResolvedValue(null);
    mocks.prismaChannelIdentityFindUnique.mockResolvedValue({
      userId: "user_1",
      user: {
        id: "user_1",
        role: "USER",
        isGuest: false,
        subscription: {
          status: "ACTIVE",
          planId: "my-basic-plan",
        },
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
    mocks.isElevenLabsConfigured.mockReturnValue(true);
    mocks.shouldGenerateVoice.mockResolvedValue({
      shouldGenerateVoice: true,
      category: "VOICE_NATURAL",
      capacityState: "GREEN",
      reasonCode: "NATURAL_MOMENT",
    });
    mocks.getVoicePlanConfig.mockReturnValue({ enabled: true });
    mocks.generateVoice.mockResolvedValue({
      audioBuffer: Buffer.from("audio"),
      characterCount: 21,
      costUsd: 0.00105,
    });
    mocks.trackVoiceUsage.mockRejectedValue(new Error("usage write failed"));
    mocks.streamChat.mockImplementation(async ({ onFinish }) => {
      await onFinish?.({
        text: "risposta vocale",
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
          yield "risposta vocale";
        })(),
      };
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildTextPayload("mandami un vocale")),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://graph.facebook.com/v21.0/phone_1/messages",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"type":"audio"'),
      }),
    );
    expect(mocks.trackVoiceUsage).toHaveBeenCalledWith(
      "user_1",
      21,
      "WHATSAPP",
      0.00105,
    );
    expect(mocks.prismaMessageUpdate).toHaveBeenCalledWith({
      where: { id: "wa_out_1" },
      data: { type: "AUDIO", mediaType: "audio/mpeg" },
    });
    expect(mocks.shouldGenerateVoice).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: "mandami un vocale",
        assistantText: "risposta vocale",
        channel: "WHATSAPP",
      }),
    );
  });

  it("uses one text response when deterministic cadence suppresses WhatsApp audio", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.WHATSAPP_ACCESS_TOKEN = "wa-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone_1";

    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    mocks.prismaMessageFindFirst.mockResolvedValue(null);
    mocks.prismaChannelIdentityFindUnique.mockResolvedValue({
      userId: "user_1",
      user: {
        id: "user_1",
        role: "USER",
        isGuest: false,
        subscription: { status: "ACTIVE", planId: "my-basic-plan" },
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
    mocks.isElevenLabsConfigured.mockReturnValue(true);
    mocks.getVoicePlanConfig.mockReturnValue({ enabled: true });
    mocks.shouldGenerateVoice.mockResolvedValue({
      shouldGenerateVoice: false,
      category: "VOICE_NATURAL",
      capacityState: "GREEN",
      reasonCode: "CADENCE_COOLDOWN",
    });
    mocks.streamChat.mockImplementation(async ({ onFinish }) => {
      await onFinish?.({
        text: "una risposta riflessiva",
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
          yield "una risposta riflessiva";
        })(),
      };
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildTextPayload("come posso affrontarlo?")),
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/phone_1/messages",
      expect.objectContaining({
        body: expect.stringContaining("una risposta riflessiva"),
      }),
    );
    expect(mocks.shouldGenerateVoice).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantText: "una risposta riflessiva",
        channel: "WHATSAPP",
      }),
    );
    expect(mocks.generateVoice).not.toHaveBeenCalled();
    expect(mocks.trackVoiceUsage).not.toHaveBeenCalled();
  });

  it("explains an explicit WhatsApp voice request when TTS generation fails", async () => {
    process.env.WHATSAPP_SYNC_WEBHOOK = "true";
    process.env.WHATSAPP_ACCESS_TOKEN = "wa-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone_1";

    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    mocks.prismaMessageFindFirst.mockResolvedValue(null);
    mocks.prismaChannelIdentityFindUnique.mockResolvedValue({
      userId: "user_1",
      user: {
        id: "user_1",
        role: "USER",
        isGuest: false,
        subscription: { status: "ACTIVE", planId: "my-basic-plan" },
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
    mocks.isElevenLabsConfigured.mockReturnValue(true);
    mocks.getVoicePlanConfig.mockReturnValue({ enabled: true });
    mocks.shouldGenerateVoice.mockResolvedValue({
      shouldGenerateVoice: true,
      category: "VOICE_REQUIRED",
      capacityState: "GREEN",
      reasonCode: "EXPLICIT_VOICE",
      explicitVoiceRequest: true,
    });
    mocks.generateVoice.mockRejectedValue(new Error("tts failed"));
    mocks.streamChat.mockImplementation(async ({ onFinish }) => {
      await onFinish?.({
        text: "risposta disponibile come testo",
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
          yield "risposta disponibile come testo";
        })(),
      };
    });

    const response = await POST(
      new Request("http://localhost/api/webhooks/whatsapp", {
        method: "POST",
        body: JSON.stringify(buildTextPayload("mandami un vocale")),
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/phone_1/messages",
      expect.objectContaining({
        body: expect.stringContaining(
          "Voice is temporarily unavailable, so I'm replying in text.",
        ),
      }),
    );
    expect(mocks.generateVoice).toHaveBeenCalledTimes(1);
    expect(mocks.trackVoiceUsage).not.toHaveBeenCalled();
    expect(mocks.prismaMessageUpdate).not.toHaveBeenCalledWith({
      where: { id: "wa_out_1" },
      data: { type: "AUDIO", mediaType: "audio/mpeg" },
    });
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

    const sig = createHmac("sha256", "app-secret")
      .update("hello")
      .digest("hex");
    const signedRequest = new Request(
      "http://localhost/api/webhooks/whatsapp",
      {
        method: "POST",
        body: "hello",
        headers: { "x-hub-signature-256": `sha256=${sig}` },
      },
    );
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
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ messages: [{ id: "m1" }] })),
      );
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

  it("transcribeWithOpenRouterResponses handles provider fallback and success", async () => {
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
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [] })))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            text: " trascrizione wa ",
            usage: {
              input_tokens: 9,
              output_tokens: 4,
              cost: 0.0003,
              seconds: 3.1,
              total_tokens: 13,
            },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      transcribeAudioWithOpenRouter({
        base64: "YQ==",
        mimeType: "audio/ogg",
      }),
    ).rejects.toThrow("OpenRouter returned no text output");

    await expect(
      transcribeAudioWithOpenRouter({
        base64: "YQ==",
        mimeType: "audio/ogg",
        userId: "user-1",
      }),
    ).resolves.toBe("trascrizione wa");
    expect(mocks.trackSupportAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        modelId: "openai/whisper-large-v3-turbo",
        providerMetadata: {
          openrouter: {
            usage: {
              input_tokens: 9,
              output_tokens: 4,
              cost: 0.0003,
              seconds: 3.1,
              total_tokens: 13,
            },
          },
        },
      }),
    );
  });
});
