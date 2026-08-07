// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatList } from "./ChatList";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  m: {
    div: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    li: ({ children }: { children: ReactNode }) => <li>{children}</li>,
    p: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  },
  useReducedMotion: () => true,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    prefetch: _prefetch,
    ...props
  }: ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a {...props}>{children}</a>
  ),
}));

const now = new Date(2026, 7, 7, 12);

function localIso(daysAgo: number) {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

function renderChatList(
  chats: ComponentProps<typeof ChatList>["chats"],
) {
  return render(
    <ChatList
      chats={chats}
      isLoading={false}
      isCreatingChat={false}
      currentChatId={null}
      deletingChatId={null}
      onDelete={vi.fn()}
      onSelect={vi.fn()}
      onCreate={vi.fn()}
      onRename={vi.fn(async () => true)}
      onPreFetch={vi.fn()}
    />,
  );
}

function chat(id: string, daysAgo: number) {
  return {
    id,
    title: id,
    messageCount: 1,
    updatedAt: localIso(daysAgo),
  };
}

beforeEach(() => vi.useFakeTimers({ now }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ChatList period sections", () => {
  it("renders non-empty period headings in recency order", () => {
    renderChatList([chat("oggi", 0), chat("ieri", 1), chat("vecchia", 31)]);

    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["Oggi", "Ieri", "Precedenti"]);
    expect(
      screen.queryByRole("heading", { name: "Ultimi 7 giorni" }),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "oggi" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "vecchia" })).toBeTruthy();
  });
});
