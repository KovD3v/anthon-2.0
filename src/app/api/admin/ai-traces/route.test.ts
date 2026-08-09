import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  traceFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireSuperAdmin: mocks.requireSuperAdmin,
}));

vi.mock("@/lib/db", () => ({
  prisma: { aiTurnTrace: { findMany: mocks.traceFindMany } },
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn() }),
  withRequestLogContext: async (
    _request: Request,
    _context: unknown,
    callback: () => Promise<Response>,
  ) => callback(),
}));

import { GET } from "./route";

describe("GET /api/admin/ai-traces", () => {
  beforeEach(() => {
    mocks.requireSuperAdmin.mockReset();
    mocks.traceFindMany.mockReset();
    mocks.requireSuperAdmin.mockResolvedValue({ errorResponse: null });
    mocks.traceFindMany.mockResolvedValue([
      {
        id: "trace-1",
        metadata: {
          turnPlan: {
            capabilities: { memoryDelete: true },
            memoryDeleteTarget: "training_schedule",
          },
        },
      },
    ]);
  });

  it("redacts exact memory targets from trace-list metadata", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/ai-traces"),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('"memoryDelete":true');
    expect(body).not.toContain("training_schedule");
  });
});
