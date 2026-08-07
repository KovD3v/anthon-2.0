import { describe, expect, it } from "vitest";
import { getChatPeriod, groupChatsByPeriod } from "./chat-periods";

const now = new Date(2026, 7, 7, 12);

function localIso(daysAgo: number) {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

function chat(id: string, updatedAt: string) {
  return { id, title: id, messageCount: 1, updatedAt };
}

describe("getChatPeriod", () => {
  it("classifies calendar boundaries and safe fallbacks", () => {
    expect(getChatPeriod(localIso(0), now)).toBe("today");
    expect(getChatPeriod(localIso(1), now)).toBe("yesterday");
    expect(getChatPeriod(localIso(7), now)).toBe("last-7-days");
    expect(getChatPeriod(localIso(8), now)).toBe("last-30-days");
    expect(getChatPeriod(localIso(30), now)).toBe("last-30-days");
    expect(getChatPeriod(localIso(31), now)).toBe("previous");
    expect(getChatPeriod("not-a-date", now)).toBe("previous");
    expect(getChatPeriod(new Date(2026, 7, 8, 12).toISOString(), now)).toBe(
      "previous",
    );
  });
});

describe("groupChatsByPeriod", () => {
  it("returns non-empty groups in period order and preserves chat order", () => {
    const groups = groupChatsByPeriod(
      [
        chat("old", localIso(31)),
        chat("today-1", localIso(0)),
        chat("today-2", localIso(0)),
        chat("yesterday", localIso(1)),
      ],
      now,
    );

    expect(groups.map((group) => group.period)).toEqual([
      "today",
      "yesterday",
      "previous",
    ]);
    expect(groups[0]?.chats.map((item) => item.id)).toEqual([
      "today-1",
      "today-2",
    ]);
  });
});
