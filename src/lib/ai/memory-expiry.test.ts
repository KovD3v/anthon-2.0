import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const memoryFindFirst = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  prisma: { memory: { findFirst: memoryFindFirst } },
}));

import {
  knownMemoryTimeZone,
  messageTimeZone,
  resolveMemoryExpiry,
} from "./memory-expiry";

describe("temporary memory date resolution", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  const resolve = (
    expression: string,
    timeZone: string | null = "Europe/Rome",
    observedAt = new Date("2026-09-19T10:00:00Z"),
  ) =>
    resolveMemoryExpiry({
      expiry: { expression },
      sourceText: `Esame ${expression}`,
      observedAt,
      timeZone,
    });

  it("anchors relative days to the persisted source's local date, not execution time", () => {
    expect(
      resolve(
        "domani",
        "Europe/Rome",
        new Date("2026-09-18T10:00:00Z"),
      )?.toISOString(),
    ).toBe("2026-09-19T22:00:00.000Z");
    expect(
      resolve(
        "domani",
        "Europe/Rome",
        new Date("2026-09-18T23:30:00Z"),
      )?.toISOString(),
    ).toBe("2026-09-20T22:00:00.000Z");
    expect(resolve("tomorrow", null)).toBeNull();
  });

  it("supports upcoming weekdays, explicit calendar dates, and exact offset timestamps", () => {
    expect(resolve("Friday")?.toISOString()).toBe("2026-09-25T22:00:00.000Z");
    expect(resolve("venerdì alle 18:00")?.toISOString()).toBe(
      "2026-09-25T16:00:00.000Z",
    );
    expect(resolve("24 ottobre 2026")?.toISOString()).toBe(
      "2026-10-24T22:00:00.000Z",
    );
    expect(resolve("October 24, 2026")?.toISOString()).toBe(
      "2026-10-24T22:00:00.000Z",
    );
    expect(resolve("2026-10-24T18:00:00+02:00", null)?.toISOString()).toBe(
      "2026-10-24T16:00:00.000Z",
    );
  });

  it("uses timezone calendar boundaries across DST and rejects ambiguous local clock times", () => {
    expect(resolve("2026-10-25")?.toISOString()).toBe(
      "2026-10-25T23:00:00.000Z",
    );
    expect(resolve("2026-10-25T02:30")).toBeNull();
    vi.setSystemTime(new Date("2026-03-28T12:00:00Z"));
    expect(
      resolve(
        "2026-03-29T02:30",
        "Europe/Rome",
        new Date("2026-03-28T12:00:00Z"),
      ),
    ).toBeNull();
  });

  it.each([
    "next Friday",
    "venerdì prossimo",
    "24 ottobre",
    "05/06/2027",
    "2026-02-30",
    "2026-09-18",
    "tomorrow at 25:00",
  ])("skips ambiguous, invalid or expired date %s", (expression) => {
    expect(resolve(expression)).toBeNull();
  });

  it("does not accept a model-invented date, timezone, or truncated next-week phrase", () => {
    const context = { observedAt: new Date(), timeZone: "Europe/Rome" };
    expect(
      resolveMemoryExpiry({
        ...context,
        sourceText: "Ho un esame",
        expiry: { expression: "domani" },
      }),
    ).toBeNull();
    expect(
      resolveMemoryExpiry({
        ...context,
        sourceText: "Ho un esame domani",
        expiry: { expression: "domani", timeZone: "America/New_York" },
      }),
    ).toBeNull();
    expect(
      resolveMemoryExpiry({
        ...context,
        sourceText: "Exam next Friday",
        expiry: { expression: "Friday" },
      }),
    ).toBeNull();
    expect(messageTimeZone({ timeZone: "not-a-zone" })).toBeNull();
    expect(messageTimeZone({ timeZone: "Europe/Rome" })).toBe("Europe/Rome");
  });

  it("loads only explicit, active account timezone facts", async () => {
    memoryFindFirst.mockResolvedValue({ value: { content: "Europe/Rome" } });
    expect(await knownMemoryTimeZone("owner")).toBe("Europe/Rome");
    expect(memoryFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "owner",
          key: { in: ["user_timezone", "timezone"] },
          status: "ACTIVE",
          origin: { in: ["EXPLICIT", "CONFIRMED"] },
        }),
      }),
    );
  });
});
