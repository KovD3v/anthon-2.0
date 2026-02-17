import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  userFindUnique: vi.fn(),
  messageAggregate: vi.fn(),
  messageFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    message: {
      aggregate: mocks.messageAggregate,
      findMany: mocks.messageFindMany,
    },
  },
}));

import { GET } from "./route";

function params(userId = "user-1") {
  return Promise.resolve({ userId });
}

describe("GET /api/admin/users/[userId]", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.userFindUnique.mockReset();
    mocks.messageAggregate.mockReset();
    mocks.messageFindMany.mockReset();

    mocks.requireAdmin.mockResolvedValue({ errorResponse: null });

    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      role: "USER",
      createdAt: new Date("2026-02-10T10:00:00.000Z"),
      profile: { name: "Test User" },
      preferences: { language: "IT" },
      subscription: { status: "ACTIVE", planName: "Basic" },
      _count: { messages: 3 },
    });

    mocks.messageAggregate.mockResolvedValue({
      _sum: {
        costUsd: 2.25,
        outputTokens: 150,
        reasoningTokens: 90,
      },
      _avg: {
        generationTimeMs: 240,
      },
      _count: 3,
    });

    mocks.messageFindMany.mockResolvedValue([
      {
        id: "m3",
        channel: "WEB",
        role: "ASSISTANT",
        content: "Third",
        model: "gpt-4o-mini",
        costUsd: 0.5,
        toolCalls: null,
        createdAt: new Date("2026-02-16T11:00:00.000Z"),
      },
      {
        id: "m2",
        channel: "WEB",
        role: "USER",
        content: "Second",
        model: null,
        costUsd: 0,
        toolCalls: null,
        createdAt: new Date("2026-02-16T10:00:00.000Z"),
      },
      {
        id: "m1",
        channel: "TELEGRAM",
        role: "USER",
        content: "First",
        model: null,
        costUsd: 0,
        toolCalls: null,
        createdAt: new Date("2026-02-15T09:00:00.000Z"),
      },
    ]);
  });

  it("returns requireAdmin error response as-is", async () => {
    const forbidden = Response.json({ error: "Forbidden" }, { status: 403 });
    mocks.requireAdmin.mockResolvedValue({ errorResponse: forbidden });

    const response = await GET({} as NextRequest, { params: params() });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
  });

  it("returns 404 when user is not found", async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    const response = await GET({} as NextRequest, { params: params("missing") });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "User not found" });
  });

  it("returns user detail, stats, and grouped channels", async () => {
    const response = await GET({} as NextRequest, { params: params("user-1") });

    expect(response.status).toBe(200);
    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      include: {
        profile: true,
        preferences: true,
        subscription: true,
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });
    expect(mocks.messageAggregate).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      _sum: {
        costUsd: true,
        outputTokens: true,
        reasoningTokens: true,
      },
      _avg: {
        generationTimeMs: true,
      },
      _count: true,
    });
    expect(mocks.messageFindMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        channel: true,
        role: true,
        content: true,
        model: true,
        costUsd: true,
        toolCalls: true,
        createdAt: true,
      },
    });

    await expect(response.json()).resolves.toEqual({
      user: {
        id: "user-1",
        email: "user@example.com",
        role: "USER",
        createdAt: "2026-02-10T10:00:00.000Z",
        profile: { name: "Test User" },
        preferences: { language: "IT" },
        subscription: { status: "ACTIVE", planName: "Basic" },
      },
      stats: {
        totalMessages: 3,
        totalCostUsd: 2.25,
        totalOutputTokens: 150,
        totalReasoningTokens: 90,
        avgGenerationTimeMs: 240,
      },
      channels: [
        {
          channelId: "2026-02-16",
          messageCount: 2,
          lastMessageAt: "2026-02-16T11:00:00.000Z",
          messages: [
            {
              id: "m2",
              channel: "WEB",
              role: "USER",
              content: "Second",
              model: null,
              costUsd: 0,
              toolCalls: null,
              createdAt: "2026-02-16T10:00:00.000Z",
            },
            {
              id: "m3",
              channel: "WEB",
              role: "ASSISTANT",
              content: "Third",
              model: "gpt-4o-mini",
              costUsd: 0.5,
              toolCalls: null,
              createdAt: "2026-02-16T11:00:00.000Z",
            },
          ],
        },
        {
          channelId: "2026-02-15",
          messageCount: 1,
          lastMessageAt: "2026-02-15T09:00:00.000Z",
          messages: [
            {
              id: "m1",
              channel: "TELEGRAM",
              role: "USER",
              content: "First",
              model: null,
              costUsd: 0,
              toolCalls: null,
              createdAt: "2026-02-15T09:00:00.000Z",
            },
          ],
        },
      ],
    });
  });

  it("falls back to zeroes for null aggregate values", async () => {
    mocks.messageAggregate.mockResolvedValue({
      _sum: {
        costUsd: null,
        outputTokens: null,
        reasoningTokens: null,
      },
      _avg: {
        generationTimeMs: null,
      },
      _count: 0,
    });
    mocks.messageFindMany.mockResolvedValue([]);

    const response = await GET({} as NextRequest, { params: params("user-1") });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      stats: {
        totalMessages: 0,
        totalCostUsd: 0,
        totalOutputTokens: 0,
        totalReasoningTokens: 0,
        avgGenerationTimeMs: 0,
      },
      channels: [],
    });
  });

  it("returns 500 on unexpected errors", async () => {
    mocks.userFindUnique.mockRejectedValue(new Error("db failed"));

    const response = await GET({} as NextRequest, { params: params("user-1") });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch user",
    });
  });
});
