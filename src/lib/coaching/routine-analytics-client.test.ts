import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("posthog-js", () => ({ default: { capture: mocks.capture } }));

import { trackRoutineAnalytics } from "./routine-analytics-client";

describe("routine analytics client", () => {
  beforeEach(() => mocks.capture.mockReset());

  it("sends only a validated serialized event to the browser analytics client", () => {
    trackRoutineAnalytics({
      event: "routine_check_in_completed",
      routineId: "routine_opaque_1",
      formatVersion: 2,
      widgetKind: "form",
      technicalState: "success",
    });

    expect(mocks.capture).toHaveBeenCalledWith("routine_check_in_completed", {
      routine_id: "routine_opaque_1",
      format_version: 2,
      widget_kind: "form",
      technical_state: "success",
    });
  });

  it("does not send arbitrary routine content or invalid data", () => {
    trackRoutineAnalytics({
      event: "routine_saved",
      routineId: "routine_opaque_1",
      formatVersion: 1,
      widgetKind: "routine_card",
      title: "Non deve partire",
    } as never);

    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
