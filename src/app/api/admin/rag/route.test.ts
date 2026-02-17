import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  ragDocumentFindMany: vi.fn(),
  ragDocumentFindUnique: vi.fn(),
  ragChunkCount: vi.fn(),
  addDocument: vi.fn(),
  removeDocument: vi.fn(),
  isValidFileType: vi.fn(),
  parseDocument: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    ragDocument: {
      findMany: mocks.ragDocumentFindMany,
      findUnique: mocks.ragDocumentFindUnique,
    },
    ragChunk: {
      count: mocks.ragChunkCount,
    },
  },
}));

vi.mock("@/lib/ai/rag", () => ({
  addDocument: mocks.addDocument,
  deleteDocument: mocks.removeDocument,
}));

vi.mock("@/lib/rag/parser", () => ({
  isValidFileType: mocks.isValidFileType,
  parseDocument: mocks.parseDocument,
  SUPPORTED_EXTENSIONS: [".txt", ".md", ".pdf"],
}));

vi.mock("@vercel/blob", () => ({
  put: mocks.put,
  del: mocks.del,
}));

import { DELETE, GET, POST } from "./route";

describe("/api/admin/rag", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.ragDocumentFindMany.mockReset();
    mocks.ragDocumentFindUnique.mockReset();
    mocks.ragChunkCount.mockReset();
    mocks.addDocument.mockReset();
    mocks.removeDocument.mockReset();
    mocks.isValidFileType.mockReset();
    mocks.parseDocument.mockReset();
    mocks.put.mockReset();
    mocks.del.mockReset();

    mocks.requireAdmin.mockResolvedValue({ errorResponse: null });
    mocks.ragDocumentFindMany.mockResolvedValue([
      {
        id: "doc-1",
        title: "Doc One",
        source: "manual",
        url: "https://vercel-storage.com/doc-1",
        createdAt: new Date("2026-02-15T10:00:00.000Z"),
        _count: { chunks: 4 },
      },
    ]);
    mocks.isValidFileType.mockReturnValue(true);
    mocks.parseDocument.mockResolvedValue({
      content: "Extracted content",
      metadata: { title: "Parsed Title", pageCount: 2 },
    });
    mocks.put.mockResolvedValue({ url: "https://vercel-storage.com/rag/file" });
    mocks.addDocument.mockResolvedValue("doc-new");
    mocks.ragChunkCount.mockResolvedValue(8);
    mocks.ragDocumentFindUnique.mockResolvedValue({
      id: "doc-1",
      url: "https://my-project.vercel-storage.com/rag/file",
    });
  });

  it("returns admin error response when unauthorized", async () => {
    mocks.requireAdmin.mockResolvedValue({
      errorResponse: Response.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("lists documents with mapped response fields", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      documents: [
        {
          id: "doc-1",
          title: "Doc One",
          source: "manual",
          url: "https://vercel-storage.com/doc-1",
          chunkCount: 4,
          createdAt: "2026-02-15T10:00:00.000Z",
        },
      ],
    });
  });

  it("POST validates missing files", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/rag", {
        method: "POST",
        body: new FormData(),
      }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "No files provided" });
  });

  it("POST reports unsupported file type", async () => {
    mocks.isValidFileType.mockReturnValue(false);

    const form = new FormData();
    form.append("files", new File(["hello"], "script.exe", { type: "application/octet-stream" }));

    const response = await POST(
      new Request("http://localhost/api/admin/rag", {
        method: "POST",
        body: form,
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: false,
      totalFiles: 1,
      successCount: 0,
      failureCount: 1,
      results: [
        {
          success: false,
          fileName: "script.exe",
          error: "Unsupported file type. Supported: .txt, .md, .pdf",
        },
      ],
    });
  });

  it("POST uploads and indexes valid document", async () => {
    const form = new FormData();
    form.append("source", "docs");
    form.append("files", new File(["Hello markdown"], "guide.md", { type: "text/markdown" }));

    const response = await POST(
      new Request("http://localhost/api/admin/rag", {
        method: "POST",
        body: form,
      }) as never,
    );

    expect(mocks.put).toHaveBeenCalledWith(
      expect.stringContaining("rag/"),
      expect.any(Buffer),
      expect.objectContaining({
        access: "public",
        contentType: "text/markdown",
      }),
    );
    expect(mocks.addDocument).toHaveBeenCalledWith(
      "Parsed Title",
      "Extracted content",
      "docs",
      "https://vercel-storage.com/rag/file",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      totalFiles: 1,
      successCount: 1,
      failureCount: 0,
      results: [
        {
          success: true,
          fileName: "guide.md",
          document: {
            id: "doc-new",
            title: "Parsed Title",
            source: "docs",
            url: "https://vercel-storage.com/rag/file",
            chunkCount: 8,
            pageCount: 2,
          },
        },
      ],
    });
  });

  it("DELETE validates required id", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/admin/rag", { method: "DELETE" }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Document ID required" });
  });

  it("DELETE returns 404 when document is missing", async () => {
    mocks.ragDocumentFindUnique.mockResolvedValue(null);

    const response = await DELETE(
      new Request("http://localhost/api/admin/rag?id=doc-missing", {
        method: "DELETE",
      }) as never,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Document not found" });
  });

  it("DELETE removes blob and rag document", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/admin/rag?id=doc-1", {
        method: "DELETE",
      }) as never,
    );

    expect(mocks.del).toHaveBeenCalledWith(
      "https://my-project.vercel-storage.com/rag/file",
    );
    expect(mocks.removeDocument).toHaveBeenCalledWith("doc-1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("returns 500 on unexpected errors", async () => {
    mocks.ragDocumentFindMany.mockRejectedValue(new Error("db error"));

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to list documents",
    });
  });
});
