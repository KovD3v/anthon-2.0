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
import { runChannelFlow } from "@/lib/channel-flow";
import { prisma } from "@/lib/db";
import { authenticateGuest } from "@/lib/guest-auth";
import { LatencyLogger } from "@/lib/latency-logger";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 60; // Allow up to 60 seconds for streaming

export async function handleGuestChatPost(request: Request) {
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
          select: { id: true, title: true, customTitle: true },
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
    await LatencyLogger.measure(
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

    // Auto-generate or refresh chat title if not manually set by user
    if (!chat.customTitle) {
      const messageCount = await LatencyLogger.measure(
        "DB: Count messages",
        () => prisma.message.count({ where: { chatId } }),
        "🌐 Guest Chat API Request",
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
              .catch(console.error);
          }),
        );
      }
    }

    const flowResult = await runChannelFlow({
      channel: "WEB_GUEST",
      userId: user.id,
      chatId,
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
      },
      execution: { mode: "stream" },
      persistence: {
        channel: "WEB",
        saveAssistantMessage: true,
        updateChatTimestamp: true,
      },
    });

    if (!flowResult.streamResult) {
      throw new Error("Missing stream result");
    }

    requestTimer.split("Setup complete");
    return flowResult.streamResult.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[Guest Chat API] Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
