import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { PrepareChannelConnectRequestInput } from "./connect";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  connectCreate: vi.fn(),
  connectUpdate: vi.fn(),
  connectUpdateMany: vi.fn(),
  connectFindUnique: vi.fn(),
  identityFindUnique: vi.fn(),
  tokenFindUnique: vi.fn(),
  tokenCreate: vi.fn(),
  tokenUpdate: vi.fn(),
}));

const transactionClient = {
  channelConnectRequest: {
    create: mocks.connectCreate,
    update: mocks.connectUpdate,
  },
  channelIdentity: { findUnique: mocks.identityFindUnique },
  channelLinkToken: {
    findUnique: mocks.tokenFindUnique,
    create: mocks.tokenCreate,
    update: mocks.tokenUpdate,
  },
};

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: mocks.transaction,
    channelConnectRequest: {
      findUnique: mocks.connectFindUnique,
      updateMany: mocks.connectUpdateMany,
    },
  },
}));

import {
  CONNECT_DELIVERY_LEASE_MS,
  claimChannelConnectDelivery,
  markChannelConnectDeliveryFailed,
  markChannelConnectDeliverySent,
  prepareChannelConnectRequest,
} from "./connect";

function input(
  overrides: Partial<PrepareChannelConnectRequestInput> = {},
): PrepareChannelConnectRequestInput {
  return {
    channel: "TELEGRAM",
    externalMessageId: "chat-1:message-1",
    externalId: "user-1",
    chatId: "chat-1",
    tokenHash: "hashed-token",
    ...overrides,
  };
}

describe("channel connect lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(
      async (operation: (tx: typeof transactionClient) => unknown) =>
        operation(transactionClient),
    );
    mocks.connectCreate.mockResolvedValue({
      id: "request-1",
      responseKind: "LINK",
    });
    mocks.connectUpdate.mockImplementation(async ({ data }) => ({
      id: "request-1",
      responseKind: data.responseKind,
    }));
    mocks.connectUpdateMany.mockResolvedValue({ count: 1 });
    mocks.identityFindUnique.mockResolvedValue(null);
    mocks.tokenFindUnique.mockResolvedValue(null);
    mocks.tokenCreate.mockResolvedValue({ id: "token-1" });
    mocks.tokenUpdate.mockResolvedValue({ id: "token-1" });
  });

  it("creates a request and persists only a caller-supplied token hash", async () => {
    type ForbiddenInputKeys = Extract<
      keyof PrepareChannelConnectRequestInput,
      "rawToken" | "secret"
    >;
    expectTypeOf<ForbiddenInputKeys>().toEqualTypeOf<never>();

    await expect(prepareChannelConnectRequest(input())).resolves.toEqual({
      id: "request-1",
      responseKind: "LINK",
    });
    expect(mocks.tokenCreate).toHaveBeenCalledWith({
      data: {
        channel: "TELEGRAM",
        tokenHash: "hashed-token",
        externalId: "user-1",
        chatId: "chat-1",
        expiresAt: expect.any(Date),
      },
      select: { id: true },
    });
    expect(JSON.stringify(mocks.tokenCreate.mock.calls)).not.toContain(
      "rawToken",
    );
    expect(JSON.stringify(mocks.tokenCreate.mock.calls)).not.toContain(
      "secret",
    );
  });

  it("marks a request already linked without creating a token", async () => {
    mocks.identityFindUnique.mockResolvedValue({ user: { isGuest: false } });

    await expect(prepareChannelConnectRequest(input())).resolves.toEqual({
      id: "request-1",
      responseKind: "ALREADY_LINKED",
    });
    expect(mocks.connectUpdate).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: { responseKind: "ALREADY_LINKED" },
      select: { id: true, responseKind: true },
    });
    expect(mocks.tokenFindUnique).not.toHaveBeenCalled();
  });

  it("marks a request unavailable when no hash can be derived", async () => {
    await expect(
      prepareChannelConnectRequest(input({ tokenHash: null })),
    ).resolves.toEqual({ id: "request-1", responseKind: "UNAVAILABLE" });
    expect(mocks.tokenFindUnique).not.toHaveBeenCalled();
  });

  it("leaves active and consumed tokens unchanged", async () => {
    mocks.tokenFindUnique.mockResolvedValueOnce({
      id: "token-1",
      expiresAt: new Date(Date.now() + 30_000),
      consumedAt: null,
    });
    await prepareChannelConnectRequest(input());

    mocks.tokenFindUnique.mockResolvedValueOnce({
      id: "token-1",
      expiresAt: new Date(0),
      consumedAt: new Date(),
    });
    await prepareChannelConnectRequest(
      input({ externalMessageId: "message-2" }),
    );

    expect(mocks.tokenCreate).not.toHaveBeenCalled();
    expect(mocks.tokenUpdate).not.toHaveBeenCalled();
  });

  it("refreshes an expired unconsumed token for ten minutes", async () => {
    mocks.tokenFindUnique.mockResolvedValue({
      id: "token-1",
      expiresAt: new Date(0),
      consumedAt: null,
    });

    await prepareChannelConnectRequest(input());

    expect(mocks.tokenUpdate).toHaveBeenCalledWith({
      where: { id: "token-1" },
      data: { expiresAt: expect.any(Date) },
      select: { id: true },
    });
    const expiresAt = mocks.tokenUpdate.mock.calls[0][0].data.expiresAt as Date;
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(598_000);
  });

  it("converges a P2002 duplicate onto the persisted request", async () => {
    mocks.transaction.mockRejectedValue(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );
    mocks.connectFindUnique.mockResolvedValue({
      id: "request-winner",
      responseKind: "LINK",
    });

    await expect(prepareChannelConnectRequest(input())).resolves.toEqual({
      id: "request-winner",
      responseKind: "LINK",
    });
    expect(mocks.connectFindUnique).toHaveBeenCalledWith({
      where: {
        channel_externalMessageId: {
          channel: "TELEGRAM",
          externalMessageId: "chat-1:message-1",
        },
      },
      select: { id: true, responseKind: true },
    });
  });

  it("allows one delivery owner and includes expired leases in the claim", async () => {
    mocks.connectUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const first = await claimChannelConnectDelivery("request-1");
    const second = await claimChannelConnectDelivery("request-1");

    expect(first).toEqual(expect.any(String));
    expect(second).toBeNull();
    const claim = mocks.connectUpdateMany.mock.calls[0][0];
    expect(claim.where).toEqual({
      id: "request-1",
      OR: [
        { status: { in: ["PENDING", "FAILED"] } },
        {
          status: "SENDING",
          deliveryLeaseExpiresAt: { lt: expect.any(Date) },
        },
      ],
    });
    expect(
      claim.data.deliveryLeaseExpiresAt.getTime() -
        claim.where.OR[1].deliveryLeaseExpiresAt.lt.getTime(),
    ).toBe(CONNECT_DELIVERY_LEASE_MS);
  });

  it("fences SENT and FAILED settlement with the claim token", async () => {
    await expect(
      markChannelConnectDeliverySent({
        connectRequestId: "request-1",
        claimToken: "current-claim",
      }),
    ).resolves.toBe(true);
    expect(mocks.connectUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          id: "request-1",
          status: "SENDING",
          claimToken: "current-claim",
        },
        data: expect.objectContaining({
          status: "SENT",
          deliveredAt: expect.any(Date),
        }),
      }),
    );

    mocks.connectUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      markChannelConnectDeliveryFailed({
        connectRequestId: "request-1",
        claimToken: "stale-claim",
        error: `private\n${"x".repeat(400)}`,
      }),
    ).resolves.toBe(false);
    const failure = mocks.connectUpdateMany.mock.calls.at(-1)?.[0];
    expect(failure.where).toEqual({
      id: "request-1",
      status: "SENDING",
      claimToken: "stale-claim",
    });
    expect(failure.data.lastDeliveryError).not.toContain("\n");
    expect(failure.data.lastDeliveryError).toHaveLength(300);
  });
});
