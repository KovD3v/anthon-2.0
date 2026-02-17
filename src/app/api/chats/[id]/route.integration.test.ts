import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createChat,
  createMessage,
  createUser,
  resetIntegrationDb,
  toAuthUser,
} from "@/test/integration/factories";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  revalidateTag: vi.fn(),
  generateChatTitle: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAuthUser: mocks.getAuthUser,
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
}));

vi.mock("@/lib/ai/chat-title", () => ({
  generateChatTitle: mocks.generateChatTitle,
}));

import { DELETE, GET, PATCH } from "./route";

function routeParams(chatId: string) {
  return { params: Promise.resolve({ id: chatId }) };
}

describe("integration /api/chats/[id]", () => {
  beforeEach(async () => {
    await resetIntegrationDb();
    mocks.getAuthUser.mockReset();
    mocks.revalidateTag.mockReset();
    mocks.generateChatTitle.mockReset();
    mocks.revalidateTag.mockImplementation(() => {});
  });

  it("GET returns cursor pagination in chronological order", async () => {
    const user = await createUser();
    const chat = await createChat(user.id, { title: "Session" });

    const t1 = new Date("2026-02-17T10:00:00.000Z");
    const t2 = new Date("2026-02-17T10:01:00.000Z");
    const t3 = new Date("2026-02-17T10:02:00.000Z");

    const m1 = await createMessage({
      userId: user.id,
      chatId: chat.id,
      role: "USER",
      content: "first",
      createdAt: t1,
    });
    const m2 = await createMessage({
      userId: user.id,
      chatId: chat.id,
      role: "ASSISTANT",
      content: "second",
      createdAt: t2,
    });
    const m3 = await createMessage({
      userId: user.id,
      chatId: chat.id,
      role: "USER",
      content: "third",
      createdAt: t3,
    });

    mocks.getAuthUser.mockResolvedValue({
      user: toAuthUser(user),
      error: null,
    });

    const firstPage = await GET(
      new Request(`http://localhost/api/chats/${chat.id}?limit=2`),
      routeParams(chat.id),
    );
    const firstBody = (await firstPage.json()) as {
      messages: Array<{ id: string }>;
      pagination: { hasMore: boolean; nextCursor: string | null };
    };

    expect(firstPage.status).toBe(200);
    expect(firstBody.messages.map((m) => m.id)).toEqual([m2.id, m3.id]);
    expect(firstBody.pagination.hasMore).toBe(true);
    expect(firstBody.pagination.nextCursor).toBe(m2.id);

    const secondPage = await GET(
      new Request(
        `http://localhost/api/chats/${chat.id}?limit=2&cursor=${firstBody.pagination.nextCursor}`,
      ),
      routeParams(chat.id),
    );
    const secondBody = (await secondPage.json()) as {
      messages: Array<{ id: string }>;
      pagination: { hasMore: boolean; nextCursor: string | null };
    };

    expect(secondPage.status).toBe(200);
    expect(secondBody.messages.map((m) => m.id)).toEqual([m1.id]);
    expect(secondBody.pagination.hasMore).toBe(false);
    expect(secondBody.pagination.nextCursor).toBeNull();
  });

  it("PATCH can generate a title from first user message", async () => {
    const user = await createUser();
    const chat = await createChat(user.id);
    await createMessage({
      userId: user.id,
      chatId: chat.id,
      role: "USER",
      content: "Find my weekly running plan",
      createdAt: new Date("2026-02-17T10:00:00.000Z"),
    });

    mocks.getAuthUser.mockResolvedValue({
      user: toAuthUser(user),
      error: null,
    });
    mocks.generateChatTitle.mockResolvedValue("Weekly Running Plan");

    const response = await PATCH(
      new Request(`http://localhost/api/chats/${chat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generateTitle: true }),
      }),
      routeParams(chat.id),
    );
    const body = (await response.json()) as { title: string };

    expect(response.status).toBe(200);
    expect(body.title).toBe("Weekly Running Plan");
    expect(mocks.generateChatTitle).toHaveBeenCalledWith(
      "Find my weekly running plan",
    );
    expect(mocks.revalidateTag).toHaveBeenCalledWith(`chat-${chat.id}`, "page");
    expect(mocks.revalidateTag).toHaveBeenCalledWith(
      `chats-${user.id}`,
      "page",
    );
  });

  it("DELETE succeeds even when revalidateTag throws", async () => {
    const user = await createUser();
    const chat = await createChat(user.id, { title: "Delete me" });
    await createMessage({
      userId: user.id,
      chatId: chat.id,
      role: "USER",
      content: "temporary",
    });

    mocks.getAuthUser.mockResolvedValue({
      user: toAuthUser(user),
      error: null,
    });
    mocks.revalidateTag.mockImplementation(() => {
      throw new Error("cache unavailable");
    });

    const response = await DELETE(
      new Request(`http://localhost/api/chats/${chat.id}`, {
        method: "DELETE",
      }),
      routeParams(chat.id),
    );
    const body = (await response.json()) as { success: boolean };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const deleted = await prisma.chat.findFirst({
      where: { id: chat.id, userId: user.id },
    });
    expect(deleted).toBeNull();
  });
});
