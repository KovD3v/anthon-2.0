import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  undoMemoryRevision: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock("@/lib/ai/memory-changes", () => ({
  undoMemoryRevision: mocks.undoMemoryRevision,
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ memoryId: "memory-1" }) };
const request = (body: unknown = { revisionId: "revision-1" }) =>
  new Request("http://localhost/api/coaching-context/memories/memory-1/undo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("memory revision undo route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthUser.mockResolvedValue({
      user: { id: "user-1", isGuest: false },
      error: null,
    });
    mocks.undoMemoryRevision.mockResolvedValue("undone");
  });
  it("uses the authenticated owner and exact revision", async () => {
    expect((await POST(request(), context)).status).toBe(200);
    expect(mocks.undoMemoryRevision).toHaveBeenCalledWith(
      "user-1",
      "memory-1",
      "revision-1",
    );
  });
  it.each([null, { id: "guest", isGuest: true }])(
    "rejects unsigned or guest users",
    async (user) => {
      mocks.getAuthUser.mockResolvedValue({ user, error: null });
      expect((await POST(request(), context)).status).toBe(401);
      expect(mocks.undoMemoryRevision).not.toHaveBeenCalled();
    },
  );
  it.each([{}, { revisionId: "revision-1", userId: "other" }])(
    "rejects invalid or extra input",
    async (body) => {
      expect((await POST(request(body), context)).status).toBe(400);
      expect(mocks.undoMemoryRevision).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["not_found", 404],
    ["pending", 409],
    ["stale", 409],
  ] as const)("maps %s safely", async (result, status) => {
    mocks.undoMemoryRevision.mockResolvedValue(result);
    expect((await POST(request(), context)).status).toBe(status);
  });
});
