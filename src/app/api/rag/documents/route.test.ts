import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listDocuments: vi.fn(),
  addDocument: vi.fn(),
  deleteDocument: vi.fn(),
  updateMissingEmbeddings: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
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
    mocks.requireAdmin.mockReset();
    mocks.listDocuments.mockReset();
    mocks.addDocument.mockReset();
    mocks.deleteDocument.mockReset();
    mocks.updateMissingEmbeddings.mockReset();

    mocks.requireAdmin.mockResolvedValue({ errorResponse: null });
  });

  const deniedRequests = [
    { method: "GET", invoke: () => GET() },
    {
      method: "POST",
      invoke: () =>
        POST(
          new Request("http://localhost/api/rag/documents", {
            method: "POST",
            body: "{not-json",
            headers: { "Content-Type": "application/json" },
          }),
        ),
    },
    {
      method: "DELETE",
      invoke: () =>
        DELETE(
          new Request("http://localhost/api/rag/documents", {
            method: "DELETE",
          }),
        ),
    },
    { method: "PATCH", invoke: () => PATCH() },
  ];

  const denials = [
    { status: 401, body: { error: "Unauthorized" } },
    { status: 403, body: { error: "Forbidden" } },
  ];

  for (const { method, invoke } of deniedRequests) {
    for (const { status, body } of denials) {
      it(`${method} returns ${status} before validation or RAG operations`, async () => {
        mocks.requireAdmin.mockResolvedValue({
          errorResponse: Response.json(body, { status }),
        });

        const response = await invoke();

        expect(response.status).toBe(status);
        await expect(response.json()).resolves.toEqual(body);
        expect(mocks.listDocuments).not.toHaveBeenCalled();
        expect(mocks.addDocument).not.toHaveBeenCalled();
        expect(mocks.deleteDocument).not.toHaveBeenCalled();
        expect(mocks.updateMissingEmbeddings).not.toHaveBeenCalled();
      });
    }
  }

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
