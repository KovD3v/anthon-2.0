import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  userFindUnique: vi.fn(),
  messageFindFirst: vi.fn(),
  getPrivateVoiceBlob: vi.fn(),
  isPrivateVoiceBlobUrl: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    message: { findFirst: mocks.messageFindFirst },
  },
}));
vi.mock("@/lib/voice/storage", () => ({
  getPrivateVoiceBlob: mocks.getPrivateVoiceBlob,
  isPrivateVoiceBlobUrl: mocks.isPrivateVoiceBlobUrl,
}));

import { GET } from "./route";

const context = { params: Promise.resolve({ messageId: "message-1" }) };

describe("GET /api/voice/messages/[messageId]", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mocks.auth.mockReset().mockResolvedValue({ userId: "clerk-1" });
    mocks.userFindUnique.mockReset().mockResolvedValue({ id: "user-1" });
    mocks.messageFindFirst.mockReset().mockResolvedValue({
      attachments: [
        {
          blobUrl: "https://blob.example/voice.mp3",
          contentType: "audio/mpeg",
        },
      ],
    });
    mocks.getPrivateVoiceBlob.mockReset();
    mocks.isPrivateVoiceBlobUrl.mockReset().mockReturnValue(false);
  });

  it("requires authentication", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const response = await GET(
      new Request("http://localhost/api/voice/messages/message-1"),
      context,
    );

    expect(response.status).toBe(401);
    expect(mocks.messageFindFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when the user cannot access an audio attachment", async () => {
    mocks.messageFindFirst.mockResolvedValue(null);
    const response = await GET(
      new Request("http://localhost/api/voice/messages/message-1"),
      context,
    );

    expect(response.status).toBe(404);
    expect(mocks.messageFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "message-1",
          OR: [{ userId: "user-1" }, { chat: { visibility: "PUBLIC" } }],
        }),
      }),
    );
  });

  it("serves a private voice object through the authenticated proxy with range support", async () => {
    const privateVoiceUrl =
      "https://store.private.blob.vercel-storage.com/voice/chat-1/file.mp3";
    const body = new Response(new Uint8Array([1, 2])).body;
    if (!body) throw new Error("Expected test response body");

    mocks.messageFindFirst.mockResolvedValue({
      attachments: [
        {
          blobUrl: privateVoiceUrl,
          contentType: "audio/mpeg",
        },
      ],
    });
    mocks.isPrivateVoiceBlobUrl.mockReturnValue(true);
    mocks.getPrivateVoiceBlob.mockResolvedValue({
      statusCode: 200,
      stream: body,
      headers: new Headers({
        "Content-Type": "audio/mpeg",
        "Content-Length": "2",
        "Content-Range": "bytes 0-1/2",
        "Accept-Ranges": "bytes",
        ETag: '"voice-etag"',
      }),
      blob: { contentType: "audio/mpeg", etag: '"voice-etag"' },
    });

    const response = await GET(
      new Request("http://localhost/api/voice/messages/message-1", {
        headers: { Range: "bytes=0-1" },
      }),
      context,
    );

    expect(mocks.getPrivateVoiceBlob).toHaveBeenCalledWith(privateVoiceUrl, {
      range: "bytes=0-1",
      ifNoneMatch: null,
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-range")).toBe("bytes 0-1/2");
    expect(response.headers.get("etag")).toBe('"voice-etag"');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2]),
    );
  });

  it("returns 304 for a private voice object that matches the caller cache", async () => {
    const privateVoiceUrl =
      "https://store.private.blob.vercel-storage.com/voice/chat-1/file.mp3";
    mocks.messageFindFirst.mockResolvedValue({
      attachments: [{ blobUrl: privateVoiceUrl, contentType: "audio/mpeg" }],
    });
    mocks.isPrivateVoiceBlobUrl.mockReturnValue(true);
    mocks.getPrivateVoiceBlob.mockResolvedValue({
      statusCode: 304,
      stream: null,
      headers: new Headers({ ETag: '"voice-etag"' }),
      blob: { contentType: null, etag: '"voice-etag"' },
    });

    const response = await GET(
      new Request("http://localhost/api/voice/messages/message-1", {
        headers: { "If-None-Match": '"voice-etag"' },
      }),
      context,
    );

    expect(mocks.getPrivateVoiceBlob).toHaveBeenCalledWith(privateVoiceUrl, {
      range: null,
      ifNoneMatch: '"voice-etag"',
    });
    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe('"voice-etag"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns 404 for an authorized request when the private object no longer exists", async () => {
    mocks.isPrivateVoiceBlobUrl.mockReturnValue(true);
    mocks.getPrivateVoiceBlob.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/voice/messages/message-1"),
      context,
    );

    expect(response.status).toBe(404);
  });

  it("returns 502 without exposing a private provider failure", async () => {
    mocks.isPrivateVoiceBlobUrl.mockReturnValue(true);
    mocks.getPrivateVoiceBlob.mockRejectedValue(new Error("provider failed"));

    const response = await GET(
      new Request("http://localhost/api/voice/messages/message-1"),
      context,
    );

    expect(response.status).toBe(502);
    await expect(response.text()).resolves.toBe(
      "Audio temporarily unavailable",
    );
  });

  it("permits an authenticated viewer to play an explicitly public shared chat", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "viewer-2" });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1]), {
        headers: { "Content-Type": "audio/mpeg" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("http://localhost/api/voice/messages/message-1"),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.messageFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ userId: "viewer-2" }, { chat: { visibility: "PUBLIC" } }],
        }),
      }),
    );
  });

  it("continues to proxy retained legacy public voice safely until cleanup", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2]), {
        status: 206,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": "2",
          "Content-Range": "bytes 0-1/2",
          "Accept-Ranges": "bytes",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("http://localhost/api/voice/messages/message-1", {
        headers: { Range: "bytes=0-1" },
      }),
      context,
    );

    expect(fetchMock).toHaveBeenCalledWith("https://blob.example/voice.mp3", {
      headers: { Range: "bytes=0-1" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-range")).toBe("bytes 0-1/2");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2]),
    );
  });
});
