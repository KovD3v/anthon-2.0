import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  listDocuments: vi.fn(),
  addDocument: vi.fn(),
  deleteDocument: vi.fn(),
  updateMissingEmbeddings: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/ai/rag", () => ({
  listDocuments: mocks.listDocuments,
  addDocument: mocks.addDocument,
  deleteDocument: mocks.deleteDocument,
  updateMissingEmbeddings: mocks.updateMissingEmbeddings,
}));

import { DELETE, GET, PATCH, POST } from "./route";

function buildJsonRequest(method: string, body: unknown): Request {
  return new Request("http://localhost/api/rag/documents", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/rag/documents", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.listDocuments.mockReset();
    mocks.addDocument.mockReset();
    mocks.deleteDocument.mockReset();
    mocks.updateMissingEmbeddings.mockReset();

    mocks.auth.mockResolvedValue({ userId: "clerk-1" });
  });

  it("GET returns 401 when unauthorized", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("GET returns documents list", async () => {
    mocks.listDocuments.mockResolvedValue([{ id: "doc-1", title: "Policy" }]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      documents: [{ id: "doc-1", title: "Policy" }],
    });
  });

  it("POST validates required title/content", async () => {
    const response = await POST(
      buildJsonRequest("POST", { title: "Only title", content: "" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Title and content are required",
    });
  });

  it("POST adds a document", async () => {
    mocks.addDocument.mockResolvedValue("doc-123");

    const response = await POST(
      buildJsonRequest("POST", {
        title: "FAQ",
        content: "Some content",
        source: "manual",
        url: "https://example.com/faq",
      }),
    );

    expect(mocks.addDocument).toHaveBeenCalledWith(
      "FAQ",
      "Some content",
      "manual",
      "https://example.com/faq",
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      documentId: "doc-123",
    });
  });

  it("DELETE validates id query parameter", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/rag/documents", { method: "DELETE" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Document ID is required",
    });
  });

  it("DELETE removes a document", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/rag/documents?id=doc-1", {
        method: "DELETE",
      }),
    );

    expect(mocks.deleteDocument).toHaveBeenCalledWith("doc-1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Document deleted successfully",
    });
  });

  it("PATCH updates missing embeddings", async () => {
    mocks.updateMissingEmbeddings.mockResolvedValue(7);

    const response = await PATCH();

    expect(mocks.updateMissingEmbeddings).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      updatedCount: 7,
      message: "Updated embeddings for 7 chunks",
    });
  });

  it("returns 500 on downstream error", async () => {
    mocks.listDocuments.mockRejectedValue(new Error("db down"));

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to list documents",
    });
  });
});
