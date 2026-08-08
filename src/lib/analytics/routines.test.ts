import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ capture: vi.fn() }));

vi.mock("@/lib/posthog", () => ({
  getPostHogClient: () => ({ capture: mocks.capture }),
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

import {
  routineAnalyticsEventSchema,
  trackRoutineAnalyticsEvent,
} from "./routines";

describe("routine analytics", () => {
  beforeEach(() => {
    process.env.POSTHOG_API_KEY = "ph_test";
    mocks.capture.mockReset();
  });

  it("captures only validated, content-free routine properties", () => {
    trackRoutineAnalyticsEvent({
      event: "routine_completed",
      routineId: "routine_opaque_1",
      formatVersion: 2,
      widgetKind: "breathing",
      durationSeconds: 120,
      technicalState: "success",
    });

    expect(mocks.capture).toHaveBeenCalledWith({
      distinctId: "routine_opaque_1",
      event: "routine_completed",
      properties: {
        routine_id: "routine_opaque_1",
        format_version: 2,
        widget_kind: "breathing",
        duration_seconds: 120,
        technical_state: "success",
      },
    });
    expect(
      routineAnalyticsEventSchema.safeParse({
        event: "routine_completed",
        routineId: "routine_opaque_1",
        formatVersion: 2,
        widgetKind: "breathing",
        title: "Contenuto privato",
      }).success,
    ).toBe(false);
  });

  it("models a 7/14 day restart as an aggregate temporal window without routine content", () => {
    const event = routineAnalyticsEventSchema.parse({
      event: "routine_restarted_within_14d",
      routineId: "routine_opaque_1",
      formatVersion: 1,
      widgetKind: "instruction",
      temporalWindowDays: 14,
      technicalState: "success",
    });

    expect(event).toEqual(expect.objectContaining({ temporalWindowDays: 14 }));
    expect(JSON.stringify(event)).not.toMatch(
      /title|trigger|steps|note|answer/i,
    );
  });
});
