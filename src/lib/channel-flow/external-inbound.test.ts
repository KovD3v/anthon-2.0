import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  messageFindFirst: vi.fn(),
  messageCreate: vi.fn(),
  messageUpdateMany: vi.fn(),
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
      updateMany: mocks.messageUpdateMany,
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

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/analytics/funnel", () => ({
  trackInboundUserMessageFunnelProgress:
    mocks.trackInboundUserMessageFunnelProgress,
}));

import {
  EXTERNAL_INBOUND_LEASE_MS,
  getExternalInboundMessageType,
  markExternalChannelInboundCompleted,
  markExternalChannelInboundFailed,
  prepareExternalChannelInbound,
} from "./external-inbound";

const user = {
  id: "user_1",
  role: "USER" as const,
  isGuest: false,
  subscription: { status: "ACTIVE" as const, planId: "pro" },
};
const thread = { id: "thread_1" };

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

function existingInbound(
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED",
  lease: Date | null = null,
) {
  return {
    id: "inbound_1",
    externalInboundStatus: status,
    externalInboundLeaseExpiresAt: lease,
    user,
    conversationThread: thread,
  };
}

describe("external inbound lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.messageFindFirst.mockResolvedValue(null);
    mocks.messageCreate.mockResolvedValue({ id: "inbound_1" });
    mocks.messageUpdateMany.mockResolvedValue({ count: 1 });
    mocks.channelIdentityFindUnique.mockResolvedValue({ user });
    mocks.channelIdentityUpsert.mockResolvedValue({ user });
    mocks.ensureConversationThread.mockResolvedValue(thread);
    mocks.checkRateLimit.mockResolvedValue({ allowed: true });
    mocks.trackInboundUserMessageFunnelProgress.mockResolvedValue(undefined);
  });

  it("creates a new message already owned by a processing lease", async () => {
    const result = await prepareExternalChannelInbound(buildEnvelope());

    expect(result).toMatchObject({
      status: "accepted",
      reclaimed: false,
      inbound: { id: "inbound_1" },
    });
    expect(result.status === "accepted" && result.claimToken).toEqual(
      expect.any(String),
    );
    expect(mocks.messageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalInboundStatus: "PROCESSING",
        externalInboundClaimToken: expect.any(String),
        externalInboundLeaseExpiresAt: expect.any(Date),
        externalInboundAttempts: 1,
      }),
      select: { id: true },
    });
    const lease = mocks.messageCreate.mock.calls[0][0].data
      .externalInboundLeaseExpiresAt as Date;
    expect(lease.getTime() - Date.now()).toBeGreaterThan(
      EXTERNAL_INBOUND_LEASE_MS - 2_000,
    );
  });

  it("treats completed and actively leased messages as terminal duplicates", async () => {
    mocks.messageFindFirst.mockResolvedValueOnce(existingInbound("COMPLETED"));
    await expect(
      prepareExternalChannelInbound(buildEnvelope()),
    ).resolves.toEqual({ status: "duplicate", reason: "completed" });

    mocks.messageFindFirst.mockResolvedValueOnce(
      existingInbound("PROCESSING", new Date(Date.now() + 30_000)),
    );
    mocks.messageUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      prepareExternalChannelInbound(buildEnvelope()),
    ).resolves.toEqual({ status: "duplicate", reason: "in_flight" });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });

  it.each([
    ["FAILED", null],
    ["PROCESSING", new Date(0)],
  ] as const)(
    "reclaims %s work with a fresh fenced claim",
    async (status, lease) => {
      mocks.messageFindFirst.mockResolvedValue(existingInbound(status, lease));

      const result = await prepareExternalChannelInbound(buildEnvelope());

      expect(result).toMatchObject({
        status: "accepted",
        reclaimed: true,
        inbound: { id: "inbound_1" },
      });
      expect(mocks.messageUpdateMany).toHaveBeenCalledWith({
        where: {
          id: "inbound_1",
          OR: [
            { externalInboundStatus: "PENDING" },
            { externalInboundStatus: "FAILED" },
            {
              externalInboundStatus: "PROCESSING",
              externalInboundLeaseExpiresAt: { lte: expect.any(Date) },
            },
          ],
        },
        data: expect.objectContaining({
          externalInboundStatus: "PROCESSING",
          externalInboundAttempts: { increment: 1 },
        }),
      });
    },
  );

  it("allows only one concurrent first-delivery claim", async () => {
    let persisted = false;
    mocks.messageFindFirst.mockImplementation(async () =>
      persisted
        ? existingInbound("PROCESSING", new Date(Date.now() + 60_000))
        : null,
    );
    mocks.messageCreate.mockImplementation(async () => {
      if (persisted) {
        throw Object.assign(new Error("unique"), { code: "P2002" });
      }
      persisted = true;
      return { id: "inbound_1" };
    });
    mocks.messageUpdateMany.mockResolvedValue({ count: 0 });

    const results = await Promise.all([
      prepareExternalChannelInbound(buildEnvelope()),
      prepareExternalChannelInbound(buildEnvelope()),
    ]);

    expect(
      results.filter((result) => result.status === "accepted"),
    ).toHaveLength(1);
    expect(results).toContainEqual({
      status: "duplicate",
      reason: "in_flight",
    });
  });

  it("fences completion and failure updates by inbound id and claim token", async () => {
    await expect(
      markExternalChannelInboundCompleted({
        inboundId: "inbound_1",
        claimToken: "claim_current",
      }),
    ).resolves.toBe(true);
    expect(mocks.messageUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          id: "inbound_1",
          externalInboundStatus: "PROCESSING",
          externalInboundClaimToken: "claim_current",
        },
        data: expect.objectContaining({
          externalInboundStatus: "COMPLETED",
          externalInboundCompletedAt: expect.any(Date),
        }),
      }),
    );

    mocks.messageUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      markExternalChannelInboundFailed({
        inboundId: "inbound_1",
        claimToken: "claim_stale",
        error: `secret\n${"x".repeat(400)}`,
      }),
    ).resolves.toBe(false);
    const failure = mocks.messageUpdateMany.mock.calls.at(-1)?.[0];
    expect(failure.where.externalInboundClaimToken).toBe("claim_stale");
    expect(failure.data.externalInboundLastError).not.toContain("\n");
    expect(failure.data.externalInboundLastError).toHaveLength(300);
  });

  it("marks a claimed row failed when rate-limit evaluation throws", async () => {
    mocks.checkRateLimit.mockRejectedValue(new Error("rate limit unavailable"));

    await expect(
      prepareExternalChannelInbound(buildEnvelope()),
    ).rejects.toThrow("rate limit unavailable");
    expect(mocks.messageUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ externalInboundStatus: "FAILED" }),
      }),
    );
  });

  it("normalizes identity, thread, metadata, rate limit, and funnel scheduling", async () => {
    const scheduleBackground = vi.fn();
    const envelope = buildEnvelope({
      channel: "WHATSAPP",
      externalId: "39333111222",
      externalThreadId: "39333111222",
      externalMessageId: "wamid_1",
      messageType: "DOCUMENT",
      metadata: {
        whatsapp: { id: "wamid_1", type: "document", name: "Mario Rossi" },
      },
      scheduleBackground,
    });

    const result = await prepareExternalChannelInbound(envelope);

    expect(result).toMatchObject({
      status: "accepted",
      user,
      conversationThread: thread,
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
            subscription: { select: { status: true, planId: true } },
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
      data: expect.objectContaining({
        userId: "user_1",
        conversationThreadId: "thread_1",
        channel: "WHATSAPP",
        direction: "INBOUND",
        role: "USER",
        type: "DOCUMENT",
        externalMessageId: "wamid_1",
        metadata: {
          whatsapp: { id: "wamid_1", type: "document", name: "Mario Rossi" },
        },
        externalInboundStatus: "PROCESSING",
        externalInboundAttempts: 1,
      }),
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
    expect(mocks.messageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "guest_winner" }),
      }),
    );
  });

  it("propagates a non-idempotency persistence error without downstream work", async () => {
    mocks.messageCreate.mockRejectedValue(new Error("database unavailable"));

    await expect(
      prepareExternalChannelInbound(buildEnvelope()),
    ).rejects.toThrow("database unavailable");

    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.trackInboundUserMessageFunnelProgress).not.toHaveBeenCalled();
  });

  it("keeps a denied request claimed but leaves provider transport at the edge", async () => {
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
        scheduleBackground: (task) => scheduledTasks.push(task),
        onFunnelTrackingError,
      }),
    );
    await Promise.all(scheduledTasks);

    expect(result).toMatchObject({ status: "accepted" });
    expect(onFunnelTrackingError).toHaveBeenCalledWith(trackingError);
  });
});

describe("getExternalInboundMessageType", () => {
  it("uses the shared media priority", () => {
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
