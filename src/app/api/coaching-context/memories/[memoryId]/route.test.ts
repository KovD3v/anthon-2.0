import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  getActiveFactById: vi.fn(),
  reviseFact: vi.fn(),
  forgetFact: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/ai/memory-facts", () => ({
  getActiveFactById: mocks.getActiveFactById,
  reviseFact: mocks.reviseFact,
  forgetFact: mocks.forgetFact,
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
    mocks.getActiveFactById.mockResolvedValue({
      id: "memory-1",
      key: "training_schedule",
      content: "Allenamento martedì",
      category: "schedule",
      confidence: 1,
      origin: "EXPLICIT",
      observedAt: new Date("2026-07-31T08:00:00.000Z"),
      updatedAt: new Date("2026-07-31T08:00:00.000Z"),
    });
    mocks.reviseFact.mockResolvedValue({ status: "saved", factId: "memory-1" });
    mocks.forgetFact.mockResolvedValue({
      status: "forgotten",
      factId: "memory-1",
    });
  });

  it("scopes lookup to the authenticated owner", async () => {
    await PATCH(
      request({ content: "Allenamento martedì", category: "schedule" }),
      context,
    );
    expect(mocks.getActiveFactById).toHaveBeenCalledWith({
      userId: "user-1",
      factId: "memory-1",
    });
  });

  it("updates the JSON envelope and invalidates prompt caches", async () => {
    const response = await PATCH(
      request({ content: " Allenamento martedì ", category: "schedule" }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.reviseFact).toHaveBeenCalledWith({
      userId: "user-1",
      factId: "memory-1",
      key: "training_schedule",
      value: "Allenamento martedì",
      category: "schedule",
      confidence: 1,
      sensitivity: "LOW",
      origin: "EXPLICIT",
      dedupeKey: expect.stringMatching(/^coaching-context:revise:/),
    });
    expect(mocks.invalidate).toHaveBeenCalledWith("user-1");
  });

  it("does not reveal a missing or foreign memory", async () => {
    mocks.getActiveFactById.mockResolvedValue(null);
    const response = await PATCH(
      request({ content: "Text", category: "other" }),
      context,
    );
    expect(response.status).toBe(404);
    expect(mocks.reviseFact).not.toHaveBeenCalled();
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
    expect(mocks.forgetFact).toHaveBeenCalledWith({
      userId: "user-1",
      factId: "memory-1",
      dedupeKey: "coaching-context:forget:user-1:memory-1",
    });
    expect(mocks.invalidate).toHaveBeenCalledWith("user-1");
  });

  it("treats a repeated delete as an idempotent success", async () => {
    mocks.forgetFact.mockResolvedValue({
      status: "duplicate",
      factId: "memory-1",
    });

    const response = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: true });
  });
});
