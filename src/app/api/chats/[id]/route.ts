/**
 * Single Chat API Routes
 *
 * GET /api/chats/[id] - Get chat with messages
 * PATCH /api/chats/[id] - Update chat (title, visibility)
 * DELETE /api/chats/[id] - Delete chat and all its messages
 */

import { revalidateTag } from "next/cache";
import { generateChatTitle } from "@/lib/ai/chat-title";
import { getAuthUser } from "@/lib/auth";
import { getFeedbackReasonFromMetadata } from "@/lib/chat-feedback";
import {
  areRoutineProposalsEqual,
  getRoutineProposalFromParts,
  toRoutineCardData,
} from "@/lib/coaching/routine";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";
import { getTextFromParts } from "@/lib/utils/message-parts";
import { deletePrivateVoiceBlobsForMessages } from "@/lib/voice/attachment-cleanup";

const chatsLogger = createLogger("ai");

interface RouteParams {
  params: Promise<{ id: string }>;
}

// -----------------------------------------------------
// GET - Get chat with messages
// -----------------------------------------------------

export async function GET(request: Request, { params }: RouteParams) {
  const { user, error } = await getAuthUser();

  if (error || !user) {
    return Response.json({ error: error || "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Parse pagination parameters
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor"); // Message ID to fetch before
  const sourceAssistantMessageId = url.searchParams.get(
    "sourceAssistantMessageId",
  );
  const routineId = url.searchParams.get("routineId");
  if (
    (sourceAssistantMessageId === null) !== (routineId === null) ||
    sourceAssistantMessageId?.trim() === "" ||
    routineId?.trim() === ""
  ) {
    return Response.json(
      {
        error:
          "sourceAssistantMessageId and routineId must be provided together",
      },
      { status: 400 },
    );
  }
  const rawLimit = url.searchParams.get("limit");
  let limit = 50;

  if (rawLimit !== null) {
    const parsedLimit = Number(rawLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
      return Response.json(
        { error: "limit must be a positive integer" },
        { status: 400 },
      );
    }
    limit = Math.min(parsedLimit, 100); // Clamp between 1-100
  }

  try {
    // First fetch the chat to verify access
    const chat = await prisma.chat.findFirst({
      where: {
        id,
        OR: [
          { userId: user.id }, // Owner can always access
          { visibility: "PUBLIC" }, // Public chats are accessible to all
        ],
      },
      select: {
        id: true,
        title: true,
        visibility: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!chat) {
      return Response.json({ error: "Chat not found" }, { status: 404 });
    }
    if (
      sourceAssistantMessageId &&
      (user.isGuest || chat.userId !== user.id || chat.visibility !== "PRIVATE")
    ) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch messages with cursor-based pagination
    // Fetch newest first, then reverse for chronological display
    const messages = await prisma.message.findMany({
      where: {
        chatId: id,
        ...(sourceAssistantMessageId
          ? { id: sourceAssistantMessageId, role: "ASSISTANT" as const }
          : {}),
      },
      orderBy: sourceAssistantMessageId
        ? [{ createdAt: "desc" }, { id: "desc" }]
        : { createdAt: "desc" }, // Newest first
      take: sourceAssistantMessageId ? 1 : limit + 1,
      ...(!sourceAssistantMessageId &&
        cursor && {
          cursor: { id: cursor },
          skip: 1, // Skip the cursor message itself
        }),
      select: {
        id: true,
        role: true,
        parts: true,
        createdAt: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        costUsd: true,
        generationTimeMs: true,
        reasoningTimeMs: true,
        ragUsed: true,
        toolCalls: true,
        feedback: true,
        metadata: true,
        voiceGenerationJob: {
          select: {
            status: true,
            errorCode: true,
          },
        },
        attachments: {
          select: {
            id: true,
            name: true,
            contentType: true,
            size: true,
            blobUrl: true,
          },
        },
      },
    });

    // Determine if more messages exist
    const hasMore = !sourceAssistantMessageId && messages.length > limit;
    const messagesToReturn = hasMore ? messages.slice(0, -1) : messages;
    const nextCursor = hasMore
      ? messagesToReturn[messagesToReturn.length - 1]?.id
      : null;

    // Reverse to chronological order for display
    messagesToReturn.reverse();

    const canReceiveRoutineProposal =
      chat.userId === user.id && chat.visibility === "PRIVATE";
    const canReceivePrivateCoachingData =
      canReceiveRoutineProposal && user.isGuest === false;
    const returnedAssistantMessageIds = messagesToReturn
      .filter((message) => message.role === "ASSISTANT")
      .map((message) => message.id);
    const routines =
      canReceivePrivateCoachingData && returnedAssistantMessageIds.length > 0
        ? await prisma.routine.findMany({
            where: sourceAssistantMessageId
              ? {
                  id: routineId as string,
                  userId: user.id,
                  sourceChatId: chat.id,
                  sourceAssistantMessageId,
                }
              : {
                  userId: user.id,
                  sourceChatId: chat.id,
                  sourceAssistantMessageId: {
                    in: returnedAssistantMessageIds,
                  },
                },
            include: {
              attempts: {
                orderBy: [
                  { attemptedAt: "desc" as const },
                  { id: "desc" as const },
                ],
                take: 1,
              },
            },
            ...(sourceAssistantMessageId ? { take: 2 } : {}),
          })
        : [];

    if (sourceAssistantMessageId) {
      const sourceMessage = messagesToReturn[0];
      const sourceRoutine = routines[0];
      if (
        messagesToReturn.length !== 1 ||
        sourceMessage?.id !== sourceAssistantMessageId ||
        sourceMessage?.role !== "ASSISTANT" ||
        routines.length !== 1 ||
        !sourceRoutine
      ) {
        return Response.json(
          { error: "Routine source not found" },
          { status: 404 },
        );
      }

      const routineCard = toRoutineCardData(sourceRoutine);
      const sourceProposal = getRoutineProposalFromParts(sourceMessage.parts);
      const sourceText = getRoutineSourceText(sourceMessage.parts);
      if (
        !sourceProposal ||
        !sourceText ||
        !areRoutineProposalsEqual(sourceProposal, routineCard.proposal)
      ) {
        return Response.json(
          { error: "Routine source not found" },
          { status: 404 },
        );
      }

      return Response.json({
        id: chat.id,
        title: chat.title ?? "Nuova Chat",
        visibility: chat.visibility,
        isOwner: true,
        createdAt: chat.createdAt.toISOString(),
        updatedAt: chat.updatedAt.toISOString(),
        messages: [
          {
            id: sourceMessage.id,
            role: "assistant",
            content: null,
            parts: [
              { type: "text", text: sourceText },
              { type: "data-coachingRoutine", data: sourceProposal },
            ],
            createdAt: sourceMessage.createdAt.toISOString(),
          },
        ],
        pagination: { hasMore: false, nextCursor: null },
        routines: [routineCard],
      });
    }

    return Response.json({
      id: chat.id,
      title: chat.title ?? "Nuova Chat",
      visibility: chat.visibility,
      isOwner: chat.userId === user.id,
      createdAt: chat.createdAt.toISOString(),
      updatedAt: chat.updatedAt.toISOString(),
      messages: messagesToReturn.map((m) => ({
        id: m.id,
        role: m.role.toLowerCase(),
        parts: canReceiveRoutineProposal
          ? m.parts
          : withoutCoachingRoutineParts(m.parts),
        createdAt: m.createdAt.toISOString(),
        model: m.model,
        usage:
          m.inputTokens !== null
            ? {
                inputTokens: m.inputTokens,
                outputTokens: m.outputTokens,
                cost: m.costUsd,
                generationTimeMs: m.generationTimeMs,
                reasoningTimeMs: m.reasoningTimeMs,
              }
            : undefined,
        ragUsed: m.ragUsed,
        ...(canReceiveRoutineProposal ? { toolCalls: m.toolCalls } : {}),
        feedback: m.feedback,
        feedbackReason: getFeedbackReasonFromMetadata(m.metadata),
        voice: m.voiceGenerationJob
          ? {
              status: m.voiceGenerationJob.status,
              ...(m.voiceGenerationJob.errorCode
                ? { errorCode: m.voiceGenerationJob.errorCode }
                : {}),
              isExplicitRequest: isExplicitVoiceRequest(m.metadata),
            }
          : undefined,
        attachments: m.attachments.map((attachment) => ({
          ...attachment,
          blobUrl: attachment.contentType.startsWith("audio/")
            ? `/api/voice/messages/${m.id}`
            : attachment.blobUrl,
        })),
      })),
      pagination: {
        hasMore,
        nextCursor,
      },
      routines: routines.map(toRoutineCardData),
    });
  } catch (err) {
    chatsLogger.error("get.error", "Failed to fetch chat", { error: err });
    return Response.json({ error: "Failed to fetch chat" }, { status: 500 });
  }
}

function withoutCoachingRoutineParts(parts: unknown): unknown {
  if (!Array.isArray(parts)) return [];

  return parts.filter(
    (part) =>
      !(
        part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "data-coachingRoutine"
      ),
  );
}

function getRoutineSourceText(parts: unknown): string | null {
  if (!Array.isArray(parts)) return null;

  for (const part of parts) {
    if (
      part &&
      typeof part === "object" &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string" &&
      (part as { text: string }).text.trim().length > 0
    ) {
      return (part as { text: string }).text;
    }
  }

  return null;
}

function isExplicitVoiceRequest(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;

  const voice = (metadata as { voice?: unknown }).voice;
  return (
    !!voice &&
    typeof voice === "object" &&
    (voice as { category?: unknown }).category === "VOICE_REQUIRED"
  );
}

// -----------------------------------------------------
// PATCH - Update chat (title, visibility)
// -----------------------------------------------------

export async function PATCH(request: Request, { params }: RouteParams) {
  const { user, error } = await getAuthUser();

  if (error || !user) {
    return Response.json({ error: error || "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Verify ownership
    const chat = await prisma.chat.findFirst({
      where: { id, userId: user.id },
    });

    if (!chat) {
      return Response.json(
        { error: "Chat not found or access denied" },
        { status: 404 },
      );
    }

    let body: Record<string, unknown>;
    try {
      const parsedBody = await request.json();
      if (
        !parsedBody ||
        typeof parsedBody !== "object" ||
        Array.isArray(parsedBody)
      ) {
        return Response.json(
          { error: "Invalid request body" },
          { status: 400 },
        );
      }
      body = parsedBody as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const rawVisibility = body.visibility;
    if (
      rawVisibility !== undefined &&
      rawVisibility !== "PRIVATE" &&
      rawVisibility !== "PUBLIC"
    ) {
      return Response.json({ error: "Invalid visibility" }, { status: 400 });
    }

    if (body.title !== undefined && typeof body.title !== "string") {
      return Response.json(
        { error: "title must be a string" },
        { status: 400 },
      );
    }

    if (
      body.generateTitle !== undefined &&
      typeof body.generateTitle !== "boolean"
    ) {
      return Response.json(
        { error: "generateTitle must be a boolean" },
        { status: 400 },
      );
    }

    const title = body.title;
    const visibility = rawVisibility as "PRIVATE" | "PUBLIC" | undefined;
    const generateTitle = body.generateTitle;

    let newTitle = title;

    // Auto-generate title from first message if requested
    if (generateTitle && !title) {
      const firstUserMessage = await prisma.message.findFirst({
        where: { chatId: id, role: "USER" },
        orderBy: { createdAt: "asc" },
        select: { parts: true },
      });

      const firstUserText = getTextFromParts(firstUserMessage?.parts);
      if (firstUserText) {
        newTitle = await generateChatTitle(firstUserText, { userId: user.id });
      }
    }

    const updatedChat = await prisma.chat.update({
      where: { id },
      data: {
        ...(newTitle !== undefined && { title: newTitle }),
        ...(visibility && { visibility }),
        ...(title !== undefined && !generateTitle && { customTitle: true }),
      },
      select: {
        id: true,
        title: true,
        visibility: true,
        updatedAt: true,
      },
    });

    revalidateTag(`chat-${id}`, "max");
    revalidateTag(`chats-${user.id}`, "max");

    return Response.json({
      id: updatedChat.id,
      title: updatedChat.title ?? "Nuova Chat",
      visibility: updatedChat.visibility,
      updatedAt: updatedChat.updatedAt.toISOString(),
    });
  } catch (err) {
    chatsLogger.error("patch.error", "Failed to update chat", { error: err });
    return Response.json({ error: "Failed to update chat" }, { status: 500 });
  }
}

// -----------------------------------------------------
// DELETE - Delete chat and all its messages
// -----------------------------------------------------

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { user, error } = await getAuthUser();

  if (error || !user) {
    return Response.json({ error: error || "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Verify ownership
    const chat = await prisma.chat.findFirst({
      where: { id, userId: user.id },
    });

    if (!chat) {
      return Response.json(
        { error: "Chat not found or access denied" },
        { status: 404 },
      );
    }

    // A hard chat cascade would remove private-voice references before the
    // retention worker can clean their objects. Keep the chat on storage
    // failure so this destructive operation can be retried safely.
    await deletePrivateVoiceBlobsForMessages({ chatId: id });

    // Delete chat (cascade will delete messages, artifacts, etc.)
    await prisma.chat.delete({
      where: { id },
    });

    try {
      revalidateTag(`chats-${user.id}`, "max");
      revalidateTag(`chat-${id}`, "max");
    } catch (revalidateErr) {
      // Non-fatal: cache invalidation failure shouldn't block the response
      chatsLogger.warn(
        "delete.revalidate_failed",
        "revalidateTag failed after DELETE",
        { error: revalidateErr },
      );
    }

    return Response.json({ success: true });
  } catch (err) {
    chatsLogger.error("delete.error", "Failed to delete chat", { error: err });
    return Response.json({ error: "Failed to delete chat" }, { status: 500 });
  }
}
