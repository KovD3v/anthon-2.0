import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  shouldUseRag: vi.fn(),
  searchDocuments: vi.fn(),
  getRagContext: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/ai/rag", () => ({
  shouldUseRag: mocks.shouldUseRag,
  searchDocuments: mocks.searchDocuments,
  getRagContext: mocks.getRagContext,
}));

import { POST } from "./route";

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/rag/search", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/rag/search", () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.shouldUseRag.mockReset();
    mocks.searchDocuments.mockReset();
    mocks.getRagContext.mockReset();

    mocks.auth.mockResolvedValue({ userId: "clerk-1" });
    mocks.shouldUseRag.mockResolvedValue(true);
    mocks.searchDocuments.mockResolvedValue([{ id: "doc-1" }]);
    mocks.getRagContext.mockResolvedValue("context text");
  });

  it("returns 401 when unauthorized", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await POST(buildRequest({ query: "hello" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when query is missing", async () => {
    const response = await POST(buildRequest({ query: "" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Query is required",
    });
  });

  it("returns early when checkNeedsRag resolves false", async () => {
    mocks.shouldUseRag.mockResolvedValue(false);

    const response = await POST(
      buildRequest({ query: "hi", checkNeedsRag: true }),
    );

    expect(response.status).toBe(200);
    expect(mocks.searchDocuments).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      needsRag: false,
      message: "This query does not need RAG context",
      results: [],
      context: "",
    });
  });

  it("returns search results and context", async () => {
    mocks.searchDocuments.mockResolvedValue([{ id: "d1" }, { id: "d2" }]);
    mocks.getRagContext.mockResolvedValue("ctx");

    const response = await POST(buildRequest({ query: "nutrition", limit: 2 }));

    expect(mocks.searchDocuments).toHaveBeenCalledWith("nutrition", 2);
    expect(mocks.getRagContext).toHaveBeenCalledWith("nutrition");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      needsRag: true,
      results: [{ id: "d1" }, { id: "d2" }],
      context: "ctx",
      resultCount: 2,
    });
  });

  it("returns 500 when downstream throws", async () => {
    mocks.searchDocuments.mockRejectedValue(new Error("search failed"));

    const response = await POST(buildRequest({ query: "nutrition" }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to search documents",
    });
  });
});
