import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  unstableCache: vi.fn(),
  chatFindMany: vi.fn(),
  chatFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  messageFindMany: vi.fn(),
  resolveEffectiveEntitlements: vi.fn(),
  getVoicePlanConfig: vi.fn(),
}));

vi.mock("react", () => ({
  cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstableCache,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    chat: {
      findMany: mocks.chatFindMany,
      findFirst: mocks.chatFindFirst,
    },
    user: {
      findUnique: mocks.userFindUnique,
    },
    message: {
      findMany: mocks.messageFindMany,
    },
  },
}));

vi.mock("@/lib/organizations/entitlements", () => ({
  resolveEffectiveEntitlements: mocks.resolveEffectiveEntitlements,
}));

vi.mock("@/lib/voice", () => ({
  getVoicePlanConfig: mocks.getVoicePlanConfig,
}));

import { getSharedChat, getSharedChats } from "./chat";

describe("lib/chat", () => {
  beforeEach(() => {
    mocks.unstableCache.mockReset();
    mocks.chatFindMany.mockReset();
    mocks.chatFindFirst.mockReset();
    mocks.userFindUnique.mockReset();
    mocks.messageFindMany.mockReset();
    mocks.resolveEffectiveEntitlements.mockReset();
    mocks.getVoicePlanConfig.mockReset();

    mocks.unstableCache.mockImplementation(
      (fn: (...args: unknown[]) => unknown) => fn,
    );
    mocks.getVoicePlanConfig.mockReturnValue({ enabled: true });
  });

  it("getSharedChats maps DB rows and uses user-scoped cache keys", async () => {
    mocks.chatFindMany.mockResolvedValue([
      {
        id: "chat-2",
        title: "Recent Chat",
        visibility: "PUBLIC",
        createdAt: new Date("2026-02-16T10:00:00.000Z"),
        updatedAt: new Date("2026-02-16T12:00:00.000Z"),
        _count: { messages: 3 },
      },
      {
        id: "chat-1",
        title: null,
        visibility: "PRIVATE",
        createdAt: new Date("2026-02-15T09:00:00.000Z"),
        updatedAt: new Date("2026-02-15T09:30:00.000Z"),
        _count: { messages: 0 },
      },
    ]);

    const result = await getSharedChats("user-1");

    expect(mocks.unstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      ["chats-user-1"],
      { tags: ["chats-user-1"], revalidate: 60 },
    );
    expect(mocks.chatFindMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        visibility: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { messages: true },
        },
      },
    });
    expect(result).toEqual([
      {
        id: "chat-2",
        title: "Recent Chat",
        visibility: "PUBLIC",
        createdAt: "2026-02-16T10:00:00.000Z",
        updatedAt: "2026-02-16T12:00:00.000Z",
        messageCount: 3,
      },
      {
        id: "chat-1",
        title: "New Chat",
        visibility: "PRIVATE",
        createdAt: "2026-02-15T09:00:00.000Z",
        updatedAt: "2026-02-15T09:30:00.000Z",
        messageCount: 0,
      },
    ]);
  });

  it("getSharedChat returns null when chat is inaccessible", async () => {
    mocks.chatFindFirst.mockResolvedValue(null);
    mocks.userFindUnique.mockResolvedValue(null);

    const result = await getSharedChat("chat-missing", "user-1");

    expect(result).toBeNull();
    expect(mocks.messageFindMany).not.toHaveBeenCalled();
    expect(mocks.resolveEffectiveEntitlements).not.toHaveBeenCalled();
  });

  it("getSharedChat maps messages, usage, pagination, and entitlement-driven voice config", async () => {
    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-1",
      title: null,
      visibility: "PRIVATE",
      userId: "user-1",
      createdAt: new Date("2026-02-14T12:00:00.000Z"),
      updatedAt: new Date("2026-02-17T12:00:00.000Z"),
    });
    mocks.userFindUnique.mockResolvedValue({
      role: "USER",
      isGuest: false,
      preferences: { voiceEnabled: false },
      subscription: { status: "ACTIVE", planId: "basic_plus" },
    });
    mocks.resolveEffectiveEntitlements.mockResolvedValue({
      limits: {
        maxRequestsPerDay: 100,
        maxInputTokensPerDay: 10000,
        maxOutputTokensPerDay: 8000,
        maxCostPerDay: 5,
        maxContextMessages: 20,
      },
      modelTier: "BASIC_PLUS",
      sources: [],
    });
    mocks.getVoicePlanConfig.mockReturnValue({ enabled: false });
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "m3",
        role: "USER",
        content: "latest question",
        parts: [{ type: "text", text: "latest question" }],
        createdAt: new Date("2026-02-17T11:00:00.000Z"),
        model: "model-a",
        inputTokens: 42,
        outputTokens: null,
        costUsd: 0,
        generationTimeMs: 0,
        reasoningTimeMs: 0,
        ragUsed: false,
        toolCalls: null,
        attachments: [],
      },
      {
        id: "m2",
        role: "ASSISTANT",
        content: "assistant answer",
        parts: [],
        createdAt: new Date("2026-02-17T10:59:00.000Z"),
        model: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        generationTimeMs: null,
        reasoningTimeMs: null,
        ragUsed: null,
        toolCalls: [{ type: "tool", name: "search" }],
        attachments: [
          {
            id: "att-1",
            name: "doc.md",
            contentType: "text/markdown",
            size: 321,
            blobUrl: "https://blob.test/doc.md",
          },
        ],
      },
      {
        id: "m1",
        role: "USER",
        content: "oldest message",
        parts: [],
        createdAt: new Date("2026-02-17T10:58:00.000Z"),
        model: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        generationTimeMs: null,
        reasoningTimeMs: null,
        ragUsed: null,
        toolCalls: null,
        attachments: [],
      },
    ]);

    const result = await getSharedChat("chat-1", "user-1", undefined, 2);

    expect(mocks.resolveEffectiveEntitlements).toHaveBeenCalledWith({
      userId: "user-1",
      subscriptionStatus: "ACTIVE",
      userRole: "USER",
      planId: "basic_plus",
      isGuest: false,
    });
    expect(mocks.getVoicePlanConfig).toHaveBeenCalledWith(
      "ACTIVE",
      "USER",
      "basic_plus",
      false,
      "BASIC_PLUS",
    );
    expect(mocks.messageFindMany).toHaveBeenCalledWith({
      where: { chatId: "chat-1" },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        role: true,
        content: true,
        parts: true,
        createdAt: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        costUsd: true,
        generationTimeMs: true,
        reasoningTimeMs: true,
        ragUsed: true,
        toolCalls: true,
        attachments: {
          select: {
            id: true,
            name: true,
            contentType: true,
            size: true,
            blobUrl: true,
          },
        },
      },
    });

    expect(result).toMatchObject({
      id: "chat-1",
      title: "New Chat",
      visibility: "PRIVATE",
      isOwner: true,
      pagination: {
        hasMore: true,
        nextCursor: "m2",
      },
      voiceEnabled: false,
      voicePlanEnabled: false,
    });
    expect(result?.messages.map((message) => message.id)).toEqual(["m2", "m3"]);
    expect(result?.messages[0]).toMatchObject({
      id: "m2",
      role: "assistant",
      usage: undefined,
      ragUsed: undefined,
      attachments: [
        {
          id: "att-1",
          name: "doc.md",
        },
      ],
    });
    expect(result?.messages[1]).toMatchObject({
      id: "m3",
      role: "user",
      usage: {
        inputTokens: 42,
        outputTokens: 0,
        cost: 0,
        generationTimeMs: undefined,
        reasoningTimeMs: undefined,
      },
      ragUsed: undefined,
    });
  });

  it("getSharedChat supports cursor pagination and defaults voice preference for missing user data", async () => {
    mocks.chatFindFirst.mockResolvedValue({
      id: "chat-public",
      title: "Public",
      visibility: "PUBLIC",
      userId: "owner-1",
      createdAt: new Date("2026-02-10T10:00:00.000Z"),
      updatedAt: new Date("2026-02-11T10:00:00.000Z"),
    });
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "msg-1",
        role: "ASSISTANT",
        content: "hello",
        parts: [],
        createdAt: new Date("2026-02-11T10:00:00.000Z"),
        model: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        generationTimeMs: null,
        reasoningTimeMs: null,
        ragUsed: null,
        toolCalls: null,
        attachments: [],
      },
    ]);

    const result = await getSharedChat("chat-public", "viewer-1", "msg-9", 50);

    expect(mocks.resolveEffectiveEntitlements).not.toHaveBeenCalled();
    expect(mocks.getVoicePlanConfig).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
    expect(mocks.messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 51,
        cursor: { id: "msg-9" },
        skip: 1,
      }),
    );
    expect(result).toMatchObject({
      id: "chat-public",
      isOwner: false,
      voiceEnabled: true,
      voicePlanEnabled: true,
      pagination: {
        hasMore: false,
        nextCursor: null,
      },
    });
  });
});
