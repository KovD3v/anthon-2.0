import { auth } from "@clerk/nextjs/server";
import type { UIMessage } from "ai";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import { streamChat } from "@/lib/ai/orchestrator";
import { extractAndSaveMemories } from "@/lib/ai/memory-extractor";

export const maxDuration = 60; // Allow up to 60 seconds for streaming

export async function POST(request: Request) {
  try {
    // Authenticate user with Clerk
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Get or create internal user
    let user = await prisma.user.findUnique({
      where: { clerkId },
    });

    if (!user) {
      // Create user if doesn't exist
      user = await prisma.user.create({
        data: { clerkId },
      });
    }

    // Parse request body
    const body = await request.json();
    const { messages } = body as {
      messages: UIMessage[];
    };

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

    // Save the user message to the database
    await prisma.message.create({
      data: {
        userId: user.id,
        channel: "WHATSAPP", // Default channel
        direction: "INBOUND",
        role: "USER",
        type: "TEXT",
        content: userMessageText,
      },
    });

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
                channel: "WHATSAPP",
                direction: "OUTBOUND",
                role: "ASSISTANT",
                type: "TEXT",
                content: text,
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
