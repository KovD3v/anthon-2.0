import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createUser, resetIntegrationDb } from "@/test/integration/factories";
import {
  isCurrentBetaAccessCookie,
  loadBetaAccessConfig,
  rotateBetaAccessPassword,
  unlockBetaAccess,
} from "./service";
import { listBetaSubscribers, subscribeToBetaMailing } from "./subscribers";

const secret = "integration-beta-cookie-secret-value";

describe("integration private beta persistence", () => {
  beforeEach(async () => {
    await prisma.betaAbuseBucket.deleteMany();
    await prisma.betaMailingSubscriber.deleteMany();
    await prisma.betaAccessConfig.deleteMany();
    await resetIntegrationDb();
  });

  it("rotates the shared password and revokes the previous credential", async () => {
    const actor = await createUser({ role: "SUPER_ADMIN" });
    const firstPassword = "first integration beta password";
    const secondPassword = "second integration beta password";

    const firstConfig = await rotateBetaAccessPassword(
      firstPassword,
      actor.id,
      new Date("2026-08-16T10:00:00.000Z"),
    );
    const firstUnlock = await unlockBetaAccess(firstPassword, { secret });

    expect(firstConfig.accessVersion).toBe(1);
    expect(firstUnlock.status).toBe("ok");
    if (firstUnlock.status !== "ok") throw new Error("Expected first unlock");

    const secondConfig = await rotateBetaAccessPassword(
      secondPassword,
      actor.id,
      new Date("2026-08-16T11:00:00.000Z"),
    );

    expect(secondConfig.accessVersion).toBe(2);
    expect(
      isCurrentBetaAccessCookie(firstUnlock.cookieValue, 2, { secret }),
    ).toBe(false);
    await expect(unlockBetaAccess(firstPassword, { secret })).resolves.toEqual({
      status: "invalid",
    });
    await expect(
      unlockBetaAccess(secondPassword, { secret }),
    ).resolves.toMatchObject({ status: "ok", accessVersion: 2 });
    await expect(loadBetaAccessConfig()).resolves.toMatchObject({
      active: true,
      accessVersion: 2,
      rotatedAt: new Date("2026-08-16T11:00:00.000Z"),
    });
  });

  it("deduplicates emails and records independent optional consent", async () => {
    await subscribeToBetaMailing(
      {
        email: " Person@Example.com ",
        releaseConsent: true,
        updatesConsent: false,
      },
      new Date("2026-08-16T10:00:00.000Z"),
    );
    await subscribeToBetaMailing(
      {
        email: "person@example.com",
        releaseConsent: true,
        updatesConsent: true,
      },
      new Date("2026-08-16T11:00:00.000Z"),
    );

    const active = await listBetaSubscribers({
      page: 1,
      limit: 25,
      updatesOnly: true,
    });
    expect(active.metrics).toEqual({ total: 1, updates: 1 });
    expect(active.subscribers).toHaveLength(1);
    expect(active.subscribers[0]).toMatchObject({
      email: "person@example.com",
      updatesOptOutAt: null,
    });

    await subscribeToBetaMailing(
      {
        email: "PERSON@example.com",
        releaseConsent: true,
        updatesConsent: false,
      },
      new Date("2026-08-16T12:00:00.000Z"),
    );

    const optedOut = await listBetaSubscribers({
      page: 1,
      limit: 25,
      updatesOnly: false,
    });
    expect(optedOut.metrics).toEqual({ total: 1, updates: 0 });
    expect(optedOut.subscribers[0]?.updatesOptOutAt).toEqual(
      new Date("2026-08-16T12:00:00.000Z"),
    );
  });
});
