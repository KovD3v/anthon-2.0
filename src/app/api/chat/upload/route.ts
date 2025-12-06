/**
 * File Upload API Route
 *
 * POST /api/chat/upload - Upload file attachments
 *
 * Uses Vercel Blob for storage. Files are linked to messages.
 */

import { del, put } from "@vercel/blob";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed file types
const ALLOWED_TYPES = [
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  // Documents
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  // Code
  "application/json",
  "text/javascript",
  "text/typescript",
  "text/html",
  "text/css",
  // Office
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

/**
 * POST /api/chat/upload
 * Upload a file to Vercel Blob storage
 *
 * Body: FormData with:
 * - file: File to upload
 * - chatId: Chat ID to associate with
 * - messageId: Optional message ID to associate with
 */
export async function POST(request: Request) {
  const { user, error } = await getAuthUser();

  if (error || !user) {
    return Response.json({ error: error || "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const chatId = formData.get("chatId") as string | null;
    const messageId = formData.get("messageId") as string | null;

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

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
        { status: 404 },
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        {
          error: `File too large. Maximum size is ${
            MAX_FILE_SIZE / 1024 / 1024
          }MB`,
        },
        { status: 400 },
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return Response.json(
        { error: `File type not allowed: ${file.type}` },
        { status: 400 },
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const pathname = `attachments/${user.id}/${chatId}/${timestamp}-${sanitizedName}`;

    // Upload to Vercel Blob
    const blob = await put(pathname, file, {
      access: "public",
      contentType: file.type,
    });

    // Create attachment record - messageId is optional
    const attachmentData: {
      name: string;
      contentType: string;
      size: number;
      blobUrl: string;
      messageId?: string;
    } = {
      name: file.name,
      contentType: file.type,
      size: file.size,
      blobUrl: blob.url,
    };

    if (messageId) {
      attachmentData.messageId = messageId;
    }

    const attachment = await prisma.attachment.create({
      data: attachmentData,
    });

    console.log(
      `[Upload API] File uploaded: ${file.name} (${file.size} bytes)`,
    );

    return Response.json({
      id: attachment.id,
      name: attachment.name,
      contentType: attachment.contentType,
      size: attachment.size,
      url: attachment.blobUrl,
    });
  } catch (err) {
    console.error("[Upload API] Error:", err);
    return Response.json({ error: "Failed to upload file" }, { status: 500 });
  }
}

/**
 * DELETE /api/chat/upload?id=<attachmentId>
 * Delete an attachment from Vercel Blob storage
 */
export async function DELETE(request: Request) {
  const { user, error } = await getAuthUser();

  if (error || !user) {
    return Response.json({ error: error || "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const attachmentId = searchParams.get("id");

  if (!attachmentId) {
    return Response.json(
      { error: "Attachment ID is required" },
      { status: 400 },
    );
  }

  try {
    // Get attachment with message to verify ownership
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        message: {
          select: { userId: true },
        },
      },
    });

    if (!attachment) {
      return Response.json({ error: "Attachment not found" }, { status: 404 });
    }

    // Verify ownership through message
    if (attachment.message?.userId !== user.id) {
      return Response.json({ error: "Access denied" }, { status: 403 });
    }

    // Delete from Vercel Blob
    await del(attachment.blobUrl);

    // Delete from database
    await prisma.attachment.delete({ where: { id: attachmentId } });

    console.log(`[Upload API] File deleted: ${attachment.name}`);

    return Response.json({ success: true });
  } catch (err) {
    console.error("[Upload API] Delete error:", err);
    return Response.json({ error: "Failed to delete file" }, { status: 500 });
  }
}
