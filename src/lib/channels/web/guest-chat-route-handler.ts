/**
 * Guest Chat API Route
 *
 * POST /api/guest/chat - Stream AI chat response for guest users
 *
 * This mirrors the authenticated /api/chat route but:
 * - Uses cookie-based guest authentication
 * - Blocks file attachments (403)
 * - Applies GUEST rate limits
 */

import { waitUntil } from "@vercel/functions";
import type { UIMessage } from "ai";
import type { Prisma, SubscriptionStatus } from "@/generated/prisma";
import { generateChatTitle } from "@/lib/ai/chat-title";
import { trackInboundUserMessageFunnelProgress } from "@/lib/analytics/funnel";
import { runChannelFlow } from "@/lib/channel-flow";
import {
  claimWebInboundMessage,
  createWebTextStreamResponse,
  findExistingWebInboundMessage,
  getWebClientPayloadHash,
  isValidWebClientMessageId,
  textFromPersistedAssistant,
  WebInboundConflictError,
} from "@/lib/channel-flow/web-inbound";
import { ensureConversationThread } from "@/lib/conversations/threads";
import { prisma } from "@/lib/db";
import { GuestCreationDeniedError } from "@/lib/guest-abuse";
import { authenticateGuest } from "@/lib/guest-auth";
import { LatencyLogger } from "@/lib/latency-logger";
import { createLogger, withRequestLogContext } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

/** @lintignore */
export const maxDuration = 60; // Allow up to 60 seconds for streaming
const logger = createLogger("ai");

export async function handleGuestChatPost(request: Request) {
  return withRequestLogContext(
    request,
    { route: "/api/guest/chat", channel: "WEB_GUEST" },
    async () => {
      const requestTimer = LatencyLogger.start("🌐 Guest Chat API Request");

      try {
        // Parse request body before auth/rate-limit work so malformed requests
        // do not create guest state, consume quota, or trigger side effects.
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const { messages, chatId } = body as {
          messages: UIMessage[];
          chatId?: string;
        };

        // Validate structural request input before rate-limit work.
        if (!isValidMessageArray(messages)) {
          return Response.json(
            { error: "messages must be a non-empty array" },
            { status: 400 },
          );
        }

        if (!chatId) {
          return Response.json(
            { error: "chatId is required" },
            { status: 400 },
          );
        }

        // Validate guest message semantics before rate-limit work.
        const lastUserMessage = messages.filter((m) => m.role === "user").pop();

        if (!lastUserMessage) {
          return new Response("No user message provided", { status: 400 });
        }

        if (!isValidWebClientMessageId(lastUserMessage.id)) {
          return Response.json(
            { error: "A valid user message id is required" },
            { status: 400 },
          );
        }
        const clientMessageId = lastUserMessage.id;
        const clientPayloadHash = getWebClientPayloadHash(
          lastUserMessage.parts,
        );

        const hasAttachments = lastUserMessage.parts?.some(
          (part) => part.type === "file",
        );

        if (hasAttachments) {
          return Response.json(
            {
              error: "File uploads are not available for guest users",
              hint: "Sign up to upload files",
            },
            { status: 403 },
          );
        }

        const userMessageText =
          lastUserMessage.parts
            ?.map((part) => (part.type === "text" ? part.text : ""))
            .join("") || "";

        if (!userMessageText.trim()) {
          return new Response("Empty message", { status: 400 });
        }

        // Authenticate guest user via cookies after request-only validation.
        const { user } = await LatencyLogger.measure(
          "Auth: Guest authentication",
          () => authenticateGuest(request),
          "🌐 Guest Chat API Request",
        );

        // Verify chat ownership (guest user owns this chat)
        const chat = await LatencyLogger.measure(
          "DB: Verify chat ownership",
          () =>
            prisma.chat.findFirst({
              where: { id: chatId, userId: user.id },
              select: {
                id: true,
                title: true,
                customTitle: true,
                _count: { select: { messages: true } },
              },
            }),
          "🌐 Guest Chat API Request",
        );

        if (!chat) {
          return Response.json(
            { error: "Chat not found or access denied" },
            { status: 404 },
          );
        }

        const conversationThread = await ensureConversationThread({
          userId: user.id,
          channel: "WEB",
          externalThreadId: chatId,
          chatId,
        });
        let existingInbound: Awaited<
          ReturnType<typeof findExistingWebInboundMessage>
        >;
        try {
          existingInbound = await findExistingWebInboundMessage({
            userId: user.id,
            chatId,
            conversationThreadId: conversationThread.id,
            clientMessageId,
            payloadHash: clientPayloadHash,
          });
        } catch (error) {
          if (error instanceof WebInboundConflictError) {
            return Response.json(
              { error: error.message, reason: error.reason },
              { status: error.status },
            );
          }
          throw error;
        }

        if (existingInbound?.generatedResponse) {
          const savedText = textFromPersistedAssistant(
            existingInbound.generatedResponse,
          );
          if (!savedText.trim()) {
            throw new Error("Persisted assistant response has no text");
          }
          requestTimer.split("Idempotent replay complete");
          return createWebTextStreamResponse(
            existingInbound.generatedResponse.id,
            savedText,
          );
        }

        // Check rate limit after ownership verification so missing or
        // inaccessible chats do not consume quota.
        const rateLimitResult = await LatencyLogger.measure(
          "Rate Limit: Check limits",
          () =>
            checkRateLimit(
              user.id,
              user.subscription?.status,
              user.role,
              user.subscription?.planId,
              true, // isGuest = true
            ),
          "🌐 Guest Chat API Request",
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

        let inboundClaim: Awaited<ReturnType<typeof claimWebInboundMessage>>;
        try {
          inboundClaim = existingInbound
            ? { message: existingInbound, created: false }
            : await claimWebInboundMessage({
                userId: user.id,
                chatId,
                conversationThreadId: conversationThread.id,
                clientMessageId,
                payloadHash: clientPayloadHash,
                parts: lastUserMessage.parts as Prisma.InputJsonValue,
              });
        } catch (error) {
          if (error instanceof WebInboundConflictError) {
            return Response.json(
              { error: error.message, reason: error.reason },
              { status: error.status },
            );
          }
          throw error;
        }
        const message = inboundClaim.message;
        if (message.generatedResponse) {
          const savedText = textFromPersistedAssistant(
            message.generatedResponse,
          );
          if (!savedText.trim()) {
            throw new Error("Persisted assistant response has no text");
          }
          return createWebTextStreamResponse(
            message.generatedResponse.id,
            savedText,
          );
        }

        const requestConversationMessageCount = messages.filter(
          (message) => message.role === "user" || message.role === "assistant",
        ).length;
        if (inboundClaim.created) {
          waitUntil(
            trackInboundUserMessageFunnelProgress({
              userId: user.id,
              isGuest: true,
              userRole: user.role,
              channel: "WEB_GUEST",
              planId: user.subscription?.planId,
              subscriptionStatus:
                (user.subscription?.status as SubscriptionStatus | undefined) ??
                null,
            }).catch((error) =>
              logger.error(
                "guest_chat.funnel_tracking_failed",
                "Failed tracking guest funnel progress",
                {
                  error,
                  userId: user.id,
                  messageId: message.id,
                },
              ),
            ),
          );
        }

        // Auto-generate or refresh chat title if not manually set by user
        if (inboundClaim.created && !chat.customTitle) {
          const shouldRefresh =
            requestConversationMessageCount === 1 ||
            requestConversationMessageCount === 2 ||
            requestConversationMessageCount === 4 ||
            (requestConversationMessageCount > 0 &&
              requestConversationMessageCount % 5 === 0);

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
              generateChatTitle(context || userMessageText, {
                userId: user.id,
              }).then((title) => {
                prisma.chat
                  .update({
                    where: { id: chatId },
                    data: { title },
                  })
                  .catch((error) =>
                    logger.error(
                      "guest_chat.title.update_failed",
                      "Failed updating generated guest chat title",
                      { error, chatId },
                    ),
                  );
              }),
            );
          }
        }

        const flowResult = await runChannelFlow({
          channel: "WEB_GUEST",
          userId: user.id,
          chatId,
          conversationThreadId: conversationThread.id,
          userMessageId: message.id,
          userMessageText,
          parts:
            lastUserMessage.parts?.map((part) => {
              if (part.type === "text") {
                return { type: "text" as const, text: part.text || "" };
              }
              const filePart = part as unknown as {
                data?: string;
                mimeType?: string;
                name?: string;
                size?: number;
              };
              return {
                type: "file" as const,
                data: filePart.data,
                mimeType: filePart.mimeType,
                name: filePart.name,
                size: filePart.size,
              };
            }) || [],
          rateLimit: {
            allowed: rateLimitResult.allowed,
            effectiveEntitlements: rateLimitResult.effectiveEntitlements,
            upgradeInfo: rateLimitResult.upgradeInfo,
          },
          options: {
            allowAttachments: false,
            allowMemoryExtraction: false,
            allowVoiceOutput: false,
          },
          ai: {
            planId: null,
            userRole: "USER",
            subscriptionStatus: undefined,
            isGuest: true,
            hasImages: false,
            hasAudio: false,
            skipConversationHistory: chat._count.messages === 0,
          },
          execution: {
            mode: "stream",
            abortSignal: request.signal,
            waitUntil,
            includeTechnicalMetrics: false,
          },
          persistence: {
            channel: "WEB",
            saveAssistantMessage: true,
            updateChatTimestamp: true,
          },
        });

        if (flowResult.rateLimit) {
          return Response.json(
            {
              error: flowResult.rateLimit.retryable
                ? "Generation already in progress"
                : "Rate limit exceeded",
              reason: flowResult.rateLimit.reason,
              retryable: flowResult.rateLimit.retryable,
              upgradeInfo: flowResult.rateLimit.upgradeInfo,
            },
            { status: flowResult.rateLimit.retryable ? 409 : 429 },
          );
        }

        if (!flowResult.streamResult) {
          throw new Error("Missing stream result");
        }

        requestTimer.split("Setup complete");
        return flowResult.streamResult.toUIMessageStreamResponse();
      } catch (error) {
        if (error instanceof GuestCreationDeniedError) {
          return Response.json(
            { error: error.message },
            { status: error.status },
          );
        }
        logger.error(
          "guest_chat.request.failed",
          "Guest Chat API request failed",
          {
            error,
          },
        );
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

function isValidMessageArray(value: unknown): value is UIMessage[] {
  return Array.isArray(value) && value.length > 0 && value.every(isMessageLike);
}

function isMessageLike(value: unknown): value is UIMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as { role?: unknown; parts?: unknown };
  if (typeof message.role !== "string") {
    return false;
  }

  if (message.parts === undefined) {
    return true;
  }

  return Array.isArray(message.parts) && message.parts.every(isMessagePartLike);
}

function isMessagePartLike(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const part = value as { type?: unknown };
  return typeof part.type === "string";
}
