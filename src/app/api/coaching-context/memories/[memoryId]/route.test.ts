import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock("@/lib/db", () => ({
  prisma: {
    memory: {
      findFirst: mocks.findFirst,
      update: mocks.update,
      delete: mocks.delete,
    },
  },
}));
vi.mock("@/lib/ai/coaching-context-cache", () => ({
  invalidateCoachingContextPromptCaches: mocks.invalidate,
}));

import { DELETE, PATCH } from "./route";

const context = { params: Promise.resolve({ memoryId: "memory-1" }) };
const request = (body: unknown) =>
  new Request("http://localhost/api/coaching-context/memories/memory-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("/api/coaching-context/memories/[memoryId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1" },
      error: null,
    });
    mocks.findFirst.mockResolvedValue({ id: "memory-1" });
    mocks.update.mockResolvedValue({
      id: "memory-1",
      value: { content: "Allenamento martedì" },
      category: "schedule",
      updatedAt: new Date("2026-07-31T08:00:00.000Z"),
    });
  });

  it("scopes lookup to the authenticated owner", async () => {
    await PATCH(
      request({ content: "Allenamento martedì", category: "schedule" }),
      context,
    );
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "memory-1", userId: "user-1" },
      select: { id: true },
    });
  });

  it("updates the JSON envelope and invalidates prompt caches", async () => {
    const response = await PATCH(
      request({ content: " Allenamento martedì ", category: "schedule" }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "memory-1" },
        data: {
          category: "schedule",
          value: expect.objectContaining({
            content: "Allenamento martedì",
            category: "schedule",
            confidence: 1,
          }),
        },
      }),
    );
    expect(mocks.invalidate).toHaveBeenCalledWith("user-1");
  });

  it("does not reveal a missing or foreign memory", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const response = await PATCH(
      request({ content: "Text", category: "other" }),
      context,
    );
    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects empty content and unknown categories", async () => {
    expect(
      (await PATCH(request({ content: "", category: "other" }), context))
        .status,
    ).toBe(400);
    expect(
      (await PATCH(request({ content: "Text", category: "secret" }), context))
        .status,
    ).toBe(400);
  });

  it("deletes only the owned memory", async () => {
    const response = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      context,
    );
    expect(response.status).toBe(200);
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: "memory-1" } });
    expect(mocks.invalidate).toHaveBeenCalledWith("user-1");
  });
});
