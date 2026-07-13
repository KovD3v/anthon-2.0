import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetIntegrationDb } from "@/test/integration/factories";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  trackInboundUserMessageFunnelProgress: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("@/lib/analytics/funnel", () => ({
  trackInboundUserMessageFunnelProgress:
    mocks.trackInboundUserMessageFunnelProgress,
}));

import { prepareExternalChannelInbound } from "./external-inbound";

function envelope(externalMessageId: string, externalThreadId: string) {
  return {
    channel: "TELEGRAM" as const,
    externalId: "telegram-concurrent-first-delivery",
    externalThreadId,
    externalMessageId,
    messageType: "TEXT" as const,
    metadata: {
      telegram: { updateId: externalMessageId },
    },
    buildGuestUserData: () => ({ isGuest: true }),
  };
}

describe("integration external channel inbound identity claims", () => {
  beforeEach(async () => {
    await resetIntegrationDb();
    mocks.checkRateLimit.mockReset();
    mocks.trackInboundUserMessageFunnelProgress.mockReset();
    mocks.checkRateLimit.mockResolvedValue({ allowed: true });
    mocks.trackInboundUserMessageFunnelProgress.mockResolvedValue(undefined);
  });

  it("keeps concurrent first deliveries on one guest and one immutable identity mapping", async () => {
    const [first, second] = await Promise.all([
      prepareExternalChannelInbound(envelope("race-message-1", "thread-1")),
      prepareExternalChannelInbound(envelope("race-message-2", "thread-2")),
    ]);

    expect(first).toMatchObject({ status: "accepted" });
    expect(second).toMatchObject({ status: "accepted" });

    const [identity, messages, guestCount] = await Promise.all([
      prisma.channelIdentity.findUnique({
        where: {
          channel_externalId: {
            channel: "TELEGRAM",
            externalId: "telegram-concurrent-first-delivery",
          },
        },
        select: { userId: true },
      }),
      prisma.message.findMany({
        where: {
          channel: "TELEGRAM",
          externalMessageId: { in: ["race-message-1", "race-message-2"] },
        },
        select: { userId: true, conversationThreadId: true },
      }),
      prisma.user.count({ where: { isGuest: true } }),
    ]);

    expect(identity?.userId).toBeTruthy();
    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.userId)).toEqual([
      identity?.userId,
      identity?.userId,
    ]);
    expect(
      new Set(messages.map((message) => message.conversationThreadId)).size,
    ).toBe(2);
    expect(guestCount).toBe(1);
  });
});
