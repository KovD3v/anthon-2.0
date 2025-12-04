/**
 * Admin RAG Documents API
 * List, upload, and manage RAG documents
 */

import { type NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  parseDocument,
  isValidFileType,
  SUPPORTED_EXTENSIONS,
} from "@/lib/rag/parser";
import { addDocument, deleteDocument as removeDocument } from "@/lib/ai/rag";

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
      { status: 500 }
    );
  }
}

// POST /api/admin/rag - Upload and process a new document
export async function POST(req: NextRequest) {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = formData.get("title") as string | null;
    const source = formData.get("source") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file type
    if (!isValidFileType(file.type, file.name)) {
      return NextResponse.json(
        {
          error: `Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(
            ", "
          )}`,
        },
        { status: 400 }
      );
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse document content
    console.log(`[RAG API] Parsing file: ${file.name} (${file.type})`);
    const parsed = await parseDocument(buffer, file.type, file.name);

    if (!parsed.content || parsed.content.trim().length === 0) {
      return NextResponse.json(
        { error: "Could not extract text from file" },
        { status: 400 }
      );
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
      title || parsed.metadata?.title || file.name.replace(/\.[^.]+$/, "");

    // Add document to RAG system (creates embeddings)
    const documentId = await addDocument(
      documentTitle,
      parsed.content,
      source || undefined,
      blobUrl
    );

    // Get chunk count
    const chunkCount = await prisma.ragChunk.count({
      where: { documentId },
    });

    return NextResponse.json({
      success: true,
      document: {
        id: documentId,
        title: documentTitle,
        source,
        url: blobUrl,
        chunkCount,
        pageCount: parsed.metadata?.pageCount,
      },
    });
  } catch (error) {
    console.error("[RAG API] Error uploading document:", error);
    return NextResponse.json(
      { error: "Failed to process document" },
      { status: 500 }
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
        { status: 400 }
      );
    }

    // Get document to check if it has a blob URL
    const document = await prisma.ragDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
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
      { status: 500 }
    );
  }
}
