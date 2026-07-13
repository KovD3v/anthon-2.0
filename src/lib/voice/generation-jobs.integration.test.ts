import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createChat,
  createMessage,
  createUser,
  resetIntegrationDb,
} from "@/test/integration/factories";

const mocks = vi.hoisted(() => ({
  publishToQueue: vi.fn(),
  generateVoice: vi.fn(),
  putPrivateVoiceBlob: vi.fn(),
  deletePrivateVoiceBlob: vi.fn(),
}));

vi.mock("@/lib/qstash", () => ({
  publishToQueue: mocks.publishToQueue,
}));

vi.mock("./elevenlabs", () => ({
  generateVoice: mocks.generateVoice,
}));

vi.mock("./storage", () => ({
  putPrivateVoiceBlob: mocks.putPrivateVoiceBlob,
  deletePrivateVoiceBlob: mocks.deletePrivateVoiceBlob,
  isPrivateVoiceBlobUrl: (url: string) =>
    url.startsWith("https://store.private.blob.vercel-storage.com/voice/"),
}));

import { processVoiceGenerationJob } from "./generation-jobs";

const blobUrl =
  "https://store.private.blob.vercel-storage.com/voice/chat-1/message-1.mp3";

describe("integration durable voice generation job", () => {
  beforeEach(async () => {
    await resetIntegrationDb();
    mocks.publishToQueue.mockReset();
    mocks.generateVoice.mockReset();
    mocks.putPrivateVoiceBlob.mockReset();
    mocks.deletePrivateVoiceBlob.mockReset();
    mocks.publishToQueue.mockResolvedValue({ messageId: "qstash-message-1" });
    mocks.generateVoice.mockResolvedValue({
      audioBuffer: Buffer.from("audio"),
      characterCount: 18,
      costUsd: 0.0018,
    });
    mocks.putPrivateVoiceBlob.mockResolvedValue({ url: blobUrl });
    mocks.deletePrivateVoiceBlob.mockResolvedValue(undefined);
  });

  it("attaches and accounts for one audio response across concurrent deliveries", async () => {
    const user = await createUser();
    const chat = await createChat(user.id);
    const message = await createMessage({
      userId: user.id,
      chatId: chat.id,
      role: "ASSISTANT",
      text: "Respira lentamente.",
    });
    const job = await prisma.voiceGenerationJob.create({
      data: {
        messageId: message.id,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const results = await Promise.all([
      processVoiceGenerationJob(message.id),
      processVoiceGenerationJob(message.id),
    ]);

    expect(results).toContain("ready");
    expect(results).toContain("deferred");
    await expect(
      prisma.attachment.count({ where: { messageId: message.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.voiceUsage.count({ where: { voiceGenerationJobId: job.id } }),
    ).resolves.toBe(1);

    const persisted = await prisma.voiceGenerationJob.findUniqueOrThrow({
      where: { id: job.id },
      include: { attachment: true, message: true },
    });
    expect(persisted.status).toBe("READY");
    expect(persisted.attachment?.blobUrl).toBe(blobUrl);
    expect(persisted.message.type).toBe("AUDIO");
    expect(mocks.generateVoice).toHaveBeenCalledTimes(1);
    expect(mocks.putPrivateVoiceBlob).toHaveBeenCalledTimes(1);
  });
});
