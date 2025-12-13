import { auth } from "@clerk/nextjs/server";
import { waitUntil } from "@vercel/functions";
import type { UIMessage } from "ai";
import type { Prisma } from "@/generated/prisma";
import { generateChatTitle } from "@/lib/ai/chat-title";
import { extractAndSaveMemories } from "@/lib/ai/memory-extractor";
import { streamChat } from "@/lib/ai/orchestrator";
import { prisma } from "@/lib/db";
import { LatencyLogger } from "@/lib/latency-logger";
import { checkRateLimit, incrementUsage } from "@/lib/rate-limit";

export const maxDuration = 60; // Allow up to 60 seconds for streaming

export async function POST(request: Request) {
  const requestTimer = LatencyLogger.start("🌐 Chat API Request");

  try {
    // Authenticate user with Clerk
    const { userId: clerkId } = await LatencyLogger.measure(
      "Auth: Clerk authentication",
      () => auth(),
      "🌐 Chat API Request",
    );

    if (!clerkId) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Parse request body early (in parallel with DB work)
    const bodyPromise = request.json();

    // Get or create internal user with subscription info
    const user = await LatencyLogger.measure(
      "DB: Find/create user",
      () =>
        prisma.user.upsert({
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
        }),
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
      return Response.json({ error: "chatId is required" }, { status: 400 });
    }

    // Verify chat ownership
    const chat = await LatencyLogger.measure(
      "DB: Verify chat ownership",
      () =>
        prisma.chat.findFirst({
          where: { id: chatId, userId: user.id },
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
        ?.map((part) => (part.type === "text" ? part.text : ""))
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

    // Link attachments to the message
    if (lastUserMessage.parts && Array.isArray(lastUserMessage.parts)) {
      for (const part of lastUserMessage.parts) {
        if (part.type === "file") {
          const filePart = part as unknown as {
            attachmentId?: string;
          };
          if (filePart.attachmentId) {
            await prisma.attachment
              .update({
                where: { id: filePart.attachmentId },
                data: { messageId: message.id },
              })
              .catch((err) =>
                console.error("[Chat API] Failed to link attachment:", err),
              );
          }
        }
      }
    }

    // Auto-generate chat title if this is the first message
    const messageCount = await LatencyLogger.measure(
      "DB: Count messages",
      () => prisma.message.count({ where: { chatId } }),
      "🌐 Chat API Request",
    );
    if (messageCount === 1 && !chat.title) {
      // Generate title in background (wrapped with waitUntil for serverless)
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

    // Capture userId for the callback (user might be reassigned)
    const currentUserId = user.id;
    const userPlanId = user.subscription?.planId;
    const userRole = user.role;
    const subscriptionStatus = user.subscription?.status;
    const isGuest = user.isGuest;

    // Convert UI message parts to simplified format for orchestrator
    const messageParts = lastUserMessage.parts?.map((part) => {
      if (part.type === "text") {
        return { type: "text", text: part.text || "" };
      } else if (part.type === "file") {
        const filePart = part as unknown as {
          data?: string;
          mimeType?: string;
          name?: string;
          size?: number;
          attachmentId?: string;
        };
        return {
          type: "file",
          data: filePart.data,
          mimeType: filePart.mimeType,
          name: filePart.name,
          size: filePart.size,
          attachmentId: filePart.attachmentId,
        };
      }
      return part as { type: string; [key: string]: unknown };
    });

    // Stream the response from the orchestrator
    // Use onFinish callback to save the response after streaming completes
    const result = await streamChat({
      userId: currentUserId,
      userMessage: userMessageText,
      planId: userPlanId,
      userRole,
      subscriptionStatus,
      isGuest,
      hasImages,
      hasAudio,
      messageParts,
      onFinish: async ({ text, metrics }) => {
        const finishTimer = LatencyLogger.start("✏️ onFinish: Save response");
        if (text && text.trim().length > 0) {
          try {
            // Save the assistant message with AI tracking metrics
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
                    // AI tracking fields
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

            // Extract and save memories in background (wrapped with waitUntil for serverless)
            waitUntil(
              extractAndSaveMemories(
                currentUserId,
                userMessageText,
                text,
              ).catch((err) => {
                console.error("[Chat API] Memory extraction error:", err);
              }),
            );
          } catch (error) {
            console.error("[Chat API] Error saving assistant message:", error);
          }
        }
        finishTimer.end();
      },
    });

    requestTimer.split("Setup complete");
    // Return the stream response directly
    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[Chat API] Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
