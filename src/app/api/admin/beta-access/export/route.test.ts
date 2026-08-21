import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  exportRows: vi.fn(),
  buildCsv: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireSuperAdmin: mocks.requireSuperAdmin,
}));
vi.mock("@/lib/beta-access/subscribers", () => ({
  getBetaSubscribersForExport: mocks.exportRows,
}));
vi.mock("@/lib/beta-access/csv", () => ({
  buildBetaSubscribersCsv: mocks.buildCsv,
}));

import { GET } from "./route";

describe("GET /api/admin/beta-access/export", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => {
      mock.mockReset();
    });
    mocks.requireSuperAdmin.mockResolvedValue({
      user: { id: "admin-1", role: "SUPER_ADMIN" },
      errorResponse: null,
    });
    mocks.exportRows.mockResolvedValue([{ email: "person@example.com" }]);
    mocks.buildCsv.mockReturnValue('"Email"\r\n"person@example.com"\r\n');
  });

  it("requires SUPER_ADMIN before reading subscriber data", async () => {
    mocks.requireSuperAdmin.mockResolvedValue({
      user: null,
      errorResponse: Response.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await GET();
    expect(response.status).toBe(403);
    expect(mocks.exportRows).not.toHaveBeenCalled();
  });

  it("returns a private no-store CSV attachment", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain(
      "anthon-beta-subscribers-",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toContain("person@example.com");
  });
});
