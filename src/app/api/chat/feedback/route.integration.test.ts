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

import { POST } from "./route";

describe("integration /api/chat/feedback", () => {
  beforeEach(async () => {
    await resetIntegrationDb();
    mocks.auth.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const response = await POST(
      new Request("http://localhost/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: "x", feedback: 1 }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("updates feedback for assistant message owned by user", async () => {
    const user = await createUser({ clerkId: "clerk-feedback-1" });
    const chat = await createChat(user.id);
    const assistantMessage = await createMessage({
      userId: user.id,
      chatId: chat.id,
      role: "ASSISTANT",
      content: "Coach response",
      feedback: null,
    });

    mocks.auth.mockResolvedValue({ userId: user.clerkId });

    const response = await POST(
      new Request("http://localhost/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: assistantMessage.id, feedback: -1 }),
      }),
    );
    const body = (await response.json()) as {
      success: boolean;
      messageId: string;
      feedback: number;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      messageId: assistantMessage.id,
      feedback: -1,
    });

    const updated = await prisma.message.findFirst({
      where: { id: assistantMessage.id },
      select: { feedback: true },
    });
    expect(updated?.feedback).toBe(-1);
  });

  it("returns 404 for non-assistant messages", async () => {
    const user = await createUser({ clerkId: "clerk-feedback-2" });
    const chat = await createChat(user.id);
    const userMessage = await createMessage({
      userId: user.id,
      chatId: chat.id,
      role: "USER",
      content: "User prompt",
    });

    mocks.auth.mockResolvedValue({ userId: user.clerkId });

    const response = await POST(
      new Request("http://localhost/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: userMessage.id, feedback: 1 }),
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(404);
    expect(body.error).toContain("Message not found");
  });
});
