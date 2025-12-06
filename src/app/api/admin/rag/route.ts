/**
 * Admin RAG Documents API
 * List, upload, and manage RAG documents
 */

import { del, put } from "@vercel/blob";
import { type NextRequest, NextResponse } from "next/server";

import { addDocument, deleteDocument as removeDocument } from "@/lib/ai/rag";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  isValidFileType,
  parseDocument,
  SUPPORTED_EXTENSIONS,
} from "@/lib/rag/parser";

// GET /api/admin/rag - List all RAG documents
export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  try {
    const documents = await prisma.ragDocument.findMany({
      include: {
        _count: {
          select: { chunks: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      documents: documents.map((doc) => ({
        id: doc.id,
        title: doc.title,
        source: doc.source,
        url: doc.url,
        chunkCount: doc._count.chunks,
        createdAt: doc.createdAt,
      })),
    });
  } catch (error) {
    console.error("[RAG API] Error listing documents:", error);
    return NextResponse.json(
      { error: "Failed to list documents" },
      { status: 500 },
    );
  }
}

// POST /api/admin/rag - Upload and process document(s)
export async function POST(req: NextRequest) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const source = formData.get("source") as string | null;

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    console.log(`[RAG API] Processing ${files.length} file(s)...`);

    const results: Array<{
      success: boolean;
      fileName: string;
      document?: {
        id: string;
        title: string;
        source: string | null;
        url: string | undefined;
        chunkCount: number;
        pageCount?: number;
      };
      error?: string;
    }> = [];

    // Process each file
    for (const file of files) {
      try {
        // Validate file type
        if (!isValidFileType(file.type, file.name)) {
          results.push({
            success: false,
            fileName: file.name,
            error: `Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(
              ", ",
            )}`,
          });
          continue;
        }

        // Read file buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Parse document content
        console.log(`[RAG API] Parsing file: ${file.name} (${file.type})`);
        const parsed = await parseDocument(buffer, file.type, file.name);

        if (!parsed.content || parsed.content.trim().length === 0) {
          results.push({
            success: false,
            fileName: file.name,
            error: "Could not extract text from file",
          });
          continue;
        }

        // Upload original file to Vercel Blob for storage (optional)
        let blobUrl: string | undefined;
        try {
          const blob = await put(`rag/${Date.now()}-${file.name}`, buffer, {
            access: "public",
            contentType: file.type,
          });
          blobUrl = blob.url;
        } catch (blobError) {
          // Blob upload is optional - continue without it
          console.warn("[RAG API] Blob upload failed (optional):", blobError);
        }

        // Determine title
        const documentTitle =
          parsed.metadata?.title || file.name.replace(/\.[^.]+$/, "");

        // Add document to RAG system (creates embeddings)
        const documentId = await addDocument(
          documentTitle,
          parsed.content,
          source || undefined,
          blobUrl,
        );

        // Get chunk count
        const chunkCount = await prisma.ragChunk.count({
          where: { documentId },
        });

        results.push({
          success: true,
          fileName: file.name,
          document: {
            id: documentId,
            title: documentTitle,
            source,
            url: blobUrl,
            chunkCount,
            pageCount: parsed.metadata?.pageCount,
          },
        });

        console.log(
          `[RAG API] Successfully processed ${file.name}: ${chunkCount} chunks`,
        );
      } catch (fileError) {
        console.error(`[RAG API] Error processing ${file.name}:`, fileError);
        results.push({
          success: false,
          fileName: file.name,
          error:
            fileError instanceof Error
              ? fileError.message
              : "Failed to process file",
        });
      }
    }

    // Return results
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: successCount > 0,
      totalFiles: files.length,
      successCount,
      failureCount,
      results,
    });
  } catch (error) {
    console.error("[RAG API] Error uploading documents:", error);
    return NextResponse.json(
      { error: "Failed to process documents" },
      { status: 500 },
    );
  }
}

// DELETE /api/admin/rag - Delete a document
export async function DELETE(req: NextRequest) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  try {
    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get("id");

    if (!documentId) {
      return NextResponse.json(
        { error: "Document ID required" },
        { status: 400 },
      );
    }

    // Get document to check if it has a blob URL
    const document = await prisma.ragDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    // Delete from Vercel Blob if URL exists
    if (document.url?.includes("vercel-storage.com")) {
      try {
        await del(document.url);
      } catch (blobError) {
        console.warn("[RAG API] Blob delete failed:", blobError);
      }
    }

    // Delete from RAG system
    await removeDocument(documentId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RAG API] Error deleting document:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 },
    );
  }
}
