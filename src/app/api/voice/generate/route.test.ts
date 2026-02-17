import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  userFindUnique: vi.fn(),
  messageFindFirst: vi.fn(),
  attachmentCreate: vi.fn(),
  start: vi.fn(),
  measure: vi.fn(),
  isElevenLabsConfigured: vi.fn(),
  shouldGenerateVoice: vi.fn(),
  getVoicePlanConfig: vi.fn(),
  getSystemLoad: vi.fn(),
  generateVoice: vi.fn(),
  trackVoiceUsage: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    message: {
      findFirst: mocks.messageFindFirst,
    },
    attachment: {
      create: mocks.attachmentCreate,
    },
  },
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

vi.mock("@vercel/blob", () => ({
  put: mocks.put,
}));

import { POST } from "./route";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/voice/generate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/voice/generate", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.userFindUnique.mockReset();
    mocks.messageFindFirst.mockReset();
    mocks.attachmentCreate.mockReset();
    mocks.start.mockReset();
    mocks.measure.mockReset();
    mocks.isElevenLabsConfigured.mockReset();
    mocks.shouldGenerateVoice.mockReset();
    mocks.getVoicePlanConfig.mockReset();
    mocks.getSystemLoad.mockReset();
    mocks.generateVoice.mockReset();
    mocks.trackVoiceUsage.mockReset();
    mocks.put.mockReset();

    mocks.start.mockReturnValue({ end: vi.fn(), split: vi.fn() });
    mocks.measure.mockImplementation(
      async (_name: string, fn: () => unknown) => await fn(),
    );

    mocks.auth.mockResolvedValue({ userId: "clerk-1" });
    mocks.isElevenLabsConfigured.mockReturnValue(true);
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      role: "USER",
      isGuest: false,
      subscription: { status: "ACTIVE", planId: "pro" },
      preferences: { voiceEnabled: true },
    });
    mocks.messageFindFirst.mockResolvedValue({
      id: "msg-1",
      content: "Hello from assistant",
      userId: "user-1",
    });
    mocks.getVoicePlanConfig.mockReturnValue({
      enabled: true,
      maxCharactersPerDay: 10000,
    });
    mocks.shouldGenerateVoice.mockResolvedValue({
      shouldGenerateVoice: true,
      blockedAt: null,
      reason: null,
    });
    mocks.generateVoice.mockResolvedValue({
      audioBuffer: Buffer.from("abc"),
      characterCount: 3,
    });
    mocks.put.mockResolvedValue({ url: "https://blob.example/voice/msg-1.mp3" });
    mocks.trackVoiceUsage.mockResolvedValue(undefined);
    mocks.attachmentCreate.mockResolvedValue({ id: "att-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await POST(buildRequest({ messageId: "msg-1" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns configured=false payload when elevenlabs is not configured", async () => {
    mocks.isElevenLabsConfigured.mockReturnValue(false);

    const response = await POST(buildRequest({ messageId: "msg-1" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      error: "Voice generation not configured",
      shouldGenerateVoice: false,
    });
  });

  it("returns 400 for invalid json", async () => {
    const response = await POST(
      new Request("http://localhost/api/voice/generate", {
        method: "POST",
        body: "{ bad",
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON" });
  });

  it("returns 400 when messageId is missing", async () => {
    const response = await POST(buildRequest({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "messageId is required",
    });
  });

  it("returns 404 when user is missing", async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    const response = await POST(buildRequest({ messageId: "msg-1" }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "User not found" });
  });

  it("returns 404 when message is not found", async () => {
    mocks.messageFindFirst.mockResolvedValue(null);

    const response = await POST(buildRequest({ messageId: "msg-1" }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Message not found",
    });
  });

  it("returns funnel block response", async () => {
    mocks.shouldGenerateVoice.mockResolvedValue({
      shouldGenerateVoice: false,
      blockedAt: "plan",
      reason: "No voice credits left",
    });

    const response = await POST(buildRequest({ messageId: "msg-1" }));

    expect(response.status).toBe(200);
    expect(mocks.generateVoice).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      shouldGenerateVoice: false,
      blockedAt: "plan",
      reason: "No voice credits left",
    });
  });

  it("returns voice payload and stores attachment on success", async () => {
    const response = await POST(
      buildRequest({
        messageId: "msg-1",
        userMessage: "Please narrate",
      }),
    );

    expect(mocks.shouldGenerateVoice).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        assistantText: "Hello from assistant",
        planConfig: { enabled: true, maxCharactersPerDay: 10000 },
        systemLoad: mocks.getSystemLoad,
      }),
    );
    expect(mocks.put).toHaveBeenCalledWith(
      "voice/msg-1.mp3",
      Buffer.from("abc"),
      expect.objectContaining({
        access: "public",
        contentType: "audio/mpeg",
      }),
    );
    expect(mocks.trackVoiceUsage).toHaveBeenCalledWith("user-1", 3, "WEB");
    expect(mocks.attachmentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          messageId: "msg-1",
          blobUrl: "https://blob.example/voice/msg-1.mp3",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      shouldGenerateVoice: true,
      audio: "YWJj",
      mimeType: "audio/mpeg",
      characterCount: 3,
      attachmentId: "att-1",
      blobUrl: "https://blob.example/voice/msg-1.mp3",
    });
  });

  it("returns 500 when generation fails", async () => {
    mocks.generateVoice.mockRejectedValue(new Error("tts failed"));

    const response = await POST(buildRequest({ messageId: "msg-1" }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Voice generation failed",
      shouldGenerateVoice: false,
    });
  });
});
