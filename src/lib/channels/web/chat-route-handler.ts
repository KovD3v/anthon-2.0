import { auth } from "@clerk/nextjs/server";
import { waitUntil } from "@vercel/functions";
import type { UIMessage } from "ai";
import type { Prisma } from "@/generated/prisma";
import { generateChatTitle } from "@/lib/ai/chat-title";
import { trackInboundUserMessageFunnelProgress } from "@/lib/analytics/funnel";
import { runChannelFlow } from "@/lib/channel-flow";
import { prisma } from "@/lib/db";
import { LatencyLogger } from "@/lib/latency-logger";
import { createLogger, withRequestLogContext } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

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

        // Parse request body early (in parallel with DB work)
        const bodyPromise = request.json();

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
                subscription: {
                  select: {
                    status: true,
                    planId: true,
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
                subscription: {
                  select: {
                    status: true,
                    planId: true,
                  },
                },
              },
            });
          },
          "🌐 Chat API Request",
        );

        // Check rate limit
        const rateLimitResult = await LatencyLogger.measure(
          "Rate Limit: Check limits",
          () =>
            checkRateLimit(
              user.id,
              user.subscription?.status,
              user.role,
              user.subscription?.planId,
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

        // Parse request body
        const body = await bodyPromise;
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
        if (!userMessageText && !hasAttachments) {
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
                content: userMessageText,
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
            planId: user.subscription?.planId,
            subscriptionStatus: user.subscription?.status,
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
              generateChatTitle(context || userMessageText).then((title) => {
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

        const messageParts =
          lastUserMessage.parts?.flatMap((part) => {
            if (part.type === "text") {
              return [
                {
                  type: "text" as const,
                  text: (part as { text: string }).text || "",
                },
              ];
            }
            if (part.type === "file") {
              const filePart = part as unknown as {
                data?: string;
                mimeType?: string;
                name?: string;
                size?: number;
                attachmentId?: string;
              };
              return [
                {
                  type: "file" as const,
                  data: filePart.data,
                  mimeType: filePart.mimeType,
                  name: filePart.name,
                  size: filePart.size,
                  attachmentId: filePart.attachmentId,
                },
              ];
            }
            return [];
          }) || [];

        const flowResult = await runChannelFlow({
          channel: "WEB",
          userId: user.id,
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
            planId: user.subscription?.planId,
            userRole: user.role,
            subscriptionStatus: user.subscription?.status,
            isGuest: user.isGuest,
            hasImages,
            hasAudio,
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
