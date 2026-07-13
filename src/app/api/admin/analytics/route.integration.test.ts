import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeSessionProgress } from "@/lib/analytics/funnel";
import {
  createChat,
  createMessage,
  createUser,
  resetIntegrationDb,
  toAuthUser,
} from "@/test/integration/factories";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

import { GET } from "./route";

function getRequest(url = "http://localhost/api/admin/analytics?type=funnel") {
  return { url } as Request;
}

describe("integration /api/admin/analytics", () => {
  beforeEach(async () => {
    await resetIntegrationDb();
    mocks.requireAdmin.mockReset();

    const admin = await createUser({ role: "ADMIN" });
    mocks.requireAdmin.mockResolvedValue({
      user: toAuthUser(admin),
      errorResponse: null,
    });
  });

  it("matches the existing strict 15-minute session boundaries in the funnel", async () => {
    const user = await createUser();
    const chat = await createChat(user.id);
    const timestamps = [
      new Date("2026-07-13T09:00:00.000Z"),
      new Date("2026-07-13T09:15:00.000Z"),
      new Date("2026-07-13T09:30:00.001Z"),
      new Date("2026-07-13T09:45:00.001Z"),
      new Date("2026-07-13T10:00:00.002Z"),
      new Date("2026-07-13T10:15:00.002Z"),
    ];

    await Promise.all(
      timestamps.map((createdAt) =>
        createMessage({
          userId: user.id,
          chatId: chat.id,
          createdAt,
        }),
      ),
    );

    // The pure helper is the pre-optimization behavior the SQL query mirrors:
    // exactly 15 minutes does not start a session; 15 minutes plus 1 ms does.
    expect(analyzeSessionProgress(timestamps)).toEqual({
      totalSessions: 3,
      validSessions: 3,
      lastSessionMessageCount: 2,
    });

    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      funnel: {
        signup: 2,
        firstChat: 1,
        session3: 1,
        upgrade: 0,
        signupAll: 2,
        firstChatAll: 1,
        session3All: 1,
        upgradeAll: 0,
      },
    });
  });
});
