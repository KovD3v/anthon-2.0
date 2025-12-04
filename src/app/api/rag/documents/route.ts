/**
 * API endpoint for managing RAG documents.
 * Allows adding, listing, and deleting documents.
 */

import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import {
  addDocument,
  listDocuments,
  deleteDocument,
  updateMissingEmbeddings,
} from "@/lib/ai/rag";

// GET /api/rag/documents - List all documents
export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const documents = await listDocuments();
    return NextResponse.json({ documents });
  } catch (error) {
    console.error("[RAG API] Error listing documents:", error);
    return NextResponse.json(
      { error: "Failed to list documents" },
      { status: 500 }
    );
  }
}

// POST /api/rag/documents - Add a new document
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { title, content, source, url } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: "Title and content are required" },
        { status: 400 }
      );
    }

    const documentId = await addDocument(title, content, source, url);

    return NextResponse.json({
      success: true,
      documentId,
      message: `Document "${title}" added successfully`,
    });
  } catch (error) {
    console.error("[RAG API] Error adding document:", error);
    return NextResponse.json(
      { error: "Failed to add document" },
      { status: 500 }
    );
  }
}

// DELETE /api/rag/documents - Delete a document
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const documentId = searchParams.get("id");

    if (!documentId) {
      return NextResponse.json(
        { error: "Document ID is required" },
        { status: 400 }
      );
    }

    await deleteDocument(documentId);

    return NextResponse.json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    console.error("[RAG API] Error deleting document:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}

// PATCH /api/rag/documents - Update missing embeddings
export async function PATCH() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const updatedCount = await updateMissingEmbeddings();

    return NextResponse.json({
      success: true,
      updatedCount,
      message: `Updated embeddings for ${updatedCount} chunks`,
    });
  } catch (error) {
    console.error("[RAG API] Error updating embeddings:", error);
    return NextResponse.json(
      { error: "Failed to update embeddings" },
      { status: 500 }
    );
  }
}
