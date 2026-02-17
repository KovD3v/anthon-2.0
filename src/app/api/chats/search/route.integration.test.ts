import { beforeEach, describe, expect, it, vi } from "vitest";
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

import { GET } from "./route";

describe("integration /api/chats/search", () => {
  beforeEach(async () => {
    await resetIntegrationDb();
    mocks.auth.mockReset();
  });

  it("returns 400 for query shorter than 2 chars", async () => {
    const user = await createUser({ clerkId: "clerk-search-1" });
    mocks.auth.mockResolvedValue({ userId: user.clerkId });

    const response = await GET(
      new Request("http://localhost/api/chats/search?q=a"),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toContain("at least 2 characters");
  });

  it("returns only messages from the authenticated user", async () => {
    const owner = await createUser({ clerkId: "clerk-search-owner" });
    const other = await createUser({ clerkId: "clerk-search-other" });

    const ownerChat = await createChat(owner.id, { title: "Owner chat" });
    const otherChat = await createChat(other.id, { title: "Other chat" });

    const ownerMessage = await createMessage({
      userId: owner.id,
      chatId: ownerChat.id,
      role: "USER",
      content: "tempo run plan for today",
    });
    await createMessage({
      userId: other.id,
      chatId: otherChat.id,
      role: "USER",
      content: "tempo run plan from another user",
    });

    mocks.auth.mockResolvedValue({ userId: owner.clerkId });

    const response = await GET(
      new Request("http://localhost/api/chats/search?q=tempo"),
    );
    const body = (await response.json()) as {
      results: Array<{ id: string; snippet: string }>;
      query: string;
    };

    expect(response.status).toBe(200);
    expect(body.query).toBe("tempo");
    expect(body.results).toHaveLength(1);
    expect(body.results[0]?.id).toBe(ownerMessage.id);
    expect(body.results[0]?.snippet.toLowerCase()).toContain("tempo");
  });

  it("caps results to 20 and includes snippets", async () => {
    const user = await createUser({ clerkId: "clerk-search-2" });
    const chat = await createChat(user.id, { title: "Bulk chat" });

    for (let i = 0; i < 25; i += 1) {
      await createMessage({
        userId: user.id,
        chatId: chat.id,
        role: "USER",
        content: `message ${i} with marathon pace advice`,
        createdAt: new Date(`2026-02-17T10:${String(i).padStart(2, "0")}:00Z`),
      });
    }

    mocks.auth.mockResolvedValue({ userId: user.clerkId });

    const response = await GET(
      new Request("http://localhost/api/chats/search?q=marathon"),
    );
    const body = (await response.json()) as {
      results: Array<{ snippet: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(20);
    expect(
      body.results.every((item) =>
        item.snippet.toLowerCase().includes("marathon"),
      ),
    ).toBe(true);
  });
});
