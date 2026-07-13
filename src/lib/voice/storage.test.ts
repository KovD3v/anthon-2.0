import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  put: mocks.put,
  get: mocks.get,
  del: mocks.del,
}));

import {
  deletePrivateVoiceBlob,
  getPrivateVoiceBlob,
  isPrivateVoiceBlobUrl,
  putPrivateVoiceBlob,
  VoiceBlobConfigurationError,
} from "./storage";

const privateVoiceUrl =
  "https://store-id.private.blob.vercel-storage.com/voice/chat-1/file.mp3";

describe("voice private storage", () => {
  beforeEach(() => {
    mocks.put.mockReset();
    mocks.get.mockReset();
    mocks.del.mockReset();
    vi.stubEnv("VOICE_BLOB_READ_WRITE_TOKEN", "voice-private-token");
  });

  it("recognizes only private Vercel voice URLs", () => {
    expect(isPrivateVoiceBlobUrl(privateVoiceUrl)).toBe(true);
    expect(
      isPrivateVoiceBlobUrl(
        "https://store-id.public.blob.vercel-storage.com/voice/file.mp3",
      ),
    ).toBe(false);
    expect(
      isPrivateVoiceBlobUrl(
        "https://store-id.private.blob.vercel-storage.com/uploads/file.mp3",
      ),
    ).toBe(false);
    expect(isPrivateVoiceBlobUrl("https://example.com/voice/file.mp3")).toBe(
      false,
    );
  });

  it("uploads voice files privately with the dedicated store token", async () => {
    mocks.put.mockResolvedValue({ url: privateVoiceUrl });

    await putPrivateVoiceBlob("voice/chat-1/response.mp3", Buffer.from("a"));

    expect(mocks.put).toHaveBeenCalledWith(
      "voice/chat-1/response.mp3",
      Buffer.from("a"),
      {
        access: "private",
        token: "voice-private-token",
        contentType: "audio/mpeg",
        addRandomSuffix: true,
        cacheControlMaxAge: 60,
      },
    );
  });

  it("refuses upload when the dedicated private-store credential is absent", async () => {
    vi.stubEnv("VOICE_BLOB_READ_WRITE_TOKEN", "");

    await expect(
      putPrivateVoiceBlob("voice/chat-1/response.mp3", Buffer.from("a")),
    ).rejects.toBeInstanceOf(VoiceBlobConfigurationError);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("refuses paths outside the private voice namespace", async () => {
    await expect(
      putPrivateVoiceBlob("uploads/response.mp3", Buffer.from("a")),
    ).rejects.toBeInstanceOf(VoiceBlobConfigurationError);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("retrieves private voice blobs with the dedicated token and range headers", async () => {
    mocks.get.mockResolvedValue({ statusCode: 200 });

    await getPrivateVoiceBlob(privateVoiceUrl, {
      range: "bytes=2-5",
      ifNoneMatch: '"etag-1"',
    });

    expect(mocks.get).toHaveBeenCalledWith("voice/chat-1/file.mp3", {
      access: "private",
      token: "voice-private-token",
      ifNoneMatch: '"etag-1"',
      headers: { Range: "bytes=2-5" },
    });
  });

  it("does not send a voice-store token to a non-private URL", async () => {
    await expect(
      getPrivateVoiceBlob("https://example.com/voice.mp3"),
    ).rejects.toBeInstanceOf(VoiceBlobConfigurationError);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("deletes private voice blobs using the dedicated store token", async () => {
    mocks.del.mockResolvedValue(undefined);

    await deletePrivateVoiceBlob(privateVoiceUrl);

    expect(mocks.del).toHaveBeenCalledWith("voice/chat-1/file.mp3", {
      token: "voice-private-token",
    });
  });
});
