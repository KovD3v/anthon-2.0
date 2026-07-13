import { BlobNotFoundError } from "@vercel/blob";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { deletePrivateVoiceBlob, isPrivateVoiceBlobUrl } from "./storage";

const voiceCleanupLogger = createLogger("voice");

/**
 * Deletes private voice objects before a hard cascade removes their database
 * references. Retention cleanup cannot discover a Blob after its attachment
 * or unfinished generation job has been deleted.
 *
 * The caller must stop its database deletion when this throws: keeping the
 * references is safer than making a sensitive object permanently orphaned.
 */
export async function deletePrivateVoiceBlobsForMessages(
  messageWhere: Prisma.MessageWhereInput,
): Promise<number> {
  const [attachments, unfinishedJobs] = await Promise.all([
    prisma.attachment.findMany({
      where: {
        contentType: { startsWith: "audio/" },
        message: { is: messageWhere },
      },
      select: { blobUrl: true },
    }),
    prisma.voiceGenerationJob.findMany({
      where: {
        attachmentId: null,
        blobUrl: { not: null },
        message: { is: messageWhere },
      },
      select: { blobUrl: true },
    }),
  ]);

  const urls = new Set(
    [...attachments, ...unfinishedJobs]
      .map((record) => record.blobUrl)
      .filter(
        (blobUrl): blobUrl is string =>
          typeof blobUrl === "string" && isPrivateVoiceBlobUrl(blobUrl),
      ),
  );

  for (const blobUrl of urls) {
    try {
      await deletePrivateVoiceBlob(blobUrl);
    } catch (error) {
      if (error instanceof BlobNotFoundError) {
        continue;
      }

      voiceCleanupLogger.error(
        "voice.private_blob_delete_failed",
        "Failed deleting private voice media before a database cascade",
        {
          errorName: error instanceof Error ? error.name : "unknown",
        },
      );
      throw error;
    }
  }

  return urls.size;
}
