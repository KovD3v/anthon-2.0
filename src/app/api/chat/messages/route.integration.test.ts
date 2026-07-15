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

describe("integration /api/chat/messages", () => {
  beforeEach(async () => {
    await resetIntegrationDb();
    mocks.auth.mockReset();
  });

  it("returns only persisted messages owned by the authenticated user", async () => {
    const owner = await createUser({ clerkId: "clerk-messages-owner" });
    const other = await createUser({ clerkId: "clerk-messages-other" });
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

  it("editing preserves an earlier message with the same timestamp", async () => {
    const owner = await createUser({ clerkId: "clerk-patch-collision" });
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
