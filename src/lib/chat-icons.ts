export const CHAT_ICON_KEYS = [
  "TARGET",
  "TROPHY",
  "DUMBBELL",
  "ACTIVITY",
  "BRAIN",
  "HEART_PULSE",
  "TIMER",
  "CALENDAR_DAYS",
  "FLAME",
  "SHIELD",
  "USERS",
  "FOOTPRINTS",
  "REFRESH_CCW",
  "MESSAGE_SQUARE",
] as const;

export type ChatIcon = (typeof CHAT_ICON_KEYS)[number];

const CHAT_ICON_KEY_SET = new Set<string>(CHAT_ICON_KEYS);

export function normalizeChatIcon(value: unknown): ChatIcon {
  return typeof value === "string" && CHAT_ICON_KEY_SET.has(value)
    ? (value as ChatIcon)
    : "MESSAGE_SQUARE";
}
