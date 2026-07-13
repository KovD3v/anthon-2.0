import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  attachmentFindMany: vi.fn(),
  jobFindMany: vi.fn(),
  deletePrivateVoiceBlob: vi.fn(),
  isPrivateVoiceBlobUrl: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  BlobNotFoundError: class BlobNotFoundError extends Error {},
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    attachment: { findMany: mocks.attachmentFindMany },
    voiceGenerationJob: { findMany: mocks.jobFindMany },
  },
}));

vi.mock("./storage", () => ({
  deletePrivateVoiceBlob: mocks.deletePrivateVoiceBlob,
  isPrivateVoiceBlobUrl: mocks.isPrivateVoiceBlobUrl,
}));

import { deletePrivateVoiceBlobsForMessages } from "./attachment-cleanup";

describe("deletePrivateVoiceBlobsForMessages", () => {
  beforeEach(() => {
    mocks.attachmentFindMany.mockReset().mockResolvedValue([]);
    mocks.jobFindMany.mockReset().mockResolvedValue([]);
    mocks.deletePrivateVoiceBlob.mockReset().mockResolvedValue(undefined);
    mocks.isPrivateVoiceBlobUrl
      .mockReset()
      .mockImplementation((url: string) =>
        url.includes(".private.blob.vercel-storage.com/voice/"),
      );
  });

  it("removes each private object once across ready attachments and unfinished jobs", async () => {
    const privateUrl =
      "https://store.private.blob.vercel-storage.com/voice/chat-1/audio.mp3";
    mocks.attachmentFindMany.mockResolvedValue([
      { blobUrl: privateUrl },
      { blobUrl: "https://public.example/audio.mp3" },
    ]);
    mocks.jobFindMany.mockResolvedValue([{ blobUrl: privateUrl }]);

    await expect(
      deletePrivateVoiceBlobsForMessages({ chatId: "chat-1" }),
    ).resolves.toBe(1);

    expect(mocks.deletePrivateVoiceBlob).toHaveBeenCalledTimes(1);
    expect(mocks.deletePrivateVoiceBlob).toHaveBeenCalledWith(privateUrl);
    expect(mocks.attachmentFindMany).toHaveBeenCalledWith({
      where: {
        contentType: { startsWith: "audio/" },
        message: { is: { chatId: "chat-1" } },
      },
      select: { blobUrl: true },
    });
  });

  it("propagates a provider deletion failure before callers hard-delete records", async () => {
    const privateUrl =
      "https://store.private.blob.vercel-storage.com/voice/chat-1/audio.mp3";
    mocks.attachmentFindMany.mockResolvedValue([{ blobUrl: privateUrl }]);
    mocks.deletePrivateVoiceBlob.mockRejectedValue(new Error("store down"));

    await expect(
      deletePrivateVoiceBlobsForMessages({ userId: "user-1" }),
    ).rejects.toThrow("store down");
  });
});
