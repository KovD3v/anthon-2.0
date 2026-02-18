import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  posthogCapture: vi.fn(),
  messageCount: vi.fn(),
  messageFindMany: vi.fn(),
}));

vi.mock("@/lib/posthog", () => ({
  getPostHogClient: () => ({
    capture: mocks.posthogCapture,
  }),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    message: {
      count: mocks.messageCount,
      findMany: mocks.messageFindMany,
    },
  },
}));

import {
  analyzeSessionProgress,
  trackFunnelSession3,
  trackInboundUserMessageFunnelProgress,
} from "./funnel";

const originalEnv = { ...process.env };

describe("analytics/funnel", () => {
  beforeEach(() => {
    process.env.POSTHOG_API_KEY = "ph_test_key";
    mocks.posthogCapture.mockReset();
    mocks.messageCount.mockReset();
    mocks.messageFindMany.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("analyzes sessions using 15-minute gap and valid-session rule", () => {
    const timestamps = [
      new Date("2026-02-18T10:00:00.000Z"),
      new Date("2026-02-18T10:05:00.000Z"),
      new Date("2026-02-18T10:30:00.000Z"),
      new Date("2026-02-18T10:31:00.000Z"),
      new Date("2026-02-18T10:50:00.000Z"),
    ];

    expect(analyzeSessionProgress(timestamps)).toEqual({
      totalSessions: 3,
      validSessions: 2,
      lastSessionMessageCount: 1,
    });
  });

  it("tracks session_3 with standard funnel properties", () => {
    trackFunnelSession3({
      userId: "user-1",
      isGuest: false,
      userRole: "USER",
      channel: "WEB",
      planId: "pro",
      planName: "Pro",
      subscriptionStatus: "ACTIVE",
      validSessionsCount: 3,
    });

    expect(mocks.posthogCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: "user-1",
        event: "funnel_session_3",
        properties: expect.objectContaining({
          funnel_step: "session_3",
          is_guest: false,
          channel: "WEB",
          user_role: "USER",
          plan_id: "pro",
          plan_name: "Pro",
          subscription_status: "ACTIVE",
          session_gap_minutes: 15,
          valid_sessions_count: 3,
        }),
      }),
    );
  });

  it("tracks first_chat when the user sends their first persisted USER message", async () => {
    mocks.messageCount.mockResolvedValue(1);

    await trackInboundUserMessageFunnelProgress({
      userId: "user-1",
      isGuest: false,
      userRole: "USER",
      channel: "WEB",
      planId: null,
      subscriptionStatus: "TRIAL",
    });

    expect(mocks.posthogCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "funnel_first_chat",
      }),
    );
    expect(mocks.messageFindMany).not.toHaveBeenCalled();
  });

  it("tracks session_3 only when third valid session reaches 2 messages", async () => {
    mocks.messageCount.mockResolvedValue(6);
    mocks.messageFindMany.mockResolvedValue([
      { createdAt: new Date("2026-02-18T09:00:00.000Z") },
      { createdAt: new Date("2026-02-18T09:05:00.000Z") },
      { createdAt: new Date("2026-02-18T09:30:00.000Z") },
      { createdAt: new Date("2026-02-18T09:35:00.000Z") },
      { createdAt: new Date("2026-02-18T10:00:00.000Z") },
      { createdAt: new Date("2026-02-18T10:04:00.000Z") },
    ]);

    await trackInboundUserMessageFunnelProgress({
      userId: "user-1",
      isGuest: true,
      userRole: "USER",
      channel: "WEB_GUEST",
      planId: null,
      subscriptionStatus: null,
    });

    expect(mocks.posthogCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "funnel_session_3",
        properties: expect.objectContaining({
          valid_sessions_count: 3,
          channel: "WEB_GUEST",
        }),
      }),
    );
  });
});
