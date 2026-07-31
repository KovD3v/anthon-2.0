import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { attachment: { findMany: mocks.findMany } },
}));

import {
  MAX_WEB_ATTACHMENT_ID_LENGTH,
  MAX_WEB_MESSAGE_ATTACHMENTS,
  resolveOwnedWebMessageParts,
  WebAttachmentInputError,
} from "./attachment-input";

describe("resolveOwnedWebMessageParts", () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
  });

  it("replaces every client-controlled URL and metadata with the owned row", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "att-1",
        name: "owned.pdf",
        contentType: "application/pdf",
        size: 12,
        blobUrl:
          "https://store.public.blob.vercel-storage.com/attachments/user-1/owned.pdf",
        messageId: null,
      },
    ]);

    const resolved = await resolveOwnedWebMessageParts(
      {
        id: "message-1",
        role: "user",
        parts: [
          { type: "text", text: "summarize" },
          {
            type: "file",
            attachmentId: "att-1",
            data: "http://127.0.0.1/private",
            mimeType: "image/svg+xml",
            name: "spoofed.svg",
            size: 999_999,
          } as never,
        ],
      },
      "user-1",
    );

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["att-1"] }, userId: "user-1" },
      select: {
        id: true,
        name: true,
        contentType: true,
        size: true,
        blobUrl: true,
        messageId: true,
      },
    });
    expect(resolved.aiParts[1]).toEqual({
      type: "file",
      attachmentId: "att-1",
      data: expect.stringContaining("store.public.blob.vercel-storage.com"),
      mimeType: "application/pdf",
      name: "owned.pdf",
      size: 12,
    });
    expect(JSON.stringify(resolved)).not.toContain("127.0.0.1");
    expect(JSON.stringify(resolved)).not.toContain("spoofed.svg");
  });

  it("rejects missing and foreign attachment ids", async () => {
    mocks.findMany.mockResolvedValue([]);

    await expect(
      resolveOwnedWebMessageParts(
        {
          id: "message-1",
          role: "user",
          parts: [
            {
              type: "file",
              attachmentId: "foreign-attachment",
              data: "https://example.com/file.pdf",
              mimeType: "application/pdf",
            } as never,
          ],
        },
        "user-1",
      ),
    ).rejects.toBeInstanceOf(WebAttachmentInputError);
  });

  it("rejects a file part without a durable attachment id", async () => {
    await expect(
      resolveOwnedWebMessageParts(
        {
          id: "message-1",
          role: "user",
          parts: [
            {
              type: "file",
              data: "https://example.com/file.pdf",
              mimeType: "application/pdf",
            } as never,
          ],
        },
        "user-1",
      ),
    ).rejects.toBeInstanceOf(WebAttachmentInputError);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("uses the canonical audio URL and ignores client-provided inline bytes", async () => {
    const wavBytes = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ]);
    mocks.findMany.mockResolvedValue([
      {
        id: "att-audio",
        name: "owned.wav",
        contentType: "audio/wav",
        size: wavBytes.byteLength,
        blobUrl:
          "https://store.public.blob.vercel-storage.com/attachments/owned.wav",
        messageId: null,
      },
    ]);

    const resolved = await resolveOwnedWebMessageParts(
      {
        id: "message-1",
        role: "user",
        parts: [
          {
            type: "file",
            attachmentId: "att-audio",
            mimeType: "image/png",
            name: "spoofed.png",
            size: 999,
            url: `data:audio/wav;base64,${wavBytes.toString("base64")}`,
          } as never,
        ],
      },
      "user-1",
    );

    expect(resolved.aiParts).toEqual([
      {
        type: "file",
        attachmentId: "att-audio",
        data: expect.stringContaining("blob.vercel-storage.com"),
        mimeType: "audio/wav",
        name: "owned.wav",
        size: wavBytes.byteLength,
      },
    ]);
    expect(resolved.persistedParts).toEqual([
      expect.objectContaining({
        data: expect.stringContaining("blob.vercel-storage.com"),
        mimeType: "audio/wav",
        name: "owned.wav",
        size: wavBytes.byteLength,
      }),
    ]);
    expect(JSON.stringify(resolved)).not.toContain(wavBytes.toString("base64"));
  });

  it("rejects attachments linked elsewhere but allows the exact inbound retry", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "att-linked",
        name: "linked.pdf",
        contentType: "application/pdf",
        size: 12,
        blobUrl:
          "https://store.public.blob.vercel-storage.com/attachments/linked.pdf",
        messageId: "inbound-existing",
      },
    ]);
    const message = {
      id: "client-message-1",
      role: "user" as const,
      parts: [{ type: "file", attachmentId: "att-linked" } as never],
    };

    await expect(
      resolveOwnedWebMessageParts(message, "user-1"),
    ).rejects.toBeInstanceOf(WebAttachmentInputError);
    await expect(
      resolveOwnedWebMessageParts(message, "user-1", {
        allowedExistingInboundMessageId: "inbound-existing",
      }),
    ).resolves.toMatchObject({ attachmentIds: ["att-linked"] });
    await expect(
      resolveOwnedWebMessageParts(message, "user-1", {
        allowedExistingInboundMessageId: "different-inbound",
      }),
    ).rejects.toBeInstanceOf(WebAttachmentInputError);
  });

  it("caps attachment count and id length before querying", async () => {
    const buildFile = (attachmentId: string) =>
      ({ type: "file", attachmentId }) as never;

    await expect(
      resolveOwnedWebMessageParts(
        {
          id: "message-1",
          role: "user",
          parts: Array.from(
            { length: MAX_WEB_MESSAGE_ATTACHMENTS + 1 },
            (_, index) => buildFile(`att-${index}`),
          ),
        },
        "user-1",
      ),
    ).rejects.toBeInstanceOf(WebAttachmentInputError);
    await expect(
      resolveOwnedWebMessageParts(
        {
          id: "message-2",
          role: "user",
          parts: [buildFile("x".repeat(MAX_WEB_ATTACHMENT_ID_LENGTH + 1))],
        },
        "user-1",
      ),
    ).rejects.toBeInstanceOf(WebAttachmentInputError);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("caps aggregate canonical attachment bytes", async () => {
    const attachmentIds = ["att-1", "att-2", "att-3", "att-4"];
    mocks.findMany.mockResolvedValue(
      attachmentIds.map((id) => ({
        id,
        name: `${id}.pdf`,
        contentType: "application/pdf",
        size: 8 * 1024 * 1024,
        blobUrl: `https://store.public.blob.vercel-storage.com/attachments/${id}.pdf`,
        messageId: null,
      })),
    );

    await expect(
      resolveOwnedWebMessageParts(
        {
          id: "message-1",
          role: "user",
          parts: attachmentIds.map(
            (attachmentId) => ({ type: "file", attachmentId }) as never,
          ),
        },
        "user-1",
      ),
    ).rejects.toBeInstanceOf(WebAttachmentInputError);
  });

  it("rejects an invalid or oversized canonical attachment size", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "att-oversized",
        name: "oversized.pdf",
        contentType: "application/pdf",
        size: 10 * 1024 * 1024 + 1,
        blobUrl:
          "https://store.public.blob.vercel-storage.com/attachments/oversized.pdf",
        messageId: null,
      },
    ]);

    await expect(
      resolveOwnedWebMessageParts(
        {
          id: "message-1",
          role: "user",
          parts: [{ type: "file", attachmentId: "att-oversized" } as never],
        },
        "user-1",
      ),
    ).rejects.toBeInstanceOf(WebAttachmentInputError);
  });
});
