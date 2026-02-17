import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRelativeTime } from "./format-time";

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-16T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns Just now for dates under 60 seconds", () => {
    expect(formatRelativeTime(new Date("2026-02-16T11:59:30.000Z"))).toBe(
      "Just now",
    );
  });

  it("formats minutes for dates under 60 minutes", () => {
    expect(formatRelativeTime(new Date("2026-02-16T11:55:00.000Z"))).toBe(
      "5 min ago",
    );
  });

  it("handles singular and plural hours", () => {
    expect(formatRelativeTime(new Date("2026-02-16T11:00:00.000Z"))).toBe(
      "1 hour ago",
    );
    expect(formatRelativeTime(new Date("2026-02-16T10:00:00.000Z"))).toBe(
      "2 hours ago",
    );
  });

  it("returns Yesterday for one day difference", () => {
    expect(formatRelativeTime(new Date("2026-02-15T12:00:00.000Z"))).toBe(
      "Yesterday",
    );
  });

  it("returns days ago for differences under 7 days", () => {
    expect(formatRelativeTime(new Date("2026-02-13T12:00:00.000Z"))).toBe(
      "3 days ago",
    );
  });

  it("formats older dates as calendar date", () => {
    const result = formatRelativeTime(new Date("2025-12-01T12:00:00.000Z"));
    expect(result).toContain("2025");
  });
});
