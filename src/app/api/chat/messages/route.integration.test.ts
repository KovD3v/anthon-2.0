import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createChat,
  createMessage,
  createUser,
  resetIntegrationDb,
} from "@/test/integration/factories";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
}));

import { DELETE, GET, PATCH } from "./route";

async function createMessageWithId(input: {
  id: string;
  userId: string;
  chatId: string;
  text: string;
  createdAt: Date;
}) {
  const thread = await prisma.conversationThread.findUniqueOrThrow({
    where: { chatId: input.chatId },
    select: { id: true },
  });

  return prisma.message.create({
    data: {
      id: input.id,
      userId: input.userId,
      chatId: input.chatId,
      conversationThreadId: thread.id,
      role: "USER",
      direction: "INBOUND",
      channel: "WEB",
      type: "TEXT",
      parts: [{ type: "text", text: input.text }],
      createdAt: input.createdAt,
    },
  });
}

async function completeOnboarding(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { onboardingCompletedAt: new Date("2026-07-13T09:00:00.000Z") },
  });
}

describe("integration /api/chat/messages", () => {
  beforeEach(async () => {
    await resetIntegrationDb();
    mocks.auth.mockReset();
  });

  it("returns only persisted messages owned by the authenticated user", async () => {
    const owner = await createUser({ clerkId: "clerk-messages-owner" });
    const other = await createUser({ clerkId: "clerk-messages-other" });
    await completeOnboarding(owner.id);
    await completeOnboarding(other.id);
    const ownerChat = await createChat(owner.id);
    const otherChat = await createChat(other.id);

    const ownerMessage = await createMessage({
      userId: owner.id,
      chatId: ownerChat.id,
      text: "Owner-only coaching context",
      createdAt: new Date("2026-07-13T10:00:00.000Z"),
    });
    await createMessage({
      userId: other.id,
      chatId: otherChat.id,
      text: "Other user's private context",
      createdAt: new Date("2026-07-13T10:01:00.000Z"),
    });

    mocks.auth.mockResolvedValue({ userId: owner.clerkId });

    const ownResponse = await GET(
      new Request(`http://localhost/api/chat/messages?chatId=${ownerChat.id}`),
    );
    const ownBody = (await ownResponse.json()) as {
      messages: Array<{ id: string; content: string }>;
    };

    expect(ownResponse.status).toBe(200);
    expect(ownBody.messages).toEqual([
      expect.objectContaining({
        id: ownerMessage.id,
        content: "Owner-only coaching context",
      }),
    ]);

    const forbiddenChatResponse = await GET(
      new Request(`http://localhost/api/chat/messages?chatId=${otherChat.id}`),
    );

    expect(forbiddenChatResponse.status).toBe(200);
    await expect(forbiddenChatResponse.json()).resolves.toEqual({
      messages: [],
    });
  });

  it("does not delete a persisted message owned by another authenticated user", async () => {
    const owner = await createUser({ clerkId: "clerk-delete-owner" });
    const other = await createUser({ clerkId: "clerk-delete-other" });
    await completeOnboarding(owner.id);
    await completeOnboarding(other.id);
    const ownerChat = await createChat(owner.id);
    const ownerMessage = await createMessage({
      userId: owner.id,
      chatId: ownerChat.id,
      text: "Keep this private message",
    });

    mocks.auth.mockResolvedValue({ userId: other.clerkId });

    const response = await DELETE(
      new Request(`http://localhost/api/chat/messages?id=${ownerMessage.id}`, {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    await expect(
      prisma.message.findUnique({
        where: { id: ownerMessage.id },
        select: { id: true, userId: true },
      }),
    ).resolves.toEqual({ id: ownerMessage.id, userId: owner.id });
  });

  it("deletes only the selected message and later messages in total order", async () => {
    const owner = await createUser({ clerkId: "clerk-delete-collision" });
    await completeOnboarding(owner.id);
    const chat = await createChat(owner.id);
    const collisionTime = new Date("2026-07-13T10:00:00.000Z");
    const laterTime = new Date("2026-07-13T10:01:00.000Z");

    await createMessageWithId({
      id: "collision-001",
      userId: owner.id,
      chatId: chat.id,
      text: "Earlier message",
      createdAt: collisionTime,
    });
    await createMessageWithId({
      id: "collision-002",
      userId: owner.id,
      chatId: chat.id,
      text: "Selected message",
      createdAt: collisionTime,
    });
    await createMessageWithId({
      id: "collision-003",
      userId: owner.id,
      chatId: chat.id,
      text: "Later message",
      createdAt: laterTime,
    });

    mocks.auth.mockResolvedValue({ userId: owner.clerkId });

    const response = await DELETE(
      new Request("http://localhost/api/chat/messages?id=collision-002", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      deletedCount: 2,
    });
    await expect(
      prisma.message.findMany({
        where: { chatId: chat.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      }),
    ).resolves.toEqual([{ id: "collision-001" }]);
  });

  it("erases deleted-source facts while preserving facts from surviving messages", async () => {
    const owner = await createUser({ clerkId: "clerk-delete-derived-data" });
    await completeOnboarding(owner.id);
    const chat = await createChat(owner.id);
    const earlier = await createMessage({
      userId: owner.id,
      chatId: chat.id,
      text: "Keep this source",
      createdAt: new Date("2026-07-13T10:00:00.000Z"),
    });
    const selected = await createMessage({
      userId: owner.id,
      chatId: chat.id,
      text: "Erase this source",
      createdAt: new Date("2026-07-13T10:01:00.000Z"),
    });
    await createMessage({
      userId: owner.id,
      chatId: chat.id,
      role: "ASSISTANT",
      createdAt: new Date("2026-07-13T10:02:00.000Z"),
    });
    const threadId = selected.conversationThreadId;
    if (!threadId) throw new Error("Expected a conversation thread");

    const deletedSourceMemory = await prisma.memory.create({
      data: {
        userId: owner.id,
        key: "deleted-source-fact",
        value: { secret: "must disappear" },
        origin: "INFERRED",
        sourceMessageId: selected.id,
        sourceThreadId: threadId,
      },
    });
    const legacyThreadMemory = await prisma.memory.create({
      data: {
        userId: owner.id,
        key: "legacy-thread-fact",
        value: { secret: "legacy must disappear" },
        origin: "MIGRATED",
        sourceThreadId: threadId,
      },
    });
    const survivingMemory = await prisma.memory.create({
      data: {
        userId: owner.id,
        key: "surviving-source-fact",
        value: { secret: "keep this value" },
        origin: "INFERRED",
        sourceMessageId: earlier.id,
        sourceThreadId: threadId,
      },
    });
    const deletedSourceRevision = await prisma.memoryRevision.create({
      data: {
        userId: owner.id,
        memoryId: survivingMemory.id,
        sourceMessageId: selected.id,
        previousValue: { secret: "old" },
        nextValue: { secret: "new" },
        origin: "INFERRED",
        reason: "test deleted source",
        dedupeKey: "delete-derived-revision",
      },
    });
    const chunk = await prisma.conversationRecallChunk.create({
      data: {
        userId: owner.id,
        conversationThreadId: threadId,
        channel: "WEB",
        startMessageId: earlier.id,
        endMessageId: selected.id,
        throughMessageId: selected.id,
        content: "user: Erase this source",
        sourceCreatedAt: selected.createdAt,
      },
    });
    const summary = await prisma.conversationThreadSummary.create({
      data: {
        conversationThreadId: threadId,
        summary: "Summary containing deleted source",
        throughMessageId: selected.id,
        throughMessageCreatedAt: selected.createdAt,
      },
    });
    const approval = await prisma.memoryApproval.create({
      data: {
        userId: owner.id,
        sourceInboundMessageId: selected.id,
        key: "pending-deleted-fact",
        value: { secret: "pending" },
        category: "other",
        confidence: 0.8,
        expiresAt: new Date("2026-07-20T00:00:00.000Z"),
      },
    });

    mocks.auth.mockResolvedValue({ userId: owner.clerkId });

    const response = await DELETE(
      new Request(`http://localhost/api/chat/messages?id=${selected.id}`, {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      deletedCount: 2,
    });
    await expect(
      prisma.memory.findUnique({ where: { id: deletedSourceMemory.id } }),
    ).resolves.toBeNull();
    await expect(
      prisma.memory.findUnique({ where: { id: legacyThreadMemory.id } }),
    ).resolves.toBeNull();
    await expect(
      prisma.memory.findUnique({ where: { id: survivingMemory.id } }),
    ).resolves.toMatchObject({ value: { secret: "keep this value" } });
    await expect(
      prisma.memoryRevision.findUnique({
        where: { id: deletedSourceRevision.id },
      }),
    ).resolves.toBeNull();
    await expect(
      prisma.conversationRecallChunk.findUnique({ where: { id: chunk.id } }),
    ).resolves.toBeNull();
    await expect(
      prisma.conversationThreadSummary.findUnique({
        where: { id: summary.id },
      }),
    ).resolves.toBeNull();
    await expect(
      prisma.memoryApproval.findUnique({ where: { id: approval.id } }),
    ).resolves.toBeNull();
  });

  it("editing preserves an earlier message with the same timestamp", async () => {
    const owner = await createUser({ clerkId: "clerk-patch-collision" });
    await completeOnboarding(owner.id);
    const chat = await createChat(owner.id);
    const collisionTime = new Date("2026-07-13T10:00:00.000Z");
    const laterTime = new Date("2026-07-13T10:01:00.000Z");

    await createMessageWithId({
      id: "edit-collision-001",
      userId: owner.id,
      chatId: chat.id,
      text: "Earlier message",
      createdAt: collisionTime,
    });
    await createMessageWithId({
      id: "edit-collision-002",
      userId: owner.id,
      chatId: chat.id,
      text: "Selected message",
      createdAt: collisionTime,
    });
    await createMessageWithId({
      id: "edit-collision-003",
      userId: owner.id,
      chatId: chat.id,
      text: "Later message",
      createdAt: laterTime,
    });

    mocks.auth.mockResolvedValue({ userId: owner.clerkId });

    const response = await PATCH(
      new Request("http://localhost/api/chat/messages", {
        method: "PATCH",
        body: JSON.stringify({
          messageId: "edit-collision-002",
          content: "Edited message",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      deletedCount: 2,
      newContent: "Edited message",
    });
    await expect(
      prisma.message.findMany({
        where: { chatId: chat.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      }),
    ).resolves.toEqual([{ id: "edit-collision-001" }]);
  });
});
