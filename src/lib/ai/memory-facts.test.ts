import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  memoryFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    memory: {
      findMany: mocks.memoryFindMany,
    },
  },
}));

import { recallFacts } from "./memory-facts";

describe("durable fact recall", () => {
  beforeEach(() => {
    mocks.memoryFindMany.mockReset();
  });

  it("returns only current active user facts as bounded prompt projections", async () => {
    const now = new Date("2026-08-11T12:00:00.000Z");
    mocks.memoryFindMany.mockResolvedValue([
      {
        id: "memory-1",
        key: "training_schedule",
        category: "schedule",
        value: { content: "Martedì sera" },
        origin: "EXPLICIT",
        confidence: 0.96,
        observedAt: new Date("2026-08-10T18:00:00.000Z"),
        updatedAt: new Date("2026-08-10T18:00:00.000Z"),
      },
    ]);

    const result = await recallFacts({
      userId: "user-1",
      query: "quando mi alleno",
      limit: 4,
      now,
    });

    expect(result).toEqual({
      degraded: false,
      facts: [
        {
          id: "memory-1",
          key: "training_schedule",
          content: "Martedì sera",
          category: "schedule",
          origin: "EXPLICIT",
          confidence: 0.96,
          observedAt: new Date("2026-08-10T18:00:00.000Z"),
          updatedAt: new Date("2026-08-10T18:00:00.000Z"),
        },
      ],
    });
    expect(mocks.memoryFindMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { updatedAt: "desc" },
      take: 4,
    });
  });
});
