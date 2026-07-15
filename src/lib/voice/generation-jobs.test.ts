import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publishToQueue: vi.fn(),
  generateVoice: vi.fn(),
  putPrivateVoiceBlob: vi.fn(),
  deletePrivateVoiceBlob: vi.fn(),
  transaction: vi.fn(),
  jobFindUnique: vi.fn(),
  jobFindFirst: vi.fn(),
  jobUpdate: vi.fn(),
  jobUpdateMany: vi.fn(),
  messageUpdate: vi.fn(),
  attachmentCreate: vi.fn(),
  voiceUsageCreate: vi.fn(),
  dailyUsageUpsert: vi.fn(),
  txJobFindFirst: vi.fn(),
  txJobUpdateMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
    voiceGenerationJob: {
      findUnique: mocks.jobFindUnique,
      findFirst: mocks.jobFindFirst,
      update: mocks.jobUpdate,
      updateMany: mocks.jobUpdateMany,
    },
    message: {
      update: mocks.messageUpdate,
    },
  },
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

import {
  enqueueVoiceGenerationJob,
  processVoiceGenerationJob,
  scheduleVoiceGenerationJob,
} from "./generation-jobs";

const blobUrl =
  "https://store.private.blob.vercel-storage.com/voice/chat-1/message-1.mp3";

function createClaimedJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    messageId: "message-1",
    userId: "user-1",
    attempts: 1,
    blobUrl: null,
    audioSize: null,
    characterCount: null,
    costUsd: null,
    queuedAt: new Date("2026-07-13T12:00:00.000Z"),
    startedAt: new Date("2026-07-13T12:00:01.000Z"),
    createdAt: new Date("2026-07-13T11:59:00.000Z"),
    message: {
      id: "message-1",
      userId: "user-1",
      role: "ASSISTANT",
      channel: "WEB",
      parts: [{ type: "text", text: "Respira lentamente." }],
      deletedAt: null,
      chat: { id: "chat-1", deletedAt: null },
    },
    ...overrides,
  };
}

function configureReadyTransaction() {
  mocks.txJobFindFirst.mockResolvedValue({
    id: "job-1",
    message: {
      id: "message-1",
      deletedAt: null,
      metadata: { voice: { status: "processing" } },
      chat: { deletedAt: null },
    },
  });
  mocks.txJobUpdateMany.mockResolvedValue({ count: 1 });
  mocks.attachmentCreate.mockResolvedValue({ id: "attachment-1" });
  mocks.voiceUsageCreate.mockResolvedValue({ id: "usage-1" });
  mocks.dailyUsageUpsert.mockResolvedValue({ id: "daily-1" });
  mocks.messageUpdate.mockResolvedValue({ id: "message-1" });
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      voiceGenerationJob: {
        findFirst: mocks.txJobFindFirst,
        updateMany: mocks.txJobUpdateMany,
      },
      attachment: { create: mocks.attachmentCreate },
      voiceUsage: { create: mocks.voiceUsageCreate },
      dailyUsage: { upsert: mocks.dailyUsageUpsert },
      message: { update: mocks.messageUpdate },
    }),
  );
}

describe("voice generation jobs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }

    mocks.publishToQueue.mockResolvedValue({ messageId: "qstash-message-1" });
    mocks.generateVoice.mockResolvedValue({
      audioBuffer: Buffer.from("audio"),
      characterCount: 18,
      costUsd: 0.0018,
    });
    mocks.putPrivateVoiceBlob.mockResolvedValue({ url: blobUrl });
    mocks.deletePrivateVoiceBlob.mockResolvedValue(undefined);
    mocks.jobUpdateMany.mockResolvedValue({ count: 1 });
    mocks.jobUpdate.mockResolvedValue({ id: "job-1" });
    mocks.messageUpdate.mockResolvedValue({ id: "message-1" });
  });

  it("publishes one durable QStash delivery per pending message", async () => {
    mocks.jobFindUnique.mockResolvedValue({
      status: "PENDING",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(enqueueVoiceGenerationJob("message-1")).resolves.toMatchObject(
      {
        queued: true,
      },
    );

    expect(mocks.publishToQueue).toHaveBeenCalledWith(
      "api/queues/voice",
      { messageId: "message-1" },
      {
        deduplicationId: "voice-generation:message-1",
        retries: 4,
      },
    );
    expect(mocks.jobUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { messageId: "message-1", status: "PENDING" },
        data: { queuedAt: expect.any(Date) },
      }),
    );
  });

  it("processes voice locally without publishing to QStash in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.jobFindFirst.mockResolvedValue(createClaimedJob());
    configureReadyTransaction();

    await expect(
      scheduleVoiceGenerationJob("message-1"),
    ).resolves.toBeUndefined();

    expect(mocks.publishToQueue).not.toHaveBeenCalled();
    expect(mocks.generateVoice).toHaveBeenCalledWith("Respira lentamente.");
    expect(mocks.attachmentCreate).toHaveBeenCalledTimes(1);
  });

  it("lets one concurrent delivery attach and account for the audio once", async () => {
    let claimAttempts = 0;
    mocks.jobUpdateMany.mockImplementation(async ({ where }) => {
      if (where.messageId === "message-1" && where.OR) {
        claimAttempts += 1;
        return { count: claimAttempts === 1 ? 1 : 0 };
      }
      return { count: 1 };
    });
    mocks.jobFindFirst.mockResolvedValue(createClaimedJob());
    mocks.jobFindUnique.mockResolvedValue({
      status: "PROCESSING",
      expiresAt: new Date(Date.now() + 60_000),
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    configureReadyTransaction();

    let generationStarted!: () => void;
    const generationStartedPromise = new Promise<void>((resolve) => {
      generationStarted = resolve;
    });
    let resolveAudio!: (audio: {
      audioBuffer: Buffer;
      characterCount: number;
      costUsd: number;
    }) => void;
    const audioPromise = new Promise<{
      audioBuffer: Buffer;
      characterCount: number;
      costUsd: number;
    }>((resolve) => {
      resolveAudio = resolve;
    });
    mocks.generateVoice.mockImplementation(() => {
      generationStarted();
      return audioPromise;
    });

    const firstDelivery = processVoiceGenerationJob("message-1");
    await generationStartedPromise;

    await expect(processVoiceGenerationJob("message-1")).resolves.toBe(
      "deferred",
    );

    resolveAudio({
      audioBuffer: Buffer.from("audio"),
      characterCount: 18,
      costUsd: 0.0018,
    });
    await expect(firstDelivery).resolves.toBe("ready");

    expect(mocks.generateVoice).toHaveBeenCalledTimes(1);
    expect(mocks.putPrivateVoiceBlob).toHaveBeenCalledTimes(1);
    expect(mocks.attachmentCreate).toHaveBeenCalledTimes(1);
    expect(mocks.voiceUsageCreate).toHaveBeenCalledTimes(1);
    expect(mocks.dailyUsageUpsert).toHaveBeenCalledTimes(1);
  });

  it("schedules a fenced watchdog while another worker owns the lease", async () => {
    const leaseExpiresAt = new Date(Date.now() + 75_000);
    mocks.jobUpdateMany.mockImplementation(async ({ where }) => {
      if (where.messageId === "message-1" && where.OR) {
        return { count: 0 };
      }
      return { count: 1 };
    });
    mocks.jobFindUnique.mockResolvedValue({
      status: "PROCESSING",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      leaseExpiresAt,
    });

    await expect(processVoiceGenerationJob("message-1")).resolves.toBe(
      "deferred",
    );

    expect(mocks.publishToQueue).toHaveBeenCalledWith(
      "api/queues/voice",
      { messageId: "message-1" },
      expect.objectContaining({
        delay: expect.any(Number),
        deduplicationId: `voice-generation-recovery:message-1:${leaseExpiresAt.getTime()}`,
        retries: 4,
      }),
    );
    expect(mocks.generateVoice).not.toHaveBeenCalled();
  });

  it("releases the lease when scheduling its watchdog fails", async () => {
    mocks.jobFindFirst.mockResolvedValue(createClaimedJob());
    mocks.publishToQueue.mockRejectedValueOnce(new Error("QStash unavailable"));

    await expect(processVoiceGenerationJob("message-1")).resolves.toBe("retry");

    expect(mocks.jobUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING",
          errorCode: "QUEUE_UNAVAILABLE",
        }),
      }),
    );
    expect(mocks.generateVoice).not.toHaveBeenCalled();
  });

  it("deletes the uploaded object when final attachment persistence is cancelled", async () => {
    mocks.jobFindFirst.mockResolvedValue(createClaimedJob());
    // Simulate a deletion/soft-deletion observed inside the final transaction.
    mocks.transaction.mockResolvedValue(false);

    await expect(processVoiceGenerationJob("message-1")).resolves.toBe(
      "cancelled",
    );

    expect(mocks.deletePrivateVoiceBlob).toHaveBeenCalledWith(blobUrl);
    expect(mocks.attachmentCreate).not.toHaveBeenCalled();
    expect(mocks.voiceUsageCreate).not.toHaveBeenCalled();
  });

  it("deletes the uploaded object when the worker loses its lease before asset persistence", async () => {
    mocks.jobFindFirst.mockResolvedValue(createClaimedJob());
    mocks.jobUpdateMany.mockImplementation(async ({ data, where }) => {
      if (where.messageId === "message-1" && where.OR) {
        return { count: 1 };
      }
      if (data.blobUrl === blobUrl) {
        return { count: 0 };
      }
      return { count: 1 };
    });

    await expect(processVoiceGenerationJob("message-1")).resolves.toBe(
      "cancelled",
    );

    expect(mocks.deletePrivateVoiceBlob).toHaveBeenCalledWith(blobUrl);
    expect(mocks.attachmentCreate).not.toHaveBeenCalled();
    expect(mocks.voiceUsageCreate).not.toHaveBeenCalled();
  });

  it("releases a transient provider failure back to QStash without accounting", async () => {
    mocks.jobFindFirst.mockResolvedValue(createClaimedJob());
    mocks.generateVoice.mockRejectedValue(new Error("ElevenLabs unavailable"));

    await expect(processVoiceGenerationJob("message-1")).resolves.toBe("retry");

    expect(mocks.jobUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING",
          errorCode: "GENERATION_OR_STORAGE_FAILED",
        }),
      }),
    );
    expect(mocks.attachmentCreate).not.toHaveBeenCalled();
    expect(mocks.voiceUsageCreate).not.toHaveBeenCalled();
  });

  it("deletes an existing unlinked object when a message was deleted before processing", async () => {
    mocks.jobFindFirst.mockResolvedValue(
      createClaimedJob({
        blobUrl,
        message: {
          id: "message-1",
          userId: "user-1",
          role: "ASSISTANT",
          channel: "WEB",
          parts: [{ type: "text", text: "Respira lentamente." }],
          deletedAt: new Date("2026-07-13T12:01:00.000Z"),
          chat: { id: "chat-1", deletedAt: null },
        },
      }),
    );

    await expect(processVoiceGenerationJob("message-1")).resolves.toBe(
      "cancelled",
    );

    expect(mocks.generateVoice).not.toHaveBeenCalled();
    expect(mocks.deletePrivateVoiceBlob).toHaveBeenCalledWith(blobUrl);
  });
});
