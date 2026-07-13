import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createUser, resetIntegrationDb } from "@/test/integration/factories";
import { cacheSummary, getCachedSummary } from "./session-cache";

describe("integration session summary cache", () => {
  beforeEach(async () => {
    await resetIntegrationDb();
  });

  it("upserts one durable summary for the same session", async () => {
    const user = await createUser();
    const sessionId = `session-cache-${user.id}`;

    await cacheSummary(user.id, sessionId, "First summary");
    await cacheSummary(user.id, sessionId, "Revised summary");

    const summaries = await prisma.sessionSummary.findMany({
      where: { sessionId },
      select: { userId: true, summary: true, expiresAt: true },
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      userId: user.id,
      summary: "Revised summary",
    });
    expect(summaries[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    await expect(getCachedSummary(sessionId)).resolves.toBe("Revised summary");
  });

  it("returns null and removes an expired durable summary", async () => {
    const user = await createUser();
    const sessionId = `expired-session-${user.id}`;

    await prisma.sessionSummary.create({
      data: {
        userId: user.id,
        sessionId,
        summary: "Stale summary",
        expiresAt: new Date(Date.now() - 1_000),
      },
    });

    await expect(getCachedSummary(sessionId)).resolves.toBeNull();
    await expect(
      prisma.sessionSummary.findUnique({
        where: { sessionId },
        select: { id: true },
      }),
    ).resolves.toBeNull();
  });
});
