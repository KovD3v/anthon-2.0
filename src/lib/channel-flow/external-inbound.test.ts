import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  messageFindFirst: vi.fn(),
  messageCreate: vi.fn(),
  channelIdentityFindUnique: vi.fn(),
  channelIdentityUpsert: vi.fn(),
  ensureConversationThread: vi.fn(),
  checkRateLimit: vi.fn(),
  trackInboundUserMessageFunnelProgress: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    message: {
      findFirst: mocks.messageFindFirst,
      create: mocks.messageCreate,
    },
    channelIdentity: {
      findUnique: mocks.channelIdentityFindUnique,
      upsert: mocks.channelIdentityUpsert,
    },
  },
}));

vi.mock("@/lib/conversations/threads", () => ({
  ensureConversationThread: mocks.ensureConversationThread,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("@/lib/analytics/funnel", () => ({
  trackInboundUserMessageFunnelProgress:
    mocks.trackInboundUserMessageFunnelProgress,
}));

import {
  getExternalInboundMessageType,
  prepareExternalChannelInbound,
} from "./external-inbound";

const user = {
  id: "user_1",
  role: "USER" as const,
  isGuest: false,
  subscription: {
    status: "ACTIVE" as const,
    planId: "pro",
  },
};

function buildEnvelope(
  overrides: Partial<Parameters<typeof prepareExternalChannelInbound>[0]> = {},
) {
  return {
    channel: "TELEGRAM" as const,
    externalId: "telegram-user-1",
    externalThreadId: "telegram-chat-1",
    externalMessageId: "telegram-chat-1:message-1",
    messageType: "TEXT" as const,
    metadata: { telegram: { updateId: 1 } },
    buildGuestUserData: vi.fn().mockReturnValue({ isGuest: true }),
    ...overrides,
  };
}

describe("prepareExternalChannelInbound", () => {
  beforeEach(() => {
    mocks.messageFindFirst.mockReset();
    mocks.messageCreate.mockReset();
    mocks.channelIdentityFindUnique.mockReset();
    mocks.channelIdentityUpsert.mockReset();
    mocks.ensureConversationThread.mockReset();
    mocks.checkRateLimit.mockReset();
    mocks.trackInboundUserMessageFunnelProgress.mockReset();

    mocks.messageFindFirst.mockResolvedValue(null);
    mocks.channelIdentityFindUnique.mockResolvedValue({ user });
    mocks.channelIdentityUpsert.mockResolvedValue({ user });
    mocks.ensureConversationThread.mockResolvedValue({ id: "thread_1" });
    mocks.messageCreate.mockResolvedValue({ id: "inbound_1" });
    mocks.checkRateLimit.mockResolvedValue({ allowed: true });
    mocks.trackInboundUserMessageFunnelProgress.mockResolvedValue(undefined);
  });

  it("short-circuits a provider retry before identity, persistence, rate limit, or analytics", async () => {
    mocks.messageFindFirst.mockResolvedValue({ id: "already-persisted" });
    const envelope = buildEnvelope();

    await expect(prepareExternalChannelInbound(envelope)).resolves.toEqual({
      status: "duplicate",
    });

    expect(mocks.messageFindFirst).toHaveBeenCalledWith({
      where: {
        channel: "TELEGRAM",
        externalMessageId: "telegram-chat-1:message-1",
      },
      select: { id: true },
    });
    expect(mocks.channelIdentityFindUnique).not.toHaveBeenCalled();
    expect(envelope.buildGuestUserData).not.toHaveBeenCalled();
    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.trackInboundUserMessageFunnelProgress).not.toHaveBeenCalled();
  });

  it("normalizes identity, thread, inbound metadata, rate limit, and funnel scheduling", async () => {
    const scheduleBackground = vi.fn();
    const envelope = buildEnvelope({
      channel: "WHATSAPP",
      externalId: "39333111222",
      externalThreadId: "39333111222",
      externalMessageId: "wamid_1",
      messageType: "DOCUMENT",
      metadata: {
        whatsapp: {
          id: "wamid_1",
          type: "document",
          name: "Mario Rossi",
        },
      },
      scheduleBackground,
    });

    const result = await prepareExternalChannelInbound(envelope);

    expect(result).toMatchObject({
      status: "accepted",
      user,
      conversationThread: { id: "thread_1" },
      inbound: { id: "inbound_1" },
      rateLimit: { allowed: true },
    });
    expect(mocks.channelIdentityFindUnique).toHaveBeenCalledWith({
      where: {
        channel_externalId: {
          channel: "WHATSAPP",
          externalId: "39333111222",
        },
      },
      select: {
        user: {
          select: {
            id: true,
            role: true,
            isGuest: true,
            subscription: {
              select: {
                status: true,
                planId: true,
              },
            },
          },
        },
      },
    });
    expect(mocks.ensureConversationThread).toHaveBeenCalledWith({
      userId: "user_1",
      channel: "WHATSAPP",
      externalThreadId: "39333111222",
    });
    expect(mocks.messageCreate).toHaveBeenCalledWith({
      data: {
        userId: "user_1",
        conversationThreadId: "thread_1",
        channel: "WHATSAPP",
        direction: "INBOUND",
        role: "USER",
        type: "DOCUMENT",
        externalMessageId: "wamid_1",
        metadata: {
          whatsapp: {
            id: "wamid_1",
            type: "document",
            name: "Mario Rossi",
          },
        },
      },
      select: { id: true },
    });
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      "user_1",
      "ACTIVE",
      "USER",
      "pro",
      false,
    );
    expect(mocks.trackInboundUserMessageFunnelProgress).toHaveBeenCalledWith({
      userId: "user_1",
      isGuest: false,
      userRole: "USER",
      channel: "WHATSAPP",
      planId: "pro",
      subscriptionStatus: "ACTIVE",
    });
    expect(scheduleBackground).toHaveBeenCalledTimes(1);
  });

  it("handles a racing duplicate database claim without downstream side effects", async () => {
    mocks.channelIdentityFindUnique.mockResolvedValue(null);
    mocks.channelIdentityUpsert.mockResolvedValue({ user });
    mocks.messageCreate.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );
    const envelope = buildEnvelope();

    await expect(prepareExternalChannelInbound(envelope)).resolves.toEqual({
      status: "duplicate",
    });

    expect(envelope.buildGuestUserData).toHaveBeenCalledTimes(1);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.trackInboundUserMessageFunnelProgress).not.toHaveBeenCalled();
  });

  it("converges concurrent first deliveries on one identity-owned guest", async () => {
    mocks.channelIdentityFindUnique.mockResolvedValue(null);
    let upsertsAtBarrier = 0;
    let releaseBarrier: () => void;
    const bothUpsertsStarted = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });
    const winner = { ...user, id: "guest_winner" };
    mocks.channelIdentityUpsert.mockImplementation(async () => {
      upsertsAtBarrier += 1;
      if (upsertsAtBarrier === 2) releaseBarrier();
      await bothUpsertsStarted;
      return { user: winner };
    });
    mocks.messageCreate.mockImplementation(async ({ data }) => ({
      id: `inbound_${data.externalMessageId}`,
    }));

    const [first, second] = await Promise.all([
      prepareExternalChannelInbound(
        buildEnvelope({ externalMessageId: "telegram-chat-1:message-1" }),
      ),
      prepareExternalChannelInbound(
        buildEnvelope({ externalMessageId: "telegram-chat-1:message-2" }),
      ),
    ]);

    expect(first).toMatchObject({
      status: "accepted",
      user: { id: "guest_winner" },
    });
    expect(second).toMatchObject({
      status: "accepted",
      user: { id: "guest_winner" },
    });
    expect(mocks.channelIdentityUpsert).toHaveBeenCalledTimes(2);
    expect(mocks.channelIdentityUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {},
        create: expect.objectContaining({
          channel: "TELEGRAM",
          externalId: "telegram-user-1",
          user: { create: { isGuest: true } },
        }),
      }),
    );
    expect(mocks.messageCreate).toHaveBeenCalledTimes(2);
    expect(mocks.messageCreate.mock.calls).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({
            data: expect.objectContaining({ userId: "guest_winner" }),
          }),
        ],
      ]),
    );
  });

  it("re-reads the winner when a nested identity upsert loses a unique race", async () => {
    const winner = { ...user, id: "guest_winner" };
    mocks.channelIdentityFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ user: winner });
    mocks.channelIdentityUpsert.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );

    const result = await prepareExternalChannelInbound(buildEnvelope());

    expect(result).toMatchObject({
      status: "accepted",
      user: { id: "guest_winner" },
    });
    expect(mocks.channelIdentityFindUnique).toHaveBeenCalledTimes(2);
    expect(mocks.channelIdentityUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} }),
    );
    expect(mocks.messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "guest_winner" }),
      }),
    );
  });

  it("propagates a non-idempotency persistence error without invoking downstream work", async () => {
    mocks.messageCreate.mockRejectedValue(new Error("database unavailable"));

    await expect(
      prepareExternalChannelInbound(buildEnvelope()),
    ).rejects.toThrow("database unavailable");

    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.trackInboundUserMessageFunnelProgress).not.toHaveBeenCalled();
  });

  it("keeps a denied request persisted but leaves provider transport at the edge", async () => {
    mocks.checkRateLimit.mockResolvedValue({
      allowed: false,
      upgradeInfo: { currentPlan: "free" },
    });
    const scheduleBackground = vi.fn();

    const result = await prepareExternalChannelInbound(
      buildEnvelope({ scheduleBackground }),
    );

    expect(result).toMatchObject({
      status: "accepted",
      inbound: { id: "inbound_1" },
      rateLimit: { allowed: false },
    });
    expect(mocks.trackInboundUserMessageFunnelProgress).not.toHaveBeenCalled();
    expect(scheduleBackground).not.toHaveBeenCalled();
  });

  it("does not turn a noncritical funnel failure into a provider retry", async () => {
    const trackingError = new Error("analytics unavailable");
    const onFunnelTrackingError = vi.fn();
    const scheduledTasks: Promise<unknown>[] = [];
    mocks.trackInboundUserMessageFunnelProgress.mockRejectedValue(
      trackingError,
    );

    const result = await prepareExternalChannelInbound(
      buildEnvelope({
        scheduleBackground: (task) => {
          scheduledTasks.push(task);
        },
        onFunnelTrackingError,
      }),
    );
    await Promise.all(scheduledTasks);

    expect(result).toMatchObject({ status: "accepted" });
    expect(onFunnelTrackingError).toHaveBeenCalledWith(trackingError);
  });
});

describe("getExternalInboundMessageType", () => {
  it("uses the same media priority for every provider adapter", () => {
    expect(
      getExternalInboundMessageType({
        hasImage: true,
        hasDocument: true,
        hasAudio: true,
      }),
    ).toBe("IMAGE");
    expect(
      getExternalInboundMessageType({
        hasImage: false,
        hasDocument: true,
        hasAudio: true,
      }),
    ).toBe("DOCUMENT");
    expect(
      getExternalInboundMessageType({
        hasImage: false,
        hasDocument: false,
        hasAudio: true,
      }),
    ).toBe("AUDIO");
    expect(
      getExternalInboundMessageType({
        hasImage: false,
        hasDocument: false,
        hasAudio: false,
      }),
    ).toBe("TEXT");
  });
});
