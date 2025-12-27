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
import {
  generateVoice,
  getSystemLoad,
  getVoicePlanConfig,
  isElevenLabsConfigured,
  shouldGenerateVoice,
  trackVoiceUsage,
} from "@/lib/voice";

export async function POST(request: Request) {
  const requestTimer = LatencyLogger.start("🌐 Voice API Request");

  try {
    // Authenticate user
    const { userId: clerkId } = await LatencyLogger.measure(
      "Auth: Clerk",
      async () => auth(),
      "🌐 Voice API Request",
    );
    if (!clerkId) {
      requestTimer.end();
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      body = await request.json();
    } catch {
      requestTimer.end();
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.messageId) {
      requestTimer.end();
      return Response.json({ error: "messageId is required" }, { status: 400 });
    }

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
              content: true,
              userId: true,
            },
          }),
        ]),
      "🌐 Voice API Request",
    );

    if (!user) {
      requestTimer.end();
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    if (!message || message.userId !== user.id || !message.content) {
      requestTimer.end();
      return Response.json({ error: "Message not found" }, { status: 404 });
    }

    const preferences = user.preferences;

    // Run voice funnel (already instrumented internally)
    const result = await shouldGenerateVoice({
      userId: user.id,
      userMessage: body.userMessage || "",
      assistantText: message.content,
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
    });

    if (!result.shouldGenerateVoice) {
      console.log(
        `[Voice API] Blocked at ${result.blockedAt}: ${result.reason}`,
      );
      requestTimer.end();
      return Response.json({
        shouldGenerateVoice: false,
        blockedAt: result.blockedAt,
        reason: result.reason,
      });
    }

    // Generate voice (already instrumented internally)
    try {
      const audio = await generateVoice(message.content);

      // Upload to Vercel Blob and track usage in parallel
      const { put } = await import("@vercel/blob");
      const [blobResult] = await Promise.all([
        LatencyLogger.measure(
          "Blob: Upload Audio",
          async () =>
            put(`voice/${message.id}.mp3`, audio.audioBuffer, {
              access: "public",
              contentType: "audio/mpeg",
            }),
          "🌐 Voice API Request",
        ),
        LatencyLogger.measure(
          "DB: Track Usage",
          async () => trackVoiceUsage(user.id, audio.characterCount, "WEB"),
          "🌐 Voice API Request",
        ),
      ]);

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

      requestTimer.end();
      // Return audio as base64 + attachmentId for persistence
      return Response.json({
        shouldGenerateVoice: true,
        audio: audio.audioBuffer.toString("base64"),
        mimeType: "audio/mpeg",
        characterCount: audio.characterCount,
        attachmentId: attachment.id,
        blobUrl: blobResult.url,
      });
    } catch (error) {
      console.error("[Voice API] Generation failed:", error);
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
    console.error("[Voice API] Unexpected error:", error);
    requestTimer.end();
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
