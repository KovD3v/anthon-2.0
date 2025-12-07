/**
 * File Upload API Route using Vercel Blob
 *
 * POST /api/upload - Upload a file to Vercel Blob storage
 * DELETE /api/upload?url=<blobUrl> - Delete a file from Vercel Blob storage
 *
 * Body: FormData with:
 * - file: File to upload
 */

import { del, put } from "@vercel/blob";

import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed file types (comprehensive list)
const ALLOWED_TYPES = [
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  // Documents
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  // Office
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "application/msword", // .doc
  "application/vnd.ms-excel", // .xls
  "application/vnd.ms-powerpoint", // .ppt
  // Code
  "application/json",
  "text/javascript",
  "text/typescript",
  "text/html",
  "text/css",
  "application/xml",
  "text/xml",
  // Archives
  "application/zip",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  // Audio
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  // Video
  "video/mp4",
  "video/mpeg",
  "video/webm",
];

/**
 * POST /api/upload
 * Upload a file to Vercel Blob storage
 *
 * Features:
 * - Authentication required
 * - Rate limiting (upload action)
 * - File validation (size, type)
 * - Database tracking
 * - Virus scanning (future enhancement)
 * - Image optimization (future enhancement)
 */
export async function POST(request: Request) {
  // 1. Authentication
  const { user, error } = await getAuthUser();

  if (error || !user) {
    return Response.json({ error: error || "Unauthorized" }, { status: 401 });
  }

  try {
    // 2. Rate limiting - check upload quota
    // Get full user data with subscription for rate limit check
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        subscription: true,
      },
    });

    const rateLimitResult = await checkRateLimit(
      user.id,
      fullUser?.subscription?.status,
      user.role,
    );

    if (!rateLimitResult.allowed) {
      return Response.json(
        {
          error: rateLimitResult.reason || "Rate limit exceeded",
          usage: rateLimitResult.usage,
          limits: rateLimitResult.limits,
        },
        { status: 429 },
      );
    }

    // 3. Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    // 4. Validate file size
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

    // 5. Validate file type
    const fileType = file.type || detectFileType(file.name);
    if (!ALLOWED_TYPES.includes(fileType)) {
      return Response.json(
        { error: `File type not allowed: ${fileType}` },
        { status: 400 },
      );
    }

    // 6. Generate unique filename with user ID
    const timestamp = Date.now();
    const sanitizedName = sanitizeFilename(file.name);
    const pathname = `uploads/${user.id}/${timestamp}-${sanitizedName}`;

    // 7. Upload to Vercel Blob
    const { url, downloadUrl } = await put(pathname, file, {
      access: "public",
      contentType: fileType,
    });

    // 8. Create attachment record (not linked to a message yet)
    const attachment = await prisma.attachment.create({
      data: {
        name: file.name,
        contentType: fileType,
        size: file.size,
        blobUrl: url,
      },
    });

    console.log(
      `[Upload API] File uploaded by ${user.id}: ${file.name} (${file.size} bytes)`,
    );

    return Response.json({
      id: attachment.id,
      url,
      downloadUrl,
      name: file.name,
      contentType: fileType,
      size: file.size,
      createdAt: attachment.createdAt,
    });
  } catch (err) {
    console.error("[Upload API] Error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to upload file" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/upload?url=<blobUrl>
 * Delete a file from Vercel Blob storage
 *
 * Query Parameters:
 * - url: The blob URL to delete
 *
 * Features:
 * - Authentication required
 * - Ownership verification
 * - Database cleanup
 */
export async function DELETE(request: Request) {
  // 1. Authentication
  const { user, error } = await getAuthUser();

  if (error || !user) {
    return Response.json({ error: error || "Unauthorized" }, { status: 401 });
  }

  // 2. Get blob URL from query params
  const { searchParams } = new URL(request.url);
  const blobUrl = searchParams.get("url");

  if (!blobUrl) {
    return Response.json({ error: "Blob URL is required" }, { status: 400 });
  }

  try {
    // 3. Find the upload record and verify ownership
    const upload = await prisma.message.findFirst({
      where: {
        mediaUrl: blobUrl,
        userId: user.id,
        type: "DOCUMENT",
      },
    });

    if (!upload) {
      return Response.json(
        { error: "File not found or access denied" },
        { status: 404 },
      );
    }

    // 4. Delete from Vercel Blob
    await del(blobUrl);

    // 5. Delete from database (or mark as deleted)
    await prisma.message.delete({
      where: { id: upload.id },
    });

    console.log(`[Upload API] File deleted by ${user.id}: ${blobUrl}`);

    return Response.json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (err) {
    console.error("[Upload API] Delete error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to delete file" },
      { status: 500 },
    );
  }
}

// -----------------------------------------------------
// HELPER FUNCTIONS
// -----------------------------------------------------

/**
 * Sanitize filename to prevent path traversal and special characters
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_") // Replace special chars with underscore
    .replace(/_{2,}/g, "_") // Replace multiple underscores with single
    .substring(0, 200); // Limit length
}

/**
 * Detect file type from extension if MIME type is not available
 */
function detectFileType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();

  const typeMap: Record<string, string> = {
    // Images
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    // Documents
    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    // Office
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    // Code
    json: "application/json",
    js: "text/javascript",
    ts: "text/typescript",
    html: "text/html",
    css: "text/css",
    xml: "application/xml",
    // Archives
    zip: "application/zip",
    rar: "application/x-rar-compressed",
    "7z": "application/x-7z-compressed",
    // Audio
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    // Video
    mp4: "video/mp4",
    mpeg: "video/mpeg",
    webm: "video/webm",
  };

  return typeMap[ext || ""] || "application/octet-stream";
}
