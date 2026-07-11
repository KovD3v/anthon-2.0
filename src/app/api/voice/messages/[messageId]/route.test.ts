import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  userFindUnique: vi.fn(),
  messageFindFirst: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    message: { findFirst: mocks.messageFindFirst },
  },
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

  it("proxies audio with private caching and range support", async () => {
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
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");
    expect(response.headers.get("content-range")).toBe("bytes 0-1/2");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2]),
    );
  });
});
