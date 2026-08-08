import type { Chat } from "@/types/chat";

const MILLISECONDS_PER_DAY = 86_400_000;

export type SidebarChat = Pick<
  Chat,
  "id" | "title" | "icon" | "messageCount" | "updatedAt"
>;

export const CHAT_PERIODS = [
  { period: "today", label: "Oggi" },
  { period: "yesterday", label: "Ieri" },
  { period: "last-7-days", label: "Ultimi 7 giorni" },
  { period: "last-30-days", label: "Ultimi 30 giorni" },
  { period: "previous", label: "Precedenti" },
] as const;

export type ChatPeriod = (typeof CHAT_PERIODS)[number]["period"];

export interface ChatPeriodGroup {
  period: ChatPeriod;
  label: string;
  chats: SidebarChat[];
}

function localDayNumber(date: Date) {
  return (
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) /
    MILLISECONDS_PER_DAY
  );
}

export function getChatPeriod(updatedAt: string, now = new Date()): ChatPeriod {
  const updatedDate = new Date(updatedAt);
  if (
    Number.isNaN(updatedDate.getTime()) ||
    updatedDate.getTime() > now.getTime()
  ) {
    return "previous";
  }

  const daysAgo = localDayNumber(now) - localDayNumber(updatedDate);
  if (daysAgo === 0) return "today";
  if (daysAgo === 1) return "yesterday";
  if (daysAgo >= 2 && daysAgo <= 7) return "last-7-days";
  if (daysAgo >= 8 && daysAgo <= 30) return "last-30-days";
  return "previous";
}

export function groupChatsByPeriod(
  chats: readonly SidebarChat[],
  now = new Date(),
): ChatPeriodGroup[] {
  const grouped = new Map<ChatPeriod, SidebarChat[]>();
  for (const chat of chats) {
    const period = getChatPeriod(chat.updatedAt, now);
    const items = grouped.get(period) ?? [];
    items.push(chat);
    grouped.set(period, items);
  }

  return CHAT_PERIODS.flatMap(({ period, label }) => {
    const items = grouped.get(period);
    return items ? [{ period, label, chats: items }] : [];
  });
}
