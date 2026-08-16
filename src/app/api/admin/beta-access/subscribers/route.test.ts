import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  list: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireSuperAdmin: mocks.requireSuperAdmin,
}));
vi.mock("@/lib/beta-access/subscribers", () => ({
  listBetaSubscribers: mocks.list,
}));

import { GET } from "./route";

describe("GET /api/admin/beta-access/subscribers", () => {
  beforeEach(() => {
    mocks.requireSuperAdmin.mockReset();
    mocks.list.mockReset();
    mocks.requireSuperAdmin.mockResolvedValue({
      user: { id: "admin-1", role: "SUPER_ADMIN" },
      errorResponse: null,
    });
    mocks.list.mockResolvedValue({
      subscribers: [],
      pagination: { page: 2, limit: 25, total: 0, totalPages: 0 },
      metrics: { total: 0, updates: 0 },
    });
  });

  it("requires SUPER_ADMIN", async () => {
    mocks.requireSuperAdmin.mockResolvedValue({
      user: null,
      errorResponse: Response.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET(
      new Request("http://localhost/api/admin/beta-access/subscribers"),
    );
    expect(response.status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("parses bounded pagination and updates filter", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/admin/beta-access/subscribers?page=2&limit=25&updatesOnly=true",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith({
      page: 2,
      limit: 25,
      updatesOnly: true,
    });
  });

  it("rejects malformed query values", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/admin/beta-access/subscribers?page=nope",
      ),
    );
    expect(response.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
