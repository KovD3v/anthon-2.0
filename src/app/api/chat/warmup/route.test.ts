import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  waitUntil: vi.fn(),
  warmDatabaseConnection: vi.fn(),
}));

vi.mock("@vercel/functions", () => ({
  waitUntil: mocks.waitUntil,
}));

vi.mock("@/lib/db", () => ({
  warmDatabaseConnection: mocks.warmDatabaseConnection,
}));

import { POST } from "./route";

describe("/api/chat/warmup route", () => {
  beforeEach(() => {
    mocks.waitUntil.mockReset();
    mocks.warmDatabaseConnection.mockReset();
    mocks.warmDatabaseConnection.mockResolvedValue(undefined);
  });

  it("schedules a database warmup for a non-empty chat id", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat/warmup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: "chat-1" }),
      }),
    );

    expect(response.status).toBe(204);
    expect(mocks.warmDatabaseConnection).toHaveBeenCalledWith(
      "chat_input_started",
    );
    expect(mocks.waitUntil).toHaveBeenCalledWith(expect.any(Promise));
  });

  it("rejects an empty chat id without warming the database", async () => {
    const response = await POST(
      new Request("http://localhost/api/chat/warmup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: "   " }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "chatId must be a non-empty string",
    });
    expect(mocks.warmDatabaseConnection).not.toHaveBeenCalled();
    expect(mocks.waitUntil).not.toHaveBeenCalled();
  });
});
