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
import type { Prisma } from "@/generated/prisma";
import { generateChatTitle } from "@/lib/ai/chat-title";
import { streamChat } from "@/lib/ai/orchestrator";
import { prisma } from "@/lib/db";
import { authenticateGuest } from "@/lib/guest-auth";
import { LatencyLogger } from "@/lib/latency-logger";
import { checkRateLimit, incrementUsage } from "@/lib/rate-limit";

export const maxDuration = 60; // Allow up to 60 seconds for streaming

export async function POST(request: Request) {
  const requestTimer = LatencyLogger.start("🌐 Guest Chat API Request");

  try {
    // Authenticate guest user via cookies
    const { user } = await LatencyLogger.measure(
      "Auth: Guest authentication",
      () => authenticateGuest(),
      "🌐 Guest Chat API Request",
    );

    // Parse request body early
    const bodyPromise = request.json();

    // Check rate limit with GUEST tier
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

    // Require chatId
    if (!chatId) {
      return Response.json({ error: "chatId is required" }, { status: 400 });
    }

    // Verify chat ownership (guest user owns this chat)
    const chat = await LatencyLogger.measure(
      "DB: Verify chat ownership",
      () =>
        prisma.chat.findFirst({
          where: { id: chatId, userId: user.id },
        }),
      "🌐 Guest Chat API Request",
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

    // Check for file attachments (blocked for guests)
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

    // Extract text content from the message parts
    const userMessageText =
      lastUserMessage.parts
        ?.map((part) => (part.type === "text" ? part.text : ""))
        .join("") || "";

    if (!userMessageText.trim()) {
      return new Response("Empty message", { status: 400 });
    }

    // Save the user message to the database
    const _message = await LatencyLogger.measure(
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
      "🌐 Guest Chat API Request",
    );

    // Auto-generate chat title if this is the first message
    const messageCount = await LatencyLogger.measure(
      "DB: Count messages",
      () => prisma.message.count({ where: { chatId } }),
      "🌐 Guest Chat API Request",
    );

    if (messageCount === 1 && !chat.title) {
      waitUntil(
        generateChatTitle(userMessageText).then((title) => {
          prisma.chat
            .update({
              where: { id: chatId },
              data: { title },
            })
            .catch(console.error);
        }),
      );
    }

    // Capture for callback closure
    const currentUserId = user.id;

    // Stream the response
    const result = await streamChat({
      userId: currentUserId,
      chatId,
      userMessage: userMessageText,
      planId: null,
      userRole: "USER",
      subscriptionStatus: undefined,
      isGuest: true,
      hasImages: false,
      hasAudio: false,
      messageParts: lastUserMessage.parts?.map((part) => {
        if (part.type === "text") {
          return { type: "text", text: part.text || "" };
        }
        return part as { type: string; [key: string]: unknown };
      }),
      onFinish: async ({ text, metrics }) => {
        const finishTimer = LatencyLogger.start("✏️ onFinish: Save response");
        if (text && text.trim().length > 0) {
          try {
            // Save the assistant message
            await LatencyLogger.measure(
              "DB: Save assistant message",
              () =>
                prisma.message.create({
                  data: {
                    userId: currentUserId,
                    chatId,
                    channel: "WEB",
                    direction: "OUTBOUND",
                    role: "ASSISTANT",
                    type: "TEXT",
                    content: text,
                    parts: [{ type: "text", text }] as Prisma.InputJsonValue,
                    model: metrics.model,
                    inputTokens: metrics.inputTokens,
                    outputTokens: metrics.outputTokens,
                    reasoningTokens: metrics.reasoningTokens,
                    reasoningContent: metrics.reasoningContent,
                    toolCalls: metrics.toolCalls as
                      | Prisma.InputJsonValue
                      | undefined,
                    ragUsed: metrics.ragUsed,
                    ragChunksCount: metrics.ragChunksCount,
                    costUsd: metrics.costUsd,
                    generationTimeMs: metrics.generationTimeMs,
                    reasoningTimeMs: metrics.reasoningTimeMs,
                  },
                }),
              "✏️ onFinish: Save response",
            );

            // Update chat's updatedAt
            await LatencyLogger.measure(
              "DB: Update chat timestamp",
              () =>
                prisma.chat.update({
                  where: { id: chatId },
                  data: { updatedAt: new Date() },
                }),
              "✏️ onFinish: Save response",
            );

            // Increment usage for rate limiting
            await LatencyLogger.measure(
              "Usage: Increment counters",
              () =>
                incrementUsage(
                  currentUserId,
                  metrics.inputTokens,
                  metrics.outputTokens,
                  metrics.costUsd,
                ),
              "✏️ onFinish: Save response",
            );

            // Note: Memory extraction skipped for guests (ephemeral sessions)
          } catch (error) {
            console.error(
              "[Guest Chat API] Error saving assistant message:",
              error,
            );
          }
        }
        finishTimer.end();
      },
    });

    requestTimer.split("Setup complete");
    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[Guest Chat API] Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
