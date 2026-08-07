# Chat Sidebar Periods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raggruppare le conversazioni della sidebar in `Oggi`, `Ieri`, `Ultimi 7 giorni`, `Ultimi 30 giorni` e `Precedenti`, con divider accessibili e senza modificare API o database.

**Architecture:** Un helper puro nel perimetro dei componenti chat calcola la differenza tra giorni di calendario locali e raggruppa le chat mantenendo l'ordine ricevuto. `ChatList` renderizza solo i gruppi non vuoti, lasciando invariati `ChatItem`, i callback e le animazioni degli elementi.

**Tech Stack:** TypeScript, React 19, Vitest, Testing Library, Framer Motion, Tailwind CSS 4, Biome.

## Global Constraints

- Usa il calendario locale dell'utente: differenza `0` = `Oggi`, `1` = `Ieri`, `2–7` = `Ultimi 7 giorni`, `8–30` = `Ultimi 30 giorni`, `>30` = `Precedenti`.
- Date future o non valide ricadono in `Precedenti` senza interrompere il rendering.
- Mantieni l'ordine esistente delle chat e tutti i callback di selezione, rename, delete e prefetch.
- Non modificare API, query Prisma, schema, CSS globale o i file già modificati nel worktree.
- Usa `bun`/`bunx`, Biome e test Vitest esistenti; non aggiungere dipendenze.
- Committa solo i file del task corrente, preservando le modifiche non correlate.

## File Map

- Create: `src/app/(chat)/components/chat-periods.ts` — tipi e funzioni pure per classificare e raggruppare le chat.
- Test: `src/app/(chat)/components/chat-periods.test.ts` — soglie temporali, fallback e ordine dei gruppi.
- Modify: `src/app/(chat)/components/ChatList.tsx` — usa `updatedAt` e renderizza sezioni con divider.
- Test: `src/app/(chat)/components/ChatList.test.tsx` — verifica le intestazioni visibili e l'omissione dei gruppi vuoti.

### Task 1: Add the calendar grouping helper

**Files:**

- Create: `src/app/(chat)/components/chat-periods.ts`
- Test: `src/app/(chat)/components/chat-periods.test.ts`

**Interfaces:**

- Consumes: `Chat` from `@/types/chat`, specifically `id`, `title`, `messageCount` and `updatedAt`.
- Produces: `SidebarChat`, `ChatPeriod`, `ChatPeriodGroup`, `getChatPeriod(updatedAt, now?)` and `groupChatsByPeriod(chats, now?)` for `ChatList`.

- [ ] **Step 1: Write the failing unit tests**

Create the test with local `Date` constructors so it remains independent of the machine timezone:

```ts
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
```

- [ ] **Step 2: Run the helper tests and verify the expected failure**

Run: `bunx vitest run 'src/app/(chat)/components/chat-periods.test.ts'`

Expected: FAIL because `chat-periods.ts` and its exported functions do not exist yet. The failure must be a module/export failure, not a test syntax error.

- [ ] **Step 3: Implement the minimal pure helper**

Use local date fields converted to a UTC day number so daylight-saving transitions do not change the calendar-day difference:

```ts
import type { Chat } from "@/types/chat";

const MILLISECONDS_PER_DAY = 86_400_000;

export type SidebarChat = Pick<
  Chat,
  "id" | "title" | "messageCount" | "updatedAt"
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

export function getChatPeriod(
  updatedAt: string,
  now = new Date(),
): ChatPeriod {
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
```

- [ ] **Step 4: Run the helper tests and verify they pass**

Run: `bunx vitest run 'src/app/(chat)/components/chat-periods.test.ts'`

Expected: PASS with all boundary and grouping assertions green.

- [ ] **Step 5: Commit the helper independently**

```bash
git add -- 'src/app/(chat)/components/chat-periods.ts' 'src/app/(chat)/components/chat-periods.test.ts'
git commit -m "feat: add chat sidebar period grouping"
```

### Task 2: Render the grouped chat sidebar

**Files:**

- Modify: `src/app/(chat)/components/ChatList.tsx:20-135` for the sidebar summary type and grouped markup.
- Create: `src/app/(chat)/components/ChatList.test.tsx` for the rendered headings.

**Interfaces:**

- Consumes: `SidebarChat` and `groupChatsByPeriod` from `./chat-periods`.
- Produces: one semantic section per non-empty period, each with an Italian heading, divider line and the existing `ChatItem` list.

- [ ] **Step 1: Write the failing component test**

Use the existing jsdom/Testing Library pattern and mock Framer Motion and Next Link at the component boundary:

```tsx
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
  default: ({ children, ...props }: { children: ReactNode }) => (
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
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual(["Oggi", "Ieri", "Precedenti"]);
    expect(screen.queryByRole("heading", { name: "Ultimi 7 giorni" })).toBeNull();
    expect(screen.getByRole("link", { name: "oggi" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "vecchia" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the component test and verify the expected failure**

Run: `bunx vitest run 'src/app/(chat)/components/ChatList.test.tsx'`

Expected: FAIL because the current `ChatList` renders no period headings. If the mock or DOM environment fails first, correct the test boundary until the assertion fails for the missing feature.

- [ ] **Step 3: Implement the grouped markup without changing item behavior**

In `ChatList.tsx`, replace the local `Chat` interface with the imported `SidebarChat`, compute groups once per render, and replace the single list with sections:

```tsx
import {
  groupChatsByPeriod,
  type SidebarChat,
} from "./chat-periods";

// ...

const chatGroups = groupChatsByPeriod(chats);

// ... inside the non-empty branch
<div className="space-y-3">
  {chatGroups.map(({ period, label, chats: periodChats }) => {
    const headingId = `chat-period-${period}`;

    return (
      <section key={period} aria-labelledby={headingId}>
        <div className="mb-1.5 flex items-center gap-2 px-2">
          <h3
            id={headingId}
            className="shrink-0 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground/75"
          >
            {label}
          </h3>
          <div
            aria-hidden="true"
            className="h-px min-w-0 flex-1 bg-border/60 dark:bg-white/10"
          />
        </div>
        <ul className="space-y-1">
          <AnimatePresence mode="popLayout">
            {periodChats.map((chat) => (
              <ChatItem
                key={chat.id}
                chat={chat}
                isActive={chat.id === currentChatId}
                isDeleting={deletingChatId === chat.id}
                onDelete={() => onDelete(chat.id)}
                onClick={() => onSelect(chat.id)}
                onPreFetch={() => onPreFetch(chat.id)}
                onRename={(newTitle) => onRename(chat.id, newTitle)}
              />
            ))}
          </AnimatePresence>
        </ul>
      </section>
    );
  })}
</div>
```

Keep the existing `Conversazioni` count, empty state, loading state, `ChatItem` implementation and all callback wiring unchanged. `SidebarChat` contains the same fields previously used by `ChatItem`, plus `updatedAt`.

- [ ] **Step 4: Run the component and helper tests and verify they pass**

Run: `bunx vitest run 'src/app/(chat)/components/chat-periods.test.ts' 'src/app/(chat)/components/ChatList.test.tsx'`

Expected: PASS with the five period rules and the rendered heading order covered.

- [ ] **Step 5: Commit only the sidebar feature files**

```bash
git add -- 'src/app/(chat)/components/ChatList.tsx' 'src/app/(chat)/components/ChatList.test.tsx'
git commit -m "feat: divide chat sidebar by period"
```

### Task 3: Run the repository verification gates

**Files:**

- Verify: `src/app/(chat)/components/chat-periods.ts`
- Verify: `src/app/(chat)/components/chat-periods.test.ts`
- Verify: `src/app/(chat)/components/ChatList.tsx`
- Verify: `src/app/(chat)/components/ChatList.test.tsx`

**Interfaces:**

- Consumes: the two feature commits from Tasks 1 and 2.
- Produces: fresh evidence that the helper, component, types and repository lint remain valid.

- [ ] **Step 1: Run the focused tests**

Run: `bunx vitest run 'src/app/(chat)/components/chat-periods.test.ts' 'src/app/(chat)/components/ChatList.test.tsx'`

Expected: exit code `0` and all focused tests pass.

- [ ] **Step 2: Run the full unit suite**

Run: `bun run test`

Expected: exit code `0`; report any pre-existing unrelated failures separately instead of changing unrelated dirty files.

- [ ] **Step 3: Run lint and type checks**

Run: `bun run lint && bun run typecheck`

Expected: Biome and TypeScript exit with code `0`.

- [ ] **Step 4: Check the diff and changed-file scope**

Run: `git diff --check HEAD~2..HEAD` and `git status --short`

Expected: no whitespace errors; the two feature commits contain only the four planned files, while the pre-existing chat/reactivity changes remain un-staged and untouched.

- [ ] **Step 5: Verify the sidebar in the running app when a dev server is available**

Start the existing app with `bun run dev`, open the chat route, and confirm visually that groups appear in descending order, empty groups are absent, and the divider does not cover chat titles or action buttons. Stop the server after the check if it was started for this task.
