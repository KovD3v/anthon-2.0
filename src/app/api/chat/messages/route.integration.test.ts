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

import { DELETE, GET } from "./route";

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
});
