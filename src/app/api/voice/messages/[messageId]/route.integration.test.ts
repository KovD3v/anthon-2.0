import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createChat,
  createMessage,
  createUser,
  resetIntegrationDb,
} from "@/test/integration/factories";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getPrivateVoiceBlob: vi.fn(),
  isPrivateVoiceBlobUrl: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/voice/storage", () => ({
  getPrivateVoiceBlob: mocks.getPrivateVoiceBlob,
  isPrivateVoiceBlobUrl: mocks.isPrivateVoiceBlobUrl,
}));

import { GET } from "./route";

const privateVoiceUrl =
  "https://store.private.blob.vercel-storage.com/voice/chat-1/file.mp3";

function routeContext(messageId: string) {
  return { params: Promise.resolve({ messageId }) };
}

function privateBlobResult(bytes = new Uint8Array([1, 2])) {
  const stream = new Response(bytes).body;
  if (!stream) throw new Error("Expected voice test stream");

  return {
    statusCode: 200 as const,
    stream,
    headers: new Headers({
      "Content-Type": "audio/mpeg",
      "Content-Length": String(bytes.byteLength),
      "Content-Range": `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
      "Accept-Ranges": "bytes",
      ETag: '"voice-etag"',
    }),
    blob: { contentType: "audio/mpeg", etag: '"voice-etag"' },
  };
}

async function createPersistedVoiceMessage(
  userId: string,
  visibility: "PRIVATE" | "PUBLIC" = "PRIVATE",
) {
  const chat = await createChat(userId, { visibility });
  const message = await createMessage({
    userId,
    chatId: chat.id,
    role: "ASSISTANT",
    text: "Private coaching answer",
  });
  await prisma.attachment.create({
    data: {
      messageId: message.id,
      name: "voice.mp3",
      contentType: "audio/mpeg",
      size: 2,
      blobUrl: privateVoiceUrl,
    },
  });

  return message;
}

describe("integration /api/voice/messages/[messageId]", () => {
  beforeEach(async () => {
    await resetIntegrationDb();
    mocks.auth.mockReset();
    mocks.getPrivateVoiceBlob.mockReset();
    mocks.isPrivateVoiceBlobUrl.mockReset().mockReturnValue(true);
  });

  it("streams a persisted private voice response to its owner with byte ranges", async () => {
    const owner = await createUser({ clerkId: "clerk-voice-owner" });
    const message = await createPersistedVoiceMessage(owner.id);
    mocks.auth.mockResolvedValue({ userId: owner.clerkId });
    mocks.getPrivateVoiceBlob.mockResolvedValue(privateBlobResult());

    const response = await GET(
      new Request(`http://localhost/api/voice/messages/${message.id}`, {
        headers: { Range: "bytes=0-1" },
      }),
      routeContext(message.id),
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-1/2");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.getPrivateVoiceBlob).toHaveBeenCalledWith(privateVoiceUrl, {
      range: "bytes=0-1",
      ifNoneMatch: null,
    });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2]),
    );
  });

  it("returns 401 anonymously and 404 for another user's private voice", async () => {
    const owner = await createUser({ clerkId: "clerk-voice-private-owner" });
    const viewer = await createUser({ clerkId: "clerk-voice-private-viewer" });
    const message = await createPersistedVoiceMessage(owner.id);

    mocks.auth.mockResolvedValue({ userId: null });
    const anonymousResponse = await GET(
      new Request(`http://localhost/api/voice/messages/${message.id}`),
      routeContext(message.id),
    );
    expect(anonymousResponse.status).toBe(401);

    mocks.auth.mockResolvedValue({ userId: viewer.clerkId });
    const privateResponse = await GET(
      new Request(`http://localhost/api/voice/messages/${message.id}`),
      routeContext(message.id),
    );
    expect(privateResponse.status).toBe(404);
    expect(mocks.getPrivateVoiceBlob).not.toHaveBeenCalled();
  });

  it("allows an authenticated viewer to stream a deliberately public shared chat", async () => {
    const owner = await createUser({ clerkId: "clerk-voice-public-owner" });
    const viewer = await createUser({ clerkId: "clerk-voice-public-viewer" });
    const message = await createPersistedVoiceMessage(owner.id, "PUBLIC");
    mocks.auth.mockResolvedValue({ userId: viewer.clerkId });
    mocks.getPrivateVoiceBlob.mockResolvedValue(privateBlobResult());

    const response = await GET(
      new Request(`http://localhost/api/voice/messages/${message.id}`),
      routeContext(message.id),
    );

    expect(response.status).toBe(206);
    expect(mocks.getPrivateVoiceBlob).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for a missing private object and 502 for an upstream failure", async () => {
    const owner = await createUser({ clerkId: "clerk-voice-upstream-owner" });
    const message = await createPersistedVoiceMessage(owner.id);
    mocks.auth.mockResolvedValue({ userId: owner.clerkId });
    mocks.getPrivateVoiceBlob.mockResolvedValueOnce(null);

    const missingResponse = await GET(
      new Request(`http://localhost/api/voice/messages/${message.id}`),
      routeContext(message.id),
    );
    expect(missingResponse.status).toBe(404);

    mocks.getPrivateVoiceBlob.mockRejectedValueOnce(
      new Error("private store unavailable"),
    );
    const failureResponse = await GET(
      new Request(`http://localhost/api/voice/messages/${message.id}`),
      routeContext(message.id),
    );
    expect(failureResponse.status).toBe(502);
    await expect(failureResponse.text()).resolves.toBe(
      "Audio temporarily unavailable",
    );
  });
});
