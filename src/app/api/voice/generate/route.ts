/**
 * Voice Generation API for Web Channel
 *
 * POST /api/voice/generate
 * Generates voice audio for a message after it's been displayed.
 * Runs through the voice funnel to determine if audio should be generated.
 */

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { LatencyLogger } from "@/lib/latency-logger";
import { createLogger, withRequestLogContext } from "@/lib/logger";
import { getTextFromParts } from "@/lib/utils/message-parts";
import {
  generateVoice,
  getSystemLoad,
  getVoicePlanConfig,
  isElevenLabsConfigured,
  shouldGenerateVoice,
  trackVoiceUsage,
} from "@/lib/voice";
import { scheduleVoiceGenerationJob } from "@/lib/voice/generation-jobs";
import {
  deletePrivateVoiceBlob,
  putPrivateVoiceBlob,
} from "@/lib/voice/storage";

const logger = createLogger("voice");

export async function POST(request: Request) {
  return withRequestLogContext(
    request,
    { route: "/api/voice/generate", channel: "WEB" },
    async () => {
      const requestTimer = LatencyLogger.start("🌐 Voice API Request");

      try {
        // Authenticate user
        const { userId: clerkId } = await LatencyLogger.measure(
          "Auth: Clerk",
          async () => auth(),
          "🌐 Voice API Request",
        );
        if (!clerkId) {
          logger.warn(
            "auth.unauthenticated",
            "Voice generation rejected: unauthenticated",
          );
          requestTimer.end();
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        logger.debug("auth.authenticated", "Voice request authenticated", {
          clerkId,
        });

        // Check if Eleven Labs is configured
        if (!isElevenLabsConfigured()) {
          requestTimer.end();
          return Response.json(
            {
              error: "Voice generation not configured",
              shouldGenerateVoice: false,
            },
            { status: 200 },
          );
        }

        // Parse request body
        let body: { messageId: string; userMessage?: string };
        try {
          const parsedBody = await request.json();
          if (
            !parsedBody ||
            typeof parsedBody !== "object" ||
            Array.isArray(parsedBody)
          ) {
            requestTimer.end();
            return Response.json(
              { error: "Invalid request body" },
              { status: 400 },
            );
          }

          const rawBody = parsedBody as Record<string, unknown>;
          if (
            rawBody.messageId !== undefined &&
            typeof rawBody.messageId !== "string"
          ) {
            requestTimer.end();
            return Response.json(
              { error: "messageId must be a string" },
              { status: 400 },
            );
          }

          if (
            rawBody.userMessage !== undefined &&
            typeof rawBody.userMessage !== "string"
          ) {
            requestTimer.end();
            return Response.json(
              { error: "userMessage must be a string" },
              { status: 400 },
            );
          }

          body = {
            messageId: rawBody.messageId ?? "",
            userMessage: rawBody.userMessage,
          };
        } catch {
          requestTimer.end();
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        if (!body.messageId) {
          requestTimer.end();
          return Response.json(
            { error: "messageId is required" },
            { status: 400 },
          );
        }

        logger.info(
          "voice.request.started",
          "Voice generation request started",
          {
            clerkId,
            messageId: body.messageId,
          },
        );

        // Fetch all necessary data in parallel
        const [user, message] = await LatencyLogger.measure(
          "DB: Fetch User & Message",
          async () =>
            Promise.all([
              prisma.user.findUnique({
                where: { clerkId },
                select: {
                  id: true,
                  role: true,
                  isGuest: true,
                  subscription: {
                    select: {
                      status: true,
                      planId: true,
                    },
                  },
                  preferences: {
                    select: { voiceEnabled: true },
                  },
                },
              }),
              prisma.message.findFirst({
                where: {
                  id: body.messageId,
                  role: "ASSISTANT",
                },
                select: {
                  id: true,
                  chatId: true,
                  parts: true,
                  userId: true,
                  voiceGenerationJob: {
                    select: { status: true },
                  },
                },
              }),
            ]),
          "🌐 Voice API Request",
        );

        if (!user) {
          requestTimer.end();
          return Response.json({ error: "User not found" }, { status: 404 });
        }

        const messageText = message ? getTextFromParts(message.parts) : null;
        if (!message || message.userId !== user.id || !messageText) {
          requestTimer.end();
          return Response.json({ error: "Message not found" }, { status: 404 });
        }

        // Web chat messages with a durable voice job must be generated only by
        // that fenced worker. The legacy explicit endpoint remains available
        // for messages without a job, but must never create a second blob,
        // attachment, or usage record for an in-flight automatic generation.
        if (message.voiceGenerationJob) {
          const voiceStatus = message.voiceGenerationJob.status.toLowerCase();

          if (message.voiceGenerationJob.status === "PENDING") {
            void scheduleVoiceGenerationJob(message.id);
          }

          requestTimer.end();
          if (message.voiceGenerationJob.status === "READY") {
            return Response.json({
              shouldGenerateVoice: true,
              voiceStatus,
              audioUrl: `/api/voice/messages/${message.id}`,
            });
          }

          return Response.json(
            {
              shouldGenerateVoice: false,
              voiceStatus,
              deferred:
                message.voiceGenerationJob.status === "PENDING" ||
                message.voiceGenerationJob.status === "PROCESSING",
            },
            {
              status:
                message.voiceGenerationJob.status === "FAILED" ||
                message.voiceGenerationJob.status === "CANCELLED"
                  ? 409
                  : 202,
            },
          );
        }

        const preferences = user.preferences;

        // Run voice funnel (already instrumented internally)
        const result = await shouldGenerateVoice({
          userId: user.id,
          chatId: message.chatId,
          channel: "WEB",
          userMessage: body.userMessage || "",
          assistantText: messageText,
          userPreferences: {
            voiceEnabled: preferences?.voiceEnabled ?? true,
          },
          planConfig: getVoicePlanConfig(
            user.subscription?.status,
            user.role,
            user.subscription?.planId,
            user.isGuest,
          ),
          systemLoad: getSystemLoad, // Pass reference, do not call here
          planId: user.subscription?.planId,
          excludeMessageId: message.id,
        });

        logger.info(
          "voice.funnel.decision",
          "Voice funnel decision completed",
          {
            userId: user.id,
            messageId: message.id,
            shouldGenerateVoice: result.shouldGenerateVoice,
            blockedAt: result.blockedAt,
            reason: result.reason,
          },
        );

        if (!result.shouldGenerateVoice) {
          logger.info(
            "voice.funnel.blocked",
            "Voice generation blocked by funnel",
            {
              blockedAt: result.blockedAt,
              reason: result.reason,
              userId: user.id,
              messageId: message.id,
            },
          );
          requestTimer.end();
          return Response.json({
            shouldGenerateVoice: false,
            blockedAt: result.blockedAt,
            reason: result.reason,
          });
        }

        // Generate voice (already instrumented internally)
        let uploadedBlobUrl: string | undefined;
        try {
          const audio = await generateVoice(messageText);

          // Upload first. Usage is recorded only after the audio has been
          // attached successfully, so a storage failure never consumes quota.
          const blobResult = await LatencyLogger.measure(
            "Blob: Upload Audio",
            async () =>
              putPrivateVoiceBlob(`voice/${message.id}.mp3`, audio.audioBuffer),
            "🌐 Voice API Request",
          );
          uploadedBlobUrl = blobResult.url;

          // Create Attachment record (needs blobResult.url)
          const attachment = await LatencyLogger.measure(
            "DB: Create Attachment",
            async () =>
              prisma.attachment.create({
                data: {
                  messageId: message.id,
                  name: "voice.mp3",
                  contentType: "audio/mpeg",
                  size: audio.audioBuffer.length,
                  blobUrl: blobResult.url,
                },
              }),
            "🌐 Voice API Request",
          );

          // From this point the object is owned by the attachment. Leave the
          // compensating cleanup guard armed only until persistence succeeds.
          uploadedBlobUrl = undefined;

          await LatencyLogger.measure(
            "DB: Track Usage",
            async () =>
              trackVoiceUsage(
                user.id,
                audio.characterCount,
                "WEB",
                audio.costUsd,
              ),
            "🌐 Voice API Request",
          ).catch((error) =>
            logger.error(
              "voice.web_usage_tracking_failed",
              "Voice was delivered but usage tracking failed",
              {
                errorName: error instanceof Error ? error.name : "unknown",
                userId: user.id,
                messageId: message.id,
              },
            ),
          );

          requestTimer.end();
          logger.info(
            "voice.generation.succeeded",
            "Voice generation completed successfully",
            {
              userId: user.id,
              messageId: message.id,
              attachmentId: attachment.id,
              characterCount: audio.characterCount,
            },
          );
          // The provider URL stays server-side. Clients use the authenticated
          // message proxy for subsequent playback.
          return Response.json({
            shouldGenerateVoice: true,
            audio: audio.audioBuffer.toString("base64"),
            mimeType: "audio/mpeg",
            characterCount: audio.characterCount,
            attachmentId: attachment.id,
            audioUrl: `/api/voice/messages/${message.id}`,
          });
        } catch (error) {
          if (uploadedBlobUrl) {
            await deletePrivateVoiceBlob(uploadedBlobUrl).catch(
              (cleanupError) =>
                logger.warn(
                  "voice.web_unattached_blob_cleanup_failed",
                  "Failed deleting a private voice blob after persistence failed",
                  {
                    errorName:
                      cleanupError instanceof Error
                        ? cleanupError.name
                        : "unknown",
                    messageId: message.id,
                  },
                ),
            );
          }
          logger.error("voice.generation.failed", "Voice generation failed", {
            errorName: error instanceof Error ? error.name : "unknown",
            userId: user.id,
            messageId: message.id,
          });
          requestTimer.end();
          return Response.json(
            {
              error: "Voice generation failed",
              shouldGenerateVoice: false,
            },
            { status: 500 },
          );
        }
      } catch (error) {
        logger.error("voice.request.failed", "Unexpected voice API error", {
          errorName: error instanceof Error ? error.name : "unknown",
        });
        requestTimer.end();
        return Response.json(
          { error: "Internal Server Error" },
          { status: 500 },
        );
      }
    },
  );
}
