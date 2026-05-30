import { auth } from "@clerk/nextjs/server";
import { waitUntil } from "@vercel/functions";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import type { Prisma } from "@/generated/prisma";
import { generateChatTitle } from "@/lib/ai/chat-title";
import { trackInboundUserMessageFunnelProgress } from "@/lib/analytics/funnel";
import {
  isBillingSyncStale,
  syncPersonalSubscriptionFromClerk,
} from "@/lib/billing/personal-subscription";
import type { ChannelMessagePart } from "@/lib/channel-flow";
import { runChannelFlow } from "@/lib/channel-flow";
import { persistAssistantOutput } from "@/lib/channel-flow/persistence";
import { prisma } from "@/lib/db";
import { LatencyLogger } from "@/lib/latency-logger";
import { createLogger, withRequestLogContext } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateVoice, trackVoiceUsage } from "@/lib/voice";
import { getVoicePlanConfig } from "@/lib/voice/config";
import { decideWebVoiceMode } from "@/lib/voice/preflight";

const logger = createLogger("ai");

export async function handleWebChatPost(request: Request) {
  return withRequestLogContext(
    request,
    { route: "/api/chat", channel: "WEB" },
    async () => {
      const requestTimer = LatencyLogger.start("🌐 Chat API Request");

      try {
        // Authenticate user with Clerk
        const { userId: clerkId } = await LatencyLogger.measure(
          "Auth: Clerk authentication",
          () => auth(),
          "🌐 Chat API Request",
        );

        if (!clerkId) {
          logger.warn(
            "auth.unauthenticated",
            "Request rejected: unauthenticated",
          );
          return new Response("Unauthorized", { status: 401 });
        }

        logger.debug("auth.authenticated", "Authenticated request", {
          clerkId,
        });

        // Parse request body before DB/rate-limit work so malformed requests
        // do not consume quota or trigger unrelated side effects.
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        // Get or create internal user with subscription info
        const user = await LatencyLogger.measure(
          "DB: Find user",
          async () => {
            const existing = await prisma.user.findUnique({
              where: { clerkId },
              select: {
                id: true,
                role: true,
                isGuest: true,
                billingSyncedAt: true,
                subscription: {
                  select: {
                    status: true,
                    planId: true,
                  },
                },
                preferences: {
                  select: {
                    voiceEnabled: true,
                  },
                },
              },
            });

            if (existing) return existing;

            // Fallback to upsert only if not found (rare case after initial signup)
            return prisma.user.upsert({
              where: { clerkId },
              update: {},
              create: { clerkId },
              select: {
                id: true,
                role: true,
                isGuest: true,
                billingSyncedAt: true,
                subscription: {
                  select: {
                    status: true,
                    planId: true,
                  },
                },
                preferences: {
                  select: {
                    voiceEnabled: true,
                  },
                },
              },
            });
          },
          "🌐 Chat API Request",
        );

        let subscriptionStatus = user.subscription?.status;
        let planId = user.subscription?.planId;
        const shouldSyncSubscription =
          !user.isGuest &&
          isBillingSyncStale(user.billingSyncedAt) &&
          (!subscriptionStatus || !planId || subscriptionStatus === "TRIAL");

        if (shouldSyncSubscription) {
          const syncedSubscription = await LatencyLogger.measure(
            "Billing: Sync personal subscription",
            () =>
              syncPersonalSubscriptionFromClerk({
                userId: user.id,
                clerkUserId: clerkId,
                current: {
                  status: subscriptionStatus,
                  planId,
                },
              }),
            "🌐 Chat API Request",
          );

          subscriptionStatus = syncedSubscription?.status ?? subscriptionStatus;
          planId = syncedSubscription?.planId ?? planId;
        }

        // Check rate limit
        const rateLimitResult = await LatencyLogger.measure(
          "Rate Limit: Check limits",
          () =>
            checkRateLimit(
              user.id,
              subscriptionStatus,
              user.role,
              planId,
              user.isGuest,
            ),
          "🌐 Chat API Request",
        );

        if (!rateLimitResult.allowed) {
          return Response.json(
            {
              error: "Rate limit exceeded",
              reason: rateLimitResult.reason,
              usage: rateLimitResult.usage,
              limits: rateLimitResult.limits,
              upgradeInfo: rateLimitResult.upgradeInfo,
            },
            { status: 429 },
          );
        }

        const { messages, chatId } = body as {
          messages: UIMessage[];
          chatId?: string;
        };

        // Validate messages array
        if (!Array.isArray(messages) || messages.length === 0) {
          return Response.json(
            { error: "messages must be a non-empty array" },
            { status: 400 },
          );
        }

        // Require chatId for the new multi-chat system
        if (!chatId) {
          return Response.json(
            { error: "chatId is required" },
            { status: 400 },
          );
        }

        // Verify chat ownership
        const chat = await LatencyLogger.measure(
          "DB: Verify chat ownership",
          () =>
            prisma.chat.findFirst({
              where: { id: chatId, userId: user.id },
              select: { id: true, title: true, customTitle: true },
            }),
          "🌐 Chat API Request",
        );

        if (!chat) {
          return Response.json(
            { error: "Chat not found or access denied" },
            { status: 404 },
          );
        }

        // Get the last user message
        const lastUserMessage = messages.filter((m) => m.role === "user").pop();

        if (!lastUserMessage) {
          return new Response("No user message provided", { status: 400 });
        }

        // Extract text content from the message parts
        const userMessageText =
          lastUserMessage.parts
            ?.map((part) =>
              part.type === "text" ? (part as { text: string }).text : "",
            )
            .join("") || "";
        const normalizedUserMessageText = userMessageText.trim();

        // Check if message has images
        const hasImages = lastUserMessage.parts?.some((part) => {
          if (part.type === "file") {
            const filePart = part as unknown as { mimeType?: string };
            return filePart.mimeType?.startsWith("image/");
          }
          return false;
        });

        // Check if message has audio files
        const hasAudio = lastUserMessage.parts?.some((part) => {
          if (part.type === "file") {
            const filePart = part as unknown as { mimeType?: string };
            return filePart.mimeType?.startsWith("audio/");
          }
          return false;
        });

        // Check if message has any file attachments
        const hasAttachments = lastUserMessage.parts?.some(
          (part) => part.type === "file",
        );

        // Allow messages with text OR any file attachment
        if (!normalizedUserMessageText && !hasAttachments) {
          return new Response("Empty message", { status: 400 });
        }

        // Save the user message to the database with parts
        const message = await LatencyLogger.measure(
          "DB: Save user message",
          () =>
            prisma.message.create({
              data: {
                userId: user.id,
                chatId,
                channel: "WEB",
                direction: "INBOUND",
                role: "USER",
                type: "TEXT",
                parts: lastUserMessage.parts as Prisma.InputJsonValue,
              },
            }),
          "🌐 Chat API Request",
        );

        waitUntil(
          trackInboundUserMessageFunnelProgress({
            userId: user.id,
            isGuest: user.isGuest,
            userRole: user.role,
            channel: "WEB",
            planId,
            subscriptionStatus,
          }).catch((error) =>
            logger.error(
              "chat.funnel_tracking_failed",
              "Failed tracking funnel progress",
              {
                error,
                userId: user.id,
                messageId: message.id,
              },
            ),
          ),
        );

        // Link attachments to the message
        if (lastUserMessage.parts && Array.isArray(lastUserMessage.parts)) {
          for (const part of lastUserMessage.parts) {
            if (part.type === "file") {
              const filePart = part as unknown as {
                attachmentId?: string;
              };
              if (filePart.attachmentId) {
                const attachment = await prisma.attachment.findFirst({
                  where: { id: filePart.attachmentId },
                  select: {
                    id: true,
                    messageId: true,
                    blobUrl: true,
                    message: {
                      select: {
                        userId: true,
                      },
                    },
                  },
                });

                if (!attachment) {
                  continue;
                }

                if (
                  attachment.message?.userId &&
                  attachment.message.userId !== user.id
                ) {
                  continue;
                }

                await prisma.attachment
                  .update({
                    where: { id: filePart.attachmentId },
                    data: { messageId: message.id },
                  })
                  .catch((error) =>
                    logger.error(
                      "chat.attachment.link_failed",
                      "Failed to link attachment",
                      {
                        error,
                        attachmentId: filePart.attachmentId,
                        messageId: message.id,
                      },
                    ),
                  );
              }
            }
          }
        }

        // Auto-generate or refresh chat title if not manually set by user
        if (!chat.customTitle) {
          const messageCount = await LatencyLogger.measure(
            "DB: Count messages",
            () => prisma.message.count({ where: { chatId } }),
            "🌐 Chat API Request",
          );

          const shouldRefresh =
            messageCount === 1 ||
            messageCount === 2 ||
            messageCount === 4 ||
            (messageCount > 0 && messageCount % 5 === 0);

          if (shouldRefresh) {
            // Use the last few messages for better context on refresh
            const context = messages
              .slice(-3)
              .map((m) => {
                const content =
                  m.parts
                    ?.map((p) =>
                      p.type === "text" ? (p as { text: string }).text : "",
                    )
                    .join("") || "";
                return `${m.role.toUpperCase()}: ${content}`;
              })
              .join("\n");

            waitUntil(
              generateChatTitle(context || normalizedUserMessageText, {
                userId: user.id,
              }).then((title) => {
                prisma.chat
                  .update({
                    where: { id: chatId },
                    data: { title },
                  })
                  .catch((error) =>
                    logger.error(
                      "chat.title.update_failed",
                      "Failed updating generated chat title",
                      { error, chatId },
                    ),
                  );
              }),
            );
          }
        }

        const messageParts: ChannelMessagePart[] = [];
        for (const part of lastUserMessage.parts ?? []) {
          if (part.type === "text") {
            messageParts.push({
              type: "text",
              text: (part as { text: string }).text || "",
            });
            continue;
          }
          if (part.type === "file") {
            const filePart = part as unknown as {
              data?: string;
              url?: string;
              mimeType?: string;
              name?: string;
              size?: number;
              attachmentId?: string;
            };
            const fileData = normalizeFilePartData(filePart);
            messageParts.push({
              type: "file",
              data: fileData,
              mimeType: filePart.mimeType,
              name: filePart.name,
              size: filePart.size,
              attachmentId: filePart.attachmentId,
            });
          }
        }

        const voicePlanConfig = getVoicePlanConfig(
          subscriptionStatus,
          user.role,
          planId,
          user.isGuest,
          rateLimitResult.effectiveEntitlements?.modelTier,
        );
        const voiceDecision = await decideWebVoiceMode({
          userId: user.id,
          userMessage: normalizedUserMessageText,
          recentMessages: getRecentTextMessages(messages),
          userPreferences: {
            voiceEnabled: user.preferences?.voiceEnabled ?? true,
          },
          planConfig: voicePlanConfig,
          planId,
          hasAttachments: Boolean(hasAttachments),
        });

        if (voiceDecision.mode === "VOICE") {
          const voiceResponse = await handleVoiceFirstWebResponse({
            userId: user.id,
            chatId,
            userMessageText: normalizedUserMessageText,
            messageParts,
            rateLimitResult,
            planId,
            userRole: user.role,
            subscriptionStatus,
            isGuest: user.isGuest,
            hasImages,
            hasAudio,
            waitUntil,
          });

          requestTimer.split("Voice response complete");
          return voiceResponse;
        }

        const flowResult = await runChannelFlow({
          channel: "WEB",
          userId: user.id,
          chatId,
          userMessageText: normalizedUserMessageText,
          parts: messageParts,
          rateLimit: {
            allowed: rateLimitResult.allowed,
            effectiveEntitlements: rateLimitResult.effectiveEntitlements,
            upgradeInfo: rateLimitResult.upgradeInfo,
          },
          options: {
            allowAttachments: true,
            allowMemoryExtraction: true,
            allowVoiceOutput: true,
          },
          ai: {
            planId,
            userRole: user.role,
            subscriptionStatus,
            isGuest: user.isGuest,
            hasImages,
            hasAudio,
            responseMode: "text",
          },
          execution: { mode: "stream" },
          persistence: {
            channel: "WEB",
            saveAssistantMessage: true,
            updateChatTimestamp: true,
            revalidateTags: [`chats-${user.id}`, `chat-${chatId}`],
            waitUntil,
          },
        });

        if (!flowResult.streamResult) {
          throw new Error("Missing stream result");
        }

        requestTimer.split("Setup complete");
        return flowResult.streamResult.toUIMessageStreamResponse();
      } catch (error) {
        logger.error("chat.request.failed", "Chat API request failed", {
          error,
        });
        return new Response(
          JSON.stringify({ error: "Internal server error" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    },
  );
}

function normalizeFilePartData(filePart: {
  data?: string;
  url?: string;
  mimeType?: string;
}) {
  if (filePart.data) {
    return filePart.data;
  }

  if (!filePart.url) {
    return undefined;
  }

  if (filePart.mimeType?.startsWith("image/")) {
    return filePart.url;
  }

  if (filePart.url.startsWith("data:") && filePart.url.includes(",")) {
    return filePart.url.split(",")[1];
  }

  return undefined;
}

function getRecentTextMessages(messages: UIMessage[]) {
  return messages.slice(-6).map((message) => ({
    role: message.role,
    content:
      message.parts
        ?.map((part) => (part.type === "text" ? part.text : ""))
        .join("")
        .slice(0, 500) || "",
  }));
}

async function handleVoiceFirstWebResponse({
  userId,
  chatId,
  userMessageText,
  messageParts,
  rateLimitResult,
  planId,
  userRole,
  subscriptionStatus,
  isGuest,
  hasImages,
  hasAudio,
  waitUntil: schedule,
}: {
  userId: string;
  chatId: string;
  userMessageText: string;
  messageParts: ChannelMessagePart[];
  rateLimitResult: Awaited<ReturnType<typeof checkRateLimit>>;
  planId?: string | null;
  userRole?: string;
  subscriptionStatus?: string;
  isGuest?: boolean;
  hasImages?: boolean;
  hasAudio?: boolean;
  waitUntil?: (promise: Promise<unknown>) => void;
}) {
  const flowResult = await runChannelFlow({
    channel: "WEB",
    userId,
    chatId,
    userMessageText,
    parts: messageParts,
    rateLimit: {
      allowed: rateLimitResult.allowed,
      effectiveEntitlements: rateLimitResult.effectiveEntitlements,
      upgradeInfo: rateLimitResult.upgradeInfo,
    },
    options: {
      allowAttachments: true,
      allowMemoryExtraction: true,
      allowVoiceOutput: true,
    },
    ai: {
      planId,
      userRole,
      subscriptionStatus,
      isGuest,
      hasImages,
      hasAudio,
      responseMode: "voice",
      voiceEnabled: true,
    },
    execution: { mode: "text" },
    persistence: {
      channel: "WEB",
      saveAssistantMessage: false,
    },
  });

  const assistantText = flowResult.assistantText.trim();
  if (!assistantText || !flowResult.metrics) {
    throw new Error("Voice response generation produced no assistant text");
  }

  let audio: Awaited<ReturnType<typeof generateVoice>>;
  let blobResult: { url: string };

  try {
    audio = await generateVoice(assistantText);
    const { put } = await import("@vercel/blob");
    blobResult = await put(
      `voice/${chatId}/${Date.now()}.mp3`,
      audio.audioBuffer,
      {
        access: "public",
        contentType: "audio/mpeg",
      },
    );
  } catch (error) {
    logger.error("voice.web_generation_failed", "Web voice generation failed", {
      error,
      userId,
      chatId,
    });

    const fallbackMessage = await persistAssistantOutput({
      userId,
      chatId,
      channel: "WEB",
      text: assistantText,
      userMessageText,
      metrics: flowResult.metrics,
      metadata: {
        responseMode: "text_fallback",
        voiceFailure: true,
      },
      updateChatTimestamp: true,
      revalidateTags: [`chats-${userId}`, `chat-${chatId}`],
      allowMemoryExtraction: true,
      waitUntil: schedule,
    });

    return createTextStreamResponse(fallbackMessage.id, assistantText);
  }

  const assistantMessage = await persistAssistantOutput({
    userId,
    chatId,
    channel: "WEB",
    text: assistantText,
    userMessageText,
    metrics: flowResult.metrics,
    messageType: "AUDIO",
    mediaUrl: blobResult.url,
    mediaType: "audio/mpeg",
    metadata: {
      responseMode: "voice",
      transcript: assistantText,
    },
    updateChatTimestamp: true,
    revalidateTags: [`chats-${userId}`, `chat-${chatId}`],
    allowMemoryExtraction: true,
    waitUntil: schedule,
  });

  await Promise.all([
    prisma.attachment
      .create({
        data: {
          messageId: assistantMessage.id,
          name: "voice.mp3",
          contentType: "audio/mpeg",
          size: audio.audioBuffer.length,
          blobUrl: blobResult.url,
        },
      })
      .catch((error) =>
        logger.error(
          "voice.web_attachment_failed",
          "Failed creating web voice attachment",
          { error, userId, chatId, messageId: assistantMessage.id },
        ),
      ),
    trackVoiceUsage(userId, audio.characterCount, "WEB").catch((error) =>
      logger.error(
        "voice.web_usage_tracking_failed",
        "Failed tracking web voice usage",
        { error, userId, chatId, messageId: assistantMessage.id },
      ),
    ),
  ]);

  return createVoiceFileStreamResponse(assistantMessage.id, blobResult.url);
}

function createVoiceFileStreamResponse(messageId: string, url: string) {
  const stream = createUIMessageStream<UIMessage>({
    execute: ({ writer }) => {
      writer.write({ type: "start", messageId });
      writer.write({ type: "start-step" });
      writer.write({ type: "file", url, mediaType: "audio/mpeg" });
      writer.write({ type: "finish-step" });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

function createTextStreamResponse(messageId: string, text: string) {
  const textPartId = `${messageId}-text`;
  const stream = createUIMessageStream<UIMessage>({
    execute: ({ writer }) => {
      writer.write({ type: "start", messageId });
      writer.write({ type: "start-step" });
      writer.write({ type: "text-start", id: textPartId });
      writer.write({ type: "text-delta", id: textPartId, delta: text });
      writer.write({ type: "text-end", id: textPartId });
      writer.write({ type: "finish-step" });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
