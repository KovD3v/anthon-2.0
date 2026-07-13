import { randomUUID } from "node:crypto";
import { type Prisma, VoiceGenerationStatus } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { publishToQueue } from "@/lib/qstash";
import { getTextFromParts } from "@/lib/utils/message-parts";
import { generateVoice } from "./elevenlabs";
import {
  deletePrivateVoiceBlob,
  isPrivateVoiceBlobUrl,
  putPrivateVoiceBlob,
} from "./storage";

const voiceLogger = createLogger("voice");

const VOICE_QUEUE_ENDPOINT = "api/queues/voice";
const VOICE_QUEUE_RETRIES = 4;
const MAX_PROCESSING_ATTEMPTS = VOICE_QUEUE_RETRIES + 1;
// The route has a 60-second execution limit. Keep the lease just beyond that
// limit and schedule a fenced watchdog so a terminated worker cannot strand a
// job in PROCESSING until its 24-hour TTL.
const LEASE_DURATION_MS = 75 * 1000;
const JOB_TTL_MS = 24 * 60 * 60 * 1000;

export type VoiceGenerationResult =
  | "ready"
  | "retry"
  | "failed"
  | "cancelled"
  | "deferred"
  | "skipped";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function utcDateOnly(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Keep the existing voice-decision diagnostics while making the durable state
 * explicit on the persisted assistant message.
 */
export function withVoiceGenerationStatus(
  metadata: unknown,
  status: "pending" | "processing" | "ready" | "failed" | "cancelled",
  additional: Record<string, unknown> = {},
): Prisma.InputJsonObject {
  const base = isRecord(metadata) ? metadata : {};
  const existingVoice = isRecord(base.voice) ? base.voice : {};

  return {
    ...base,
    voice: {
      ...existingVoice,
      ...additional,
      status,
    },
  } as Prisma.InputJsonObject;
}

export function getVoiceGenerationExpiry(now = new Date()): Date {
  return new Date(now.getTime() + JOB_TTL_MS);
}

/**
 * Publish a persisted job. The database job is the source of truth; QStash is
 * only its durable at-least-once delivery mechanism.
 */
export async function enqueueVoiceGenerationJob(messageId: string) {
  const job = await prisma.voiceGenerationJob.findUnique({
    where: { messageId },
    select: { status: true, expiresAt: true },
  });

  if (
    !job ||
    job.status !== VoiceGenerationStatus.PENDING ||
    job.expiresAt <= new Date()
  ) {
    return { queued: false };
  }

  const published = await publishToQueue(
    VOICE_QUEUE_ENDPOINT,
    { messageId },
    {
      deduplicationId: `voice-generation:${messageId}`,
      retries: VOICE_QUEUE_RETRIES,
    },
  );

  await prisma.voiceGenerationJob.updateMany({
    where: { messageId, status: VoiceGenerationStatus.PENDING },
    data: { queuedAt: new Date() },
  });

  return { queued: true, published };
}

/**
 * Every lease has a delayed, idempotent watchdog delivery. A successful
 * worker makes it a no-op; a crashed worker is reclaimed once its lease
 * expires. The lease expiry is part of the deduplication key so the same
 * watchdog can be safely requested by a redelivered queue request.
 */
async function scheduleVoiceGenerationLeaseRecovery(
  messageId: string,
  leaseExpiresAt: Date,
): Promise<void> {
  const delay = Math.max(
    1,
    Math.ceil((leaseExpiresAt.getTime() - Date.now()) / 1000) + 1,
  );

  await publishToQueue(
    VOICE_QUEUE_ENDPOINT,
    { messageId },
    {
      delay,
      deduplicationId: `voice-generation-recovery:${messageId}:${leaseExpiresAt.getTime()}`,
      retries: VOICE_QUEUE_RETRIES,
    },
  );
}

/**
 * Do not hold the chat response open for queue I/O. If queue publication
 * cannot start, record a visible failure while preserving the transcript.
 */
export function scheduleVoiceGenerationJob(
  messageId: string,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<void> {
  const task = enqueueVoiceGenerationJob(messageId)
    .then(() => undefined)
    .catch(async (error) => {
      voiceLogger.error(
        "voice.async_enqueue_failed",
        "Failed to enqueue durable web voice generation",
        {
          errorName: error instanceof Error ? error.name : "unknown",
          messageId,
        },
      );
      await failPendingVoiceGenerationJob(messageId, "QUEUE_UNAVAILABLE");
    });

  if (waitUntil) {
    try {
      waitUntil(task);
      return task;
    } catch {
      // The caller is already returning a transcript. Let the task run in the
      // current runtime rather than losing a persisted pending job.
    }
  }

  void task;
  return task;
}

async function failPendingVoiceGenerationJob(
  messageId: string,
  errorCode: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const job = await tx.voiceGenerationJob.findFirst({
      where: {
        messageId,
        status: VoiceGenerationStatus.PENDING,
      },
      include: { message: { select: { id: true, metadata: true } } },
    });

    if (!job) return;

    await tx.voiceGenerationJob.update({
      where: { id: job.id },
      data: {
        status: VoiceGenerationStatus.FAILED,
        errorCode,
        failedAt: new Date(),
        leaseExpiresAt: null,
        claimToken: null,
      },
    });
    await tx.message.update({
      where: { id: job.message.id },
      data: {
        metadata: withVoiceGenerationStatus(job.message.metadata, "failed", {
          errorCode,
        }),
      },
    });
  });
}

async function markExpiredVoiceGenerationJob(messageId: string) {
  await prisma.voiceGenerationJob.updateMany({
    where: {
      messageId,
      status: {
        in: [VoiceGenerationStatus.PENDING, VoiceGenerationStatus.PROCESSING],
      },
      expiresAt: { lte: new Date() },
    },
    data: {
      status: VoiceGenerationStatus.FAILED,
      errorCode: "EXPIRED",
      failedAt: new Date(),
      leaseExpiresAt: null,
      claimToken: null,
    },
  });
}

async function releaseOrFailVoiceGenerationJob(
  job: { id: string; messageId: string; attempts: number; claimToken: string },
  errorCode: string,
): Promise<"retry" | "failed"> {
  const terminal = job.attempts >= MAX_PROCESSING_ATTEMPTS;
  const updated = await prisma.voiceGenerationJob.updateMany({
    where: {
      id: job.id,
      claimToken: job.claimToken,
      status: VoiceGenerationStatus.PROCESSING,
    },
    data: terminal
      ? {
          status: VoiceGenerationStatus.FAILED,
          errorCode,
          failedAt: new Date(),
          leaseExpiresAt: null,
          claimToken: null,
        }
      : {
          status: VoiceGenerationStatus.PENDING,
          errorCode,
          leaseExpiresAt: null,
          claimToken: null,
        },
  });

  if (terminal && updated.count === 1) {
    const persisted = await prisma.voiceGenerationJob.findUnique({
      where: { id: job.id },
      include: { message: { select: { id: true, metadata: true } } },
    });
    if (persisted) {
      await prisma.message
        .update({
          where: { id: persisted.message.id },
          data: {
            metadata: withVoiceGenerationStatus(
              persisted.message.metadata,
              "failed",
              { errorCode },
            ),
          },
        })
        .catch(() => undefined);
    }
  }

  return terminal ? "failed" : "retry";
}

async function cancelVoiceGenerationJob(job: {
  id: string;
  claimToken: string;
}): Promise<void> {
  await prisma.voiceGenerationJob.updateMany({
    where: {
      id: job.id,
      claimToken: job.claimToken,
      status: VoiceGenerationStatus.PROCESSING,
    },
    data: {
      status: VoiceGenerationStatus.CANCELLED,
      leaseExpiresAt: null,
      claimToken: null,
    },
  });
}

/**
 * Blob writes cannot be part of the database transaction. If the attachment
 * cannot be committed, first detach the uploaded URL from the unfinished job,
 * then best-effort delete the private object so retries never leak or orphan
 * sensitive audio.
 */
async function discardUnattachedVoiceBlob(
  jobId: string,
  blobUrl: string,
  claimToken: string,
): Promise<void> {
  const detached = await prisma.voiceGenerationJob
    .updateMany({
      where: {
        id: jobId,
        blobUrl,
        claimToken,
        attachmentId: null,
        status: {
          in: [
            VoiceGenerationStatus.PENDING,
            VoiceGenerationStatus.PROCESSING,
            VoiceGenerationStatus.FAILED,
            VoiceGenerationStatus.CANCELLED,
          ],
        },
      },
      data: {
        blobUrl: null,
        audioSize: null,
        characterCount: null,
        costUsd: null,
      },
    })
    .catch(() => ({ count: 0 }));

  // A cascaded message deletion removes the job before this cleanup runs. The
  // object is still ours, so delete it even when no row remains to detach.
  if (detached.count === 0) {
    const remaining = await prisma.voiceGenerationJob
      .findUnique({
        where: { id: jobId },
        select: { attachmentId: true, blobUrl: true, claimToken: true },
      })
      .catch(() => null);

    // A newer lease owner may have adopted this already-persisted object. It
    // is no longer orphaned, so a stale worker must never delete it below that
    // owner's feet. Every other no-detach case is either a deleted job or an
    // unlinked object that this worker still owns, and must be removed.
    if (
      remaining?.blobUrl === blobUrl &&
      (remaining.attachmentId || remaining.claimToken !== claimToken)
    ) {
      return;
    }
  }

  await deletePrivateVoiceBlob(blobUrl).catch((error) => {
    voiceLogger.warn(
      "voice.async_blob_cleanup_failed",
      "Failed deleting unlinked private voice blob",
      {
        errorName: error instanceof Error ? error.name : "unknown",
        jobId,
      },
    );
  });
}

/**
 * Claim, generate and attach one private audio object. A stale worker cannot
 * finalize after a newer lease owner takes over because all final writes are
 * conditioned on its unique claim token.
 */
export async function processVoiceGenerationJob(
  messageId: string,
): Promise<VoiceGenerationResult> {
  const now = new Date();
  const claimToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);

  const claimed = await prisma.voiceGenerationJob.updateMany({
    where: {
      messageId,
      expiresAt: { gt: now },
      OR: [
        { status: VoiceGenerationStatus.PENDING },
        {
          status: VoiceGenerationStatus.PROCESSING,
          leaseExpiresAt: { lt: now },
        },
      ],
    },
    data: {
      status: VoiceGenerationStatus.PROCESSING,
      claimToken,
      leaseExpiresAt,
      startedAt: now,
      attempts: { increment: 1 },
      errorCode: null,
    },
  });

  if (claimed.count === 0) {
    const existing = await prisma.voiceGenerationJob.findUnique({
      where: { messageId },
      select: { status: true, expiresAt: true, leaseExpiresAt: true },
    });

    if (
      existing?.status === VoiceGenerationStatus.PROCESSING &&
      existing.leaseExpiresAt &&
      existing.leaseExpiresAt > now &&
      existing.expiresAt > now
    ) {
      // This is a duplicate delivery while another worker owns the lease. Its
      // watchdog is idempotently (re)scheduled so acknowledgement cannot
      // leave a crashed worker's job stranded.
      await scheduleVoiceGenerationLeaseRecovery(
        messageId,
        existing.leaseExpiresAt,
      );
      return "deferred";
    }

    await markExpiredVoiceGenerationJob(messageId);
    return "skipped";
  }

  const job = await prisma.voiceGenerationJob.findFirst({
    where: { messageId, claimToken },
    include: {
      message: {
        select: {
          id: true,
          userId: true,
          role: true,
          channel: true,
          parts: true,
          deletedAt: true,
          chat: { select: { id: true, deletedAt: true } },
        },
      },
    },
  });

  if (
    !job ||
    job.message.deletedAt ||
    !job.message.chat ||
    job.message.chat.deletedAt ||
    job.message.userId !== job.userId ||
    job.message.role !== "ASSISTANT" ||
    job.message.channel !== "WEB"
  ) {
    if (job) {
      if (job.blobUrl && isPrivateVoiceBlobUrl(job.blobUrl)) {
        await discardUnattachedVoiceBlob(job.id, job.blobUrl, claimToken);
      }
      await cancelVoiceGenerationJob({ id: job.id, claimToken });
    }
    return "cancelled";
  }

  // The query above is conditioned on this token. Carry that non-null fact in
  // the local type instead of relying on the nullable database column.
  const claimedJob = { ...job, claimToken };

  try {
    await scheduleVoiceGenerationLeaseRecovery(messageId, leaseExpiresAt);
  } catch (error) {
    voiceLogger.warn(
      "voice.async_recovery_enqueue_failed",
      "Could not schedule the voice generation lease watchdog",
      {
        errorName: error instanceof Error ? error.name : "unknown",
        messageId,
      },
    );
    return await releaseOrFailVoiceGenerationJob(
      claimedJob,
      "QUEUE_UNAVAILABLE",
    );
  }

  const transcript = getTextFromParts(job.message.parts).trim();
  if (!transcript) {
    return await releaseOrFailVoiceGenerationJob(
      claimedJob,
      "EMPTY_TRANSCRIPT",
    );
  }

  let blobUrl = job.blobUrl;
  let audioSize = job.audioSize;
  let characterCount = job.characterCount;
  let costUsd = job.costUsd;

  if (!blobUrl || !isPrivateVoiceBlobUrl(blobUrl)) {
    try {
      const audio = await generateVoice(transcript);
      const blob = await putPrivateVoiceBlob(
        `voice/${job.message.chat.id}/${job.message.id}.mp3`,
        audio.audioBuffer,
      );

      blobUrl = blob.url;
      audioSize = audio.audioBuffer.length;
      characterCount = audio.characterCount;
      costUsd = audio.costUsd;

      const assetSaved = await prisma.voiceGenerationJob.updateMany({
        where: {
          id: job.id,
          claimToken,
          status: VoiceGenerationStatus.PROCESSING,
        },
        data: { blobUrl, audioSize, characterCount, costUsd },
      });

      if (assetSaved.count === 0) {
        await discardUnattachedVoiceBlob(job.id, blobUrl, claimToken);
        return "cancelled";
      }
    } catch (error) {
      if (blobUrl && isPrivateVoiceBlobUrl(blobUrl)) {
        await discardUnattachedVoiceBlob(job.id, blobUrl, claimToken);
      }
      voiceLogger.warn(
        "voice.async_generation_retry",
        "Web voice generation did not complete; retrying when possible",
        {
          errorName: error instanceof Error ? error.name : "unknown",
          messageId,
          attempt: job.attempts,
        },
      );
      return await releaseOrFailVoiceGenerationJob(
        claimedJob,
        "GENERATION_OR_STORAGE_FAILED",
      );
    }
  }

  if (
    !blobUrl ||
    !isPrivateVoiceBlobUrl(blobUrl) ||
    audioSize === null ||
    audioSize === undefined ||
    characterCount === null ||
    characterCount === undefined ||
    costUsd === null ||
    costUsd === undefined
  ) {
    if (blobUrl && isPrivateVoiceBlobUrl(blobUrl)) {
      await discardUnattachedVoiceBlob(job.id, blobUrl, claimToken);
    }
    return await releaseOrFailVoiceGenerationJob(
      claimedJob,
      "INVALID_ASSET_STATE",
    );
  }

  const completedAt = new Date();
  let completed: boolean;
  try {
    completed = await prisma.$transaction(async (tx) => {
      const current = await tx.voiceGenerationJob.findFirst({
        where: {
          id: job.id,
          claimToken,
          status: VoiceGenerationStatus.PROCESSING,
        },
        include: {
          message: {
            select: {
              id: true,
              deletedAt: true,
              metadata: true,
              chat: { select: { deletedAt: true } },
            },
          },
        },
      });

      if (
        !current ||
        current.message.deletedAt ||
        current.message.chat?.deletedAt
      ) {
        return false;
      }

      const attachment = await tx.attachment.create({
        data: {
          messageId: current.message.id,
          name: "voice.mp3",
          contentType: "audio/mpeg",
          size: audioSize,
          blobUrl,
        },
      });

      const finalized = await tx.voiceGenerationJob.updateMany({
        where: {
          id: current.id,
          claimToken,
          status: VoiceGenerationStatus.PROCESSING,
        },
        data: {
          status: VoiceGenerationStatus.READY,
          attachmentId: attachment.id,
          completedAt,
          processingTimeMs: completedAt.getTime() - now.getTime(),
          leaseExpiresAt: null,
          claimToken: null,
          errorCode: null,
        },
      });

      if (finalized.count !== 1) {
        throw new Error("Voice generation claim was lost before finalization");
      }

      await tx.voiceUsage.create({
        data: {
          userId: job.userId,
          characterCount,
          costUsd,
          channel: "WEB",
          voiceGenerationJobId: current.id,
        },
      });

      if (costUsd > 0) {
        const date = utcDateOnly(completedAt);
        await tx.dailyUsage.upsert({
          where: { userId_date: { userId: job.userId, date } },
          create: {
            userId: job.userId,
            date,
            requestCount: 0,
            inputTokens: 0,
            outputTokens: 0,
            reasoningTokens: 0,
            totalCostUsd: costUsd,
            voiceCostUsd: costUsd,
          },
          update: {
            totalCostUsd: { increment: costUsd },
            voiceCostUsd: { increment: costUsd },
          },
        });
      }

      await tx.message.update({
        where: { id: current.message.id },
        data: {
          type: "AUDIO",
          mediaUrl: blobUrl,
          mediaType: "audio/mpeg",
          metadata: withVoiceGenerationStatus(
            current.message.metadata,
            "ready",
            {
              costUsd,
            },
          ),
        },
      });

      return true;
    });
  } catch (error) {
    await discardUnattachedVoiceBlob(job.id, blobUrl, claimToken);
    voiceLogger.warn(
      "voice.async_finalize_retry",
      "Voice audio could not be attached; queue retry will regenerate safely",
      {
        errorName: error instanceof Error ? error.name : "unknown",
        messageId,
      },
    );
    return await releaseOrFailVoiceGenerationJob(
      claimedJob,
      "PERSISTENCE_FAILED",
    );
  }

  if (!completed) {
    await discardUnattachedVoiceBlob(job.id, blobUrl, claimToken);
    await cancelVoiceGenerationJob(claimedJob);
    return "cancelled";
  }

  voiceLogger.info(
    "voice.async_generation_ready",
    "Web voice audio attached to its existing assistant message",
    {
      messageId,
      jobId: job.id,
      queueWaitMs: job.queuedAt
        ? job.startedAt
          ? job.startedAt.getTime() - job.queuedAt.getTime()
          : undefined
        : undefined,
      transcriptToAudioReadyMs: completedAt.getTime() - job.createdAt.getTime(),
      processingTimeMs: completedAt.getTime() - now.getTime(),
    },
  );

  return "ready";
}
