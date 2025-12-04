import { auth } from "@clerk/nextjs/server";
import type { UIMessage } from "ai";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { streamChat } from "@/lib/ai/orchestrator";
import { extractAndSaveMemories } from "@/lib/ai/memory-extractor";
import { checkRateLimit, incrementUsage } from "@/lib/rate-limit";
import { generateChatTitle } from "@/lib/ai/context-compactor";

export const maxDuration = 60; // Allow up to 60 seconds for streaming

export async function POST(request: Request) {
  try {
    // Authenticate user with Clerk
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Get or create internal user with subscription info
    let user = await prisma.user.findUnique({
      where: { clerkId },
      include: { subscription: true },
    });

    if (!user) {
      // Create user if doesn't exist
      user = await prisma.user.create({
        data: { clerkId },
        include: { subscription: true },
      });
    }

    // Check rate limit
    const rateLimitResult = await checkRateLimit(
      user.id,
      user.subscription?.status,
      user.role
    );

    if (!rateLimitResult.allowed) {
      return Response.json(
        {
          error: "Rate limit exceeded",
          reason: rateLimitResult.reason,
          usage: rateLimitResult.usage,
          limits: rateLimitResult.limits,
        },
        { status: 429 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { messages, chatId } = body as {
      messages: UIMessage[];
      chatId?: string;
    };

    // Require chatId for the new multi-chat system
    if (!chatId) {
      return Response.json({ error: "chatId is required" }, { status: 400 });
    }

    // Verify chat ownership
    const chat = await prisma.chat.findFirst({
      where: { id: chatId, userId: user.id },
    });

    if (!chat) {
      return Response.json(
        { error: "Chat not found or access denied" },
        { status: 404 }
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

    if (!userMessageText) {
      return new Response("Empty message", { status: 400 });
    }

    // Save the user message to the database with parts
    await prisma.message.create({
      data: {
        userId: user.id,
        chatId,
        channel: "WHATSAPP", // Default channel
        direction: "INBOUND",
        role: "USER",
        type: "TEXT",
        content: userMessageText,
        parts: lastUserMessage.parts as Prisma.InputJsonValue,
      },
    });

    // Auto-generate chat title if this is the first message
    const messageCount = await prisma.message.count({ where: { chatId } });
    if (messageCount === 1 && !chat.title) {
      // Generate title in background
      generateChatTitle(userMessageText).then((title) => {
        prisma.chat
          .update({
            where: { id: chatId },
            data: { title },
          })
          .catch(console.error);
      });
    }

    // Capture userId for the callback (user might be reassigned)
    const currentUserId = user.id;

    // Stream the response from the orchestrator
    // Use onFinish callback to save the response after streaming completes
    const result = await streamChat({
      userId: currentUserId,
      userMessage: userMessageText,
      onFinish: async ({ text, metrics }) => {
        if (text && text.trim().length > 0) {
          try {
            // Save the assistant message with AI tracking metrics
            await prisma.message.create({
              data: {
                userId: currentUserId,
                chatId,
                channel: "WHATSAPP",
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
            });

            // Update chat's updatedAt
            await prisma.chat.update({
              where: { id: chatId },
              data: { updatedAt: new Date() },
            });

            // Increment usage for rate limiting
            await incrementUsage(
              currentUserId,
              metrics.inputTokens,
              metrics.outputTokens,
              metrics.costUsd
            );

            console.log(
              `[Chat API] Assistant message saved: ${text.substring(
                0,
                50
              )}... | tokens: ${metrics.inputTokens}/${
                metrics.outputTokens
              } | RAG: ${
                metrics.ragUsed
                  ? `yes (${metrics.ragChunksCount} chunks)`
                  : "no"
              } | cost: $${metrics.costUsd.toFixed(6)} | time: ${
                metrics.generationTimeMs
              }ms`
            );

            // Extract and save memories in background
            extractAndSaveMemories(currentUserId, userMessageText, text).catch(
              (err) => {
                console.error("[Chat API] Memory extraction error:", err);
              }
            );
          } catch (error) {
            console.error("[Chat API] Error saving assistant message:", error);
          }
        }
      },
    });

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
