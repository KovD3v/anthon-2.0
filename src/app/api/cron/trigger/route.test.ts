import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  publishToQueue: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findMany: mocks.userFindMany,
    },
  },
}));

vi.mock("@/lib/qstash", () => ({
  publishToQueue: mocks.publishToQueue,
}));

import { GET } from "./route";

const originalEnv = { ...process.env };

describe("GET /api/cron/trigger", () => {
  beforeEach(() => {
    mocks.userFindMany.mockReset();
    mocks.publishToQueue.mockReset();

    process.env.CRON_SECRET = "cron-secret";

    mocks.userFindMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
    mocks.publishToQueue.mockResolvedValue({ ok: true });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns 401 when cron secret is invalid", async () => {
    const response = await GET(
      new Request("http://localhost/api/cron/trigger", {
        headers: { authorization: "Bearer wrong" },
      }) as unknown as import("next/server").NextRequest,
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
  });

  it("publishes consolidate + archive jobs by default", async () => {
    const response = await GET(
      new Request("http://localhost/api/cron/trigger", {
        headers: { authorization: "Bearer cron-secret" },
      }) as unknown as import("next/server").NextRequest,
    );

    expect(response.status).toBe(200);
    expect(mocks.userFindMany).toHaveBeenCalledWith({
      where: {
        isGuest: false,
        deletedAt: null,
      },
      select: { id: true },
    });
    expect(mocks.publishToQueue).toHaveBeenCalledTimes(4);
    expect(mocks.publishToQueue).toHaveBeenNthCalledWith(
      1,
      "api/queues/consolidate",
      { userId: "u1" },
    );
    expect(mocks.publishToQueue).toHaveBeenNthCalledWith(
      2,
      "api/queues/archive",
      { userId: "u1" },
    );

    await expect(response.json()).resolves.toEqual({
      success: true,
      usersProcessed: 2,
      jobsPublished: 4,
    });
  });

  it("publishes only analyze jobs when job=analyze", async () => {
    const response = await GET(
      new Request("http://localhost/api/cron/trigger?job=analyze", {
        headers: { authorization: "Bearer cron-secret" },
      }) as unknown as import("next/server").NextRequest,
    );

    expect(response.status).toBe(200);
    expect(mocks.publishToQueue).toHaveBeenCalledTimes(2);
    expect(mocks.publishToQueue).toHaveBeenNthCalledWith(1, "api/queues/analyze", {
      userId: "u1",
    });
    expect(mocks.publishToQueue).toHaveBeenNthCalledWith(2, "api/queues/analyze", {
      userId: "u2",
    });
    await expect(response.json()).resolves.toEqual({
      success: true,
      usersProcessed: 2,
      jobsPublished: 2,
    });
  });

  it("continues when one user publish fails", async () => {
    mocks.publishToQueue
      .mockRejectedValueOnce(new Error("qstash down"))
      .mockResolvedValueOnce({ ok: true });

    const response = await GET(
      new Request("http://localhost/api/cron/trigger?job=consolidate", {
        headers: { authorization: "Bearer cron-secret" },
      }) as unknown as import("next/server").NextRequest,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      usersProcessed: 2,
      jobsPublished: 1,
    });
  });

  it("returns 500 when fetching users fails", async () => {
    mocks.userFindMany.mockRejectedValue(new Error("db failed"));

    const response = await GET(
      new Request("http://localhost/api/cron/trigger", {
        headers: { authorization: "Bearer cron-secret" },
      }) as unknown as import("next/server").NextRequest,
    );

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe("Internal Server Error");
  });
});
