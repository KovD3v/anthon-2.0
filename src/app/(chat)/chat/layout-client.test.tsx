// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutineCardData } from "@/lib/coaching/routine";
import { LayoutClient, useChatContext } from "./layout-client";

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
  fetchActiveRoutineForReturn: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: { id: "user-1" } }),
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/chat/source-chat",
  useRouter: () => ({
    push: mocks.routerPush,
    prefetch: vi.fn(),
    refresh: mocks.routerRefresh,
  }),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/hooks/use-confirm", () => ({
  useConfirm: () => ({
    confirm: vi.fn().mockResolvedValue(true),
    isOpen: false,
    options: {},
    handleConfirm: vi.fn(),
    setIsOpen: vi.fn(),
  }),
}));
vi.mock("@/hooks/useKeyboardShortcut", () => ({
  useKeyboardShortcut: () => undefined,
}));
vi.mock("@/lib/document-scroll-lock", () => ({
  installDocumentScrollLock: () => () => undefined,
}));
vi.mock("@/lib/visual-viewport", () => ({
  installChatViewportSizing: () => () => undefined,
}));
vi.mock("@/lib/coaching/routine-client", () => ({
  fetchActiveRoutineForReturn: mocks.fetchActiveRoutineForReturn,
}));
vi.mock("../components/ChatList", () => ({
  ChatList: ({ onDelete }: { onDelete: (id: string) => Promise<boolean> }) => (
    <button type="button" onClick={() => void onDelete("source-chat")}>
      Elimina chat sorgente
    </button>
  ),
}));
vi.mock("../components/SearchDialog", () => ({ SearchDialog: () => null }));
vi.mock("../components/SidebarBottom", () => ({ SidebarBottom: () => null }));
vi.mock("../components/SidebarHeader", () => ({ SidebarHeader: () => null }));
vi.mock("../components/UsageBanner", () => ({ UsageBanner: () => null }));
vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));

const proposal = {
  title: "Reset rapido",
  trigger: "Dopo un errore",
  durationLabel: null,
  steps: ["Fermati", "Espira"],
  completionCue: "Riparti",
};

const sourceRoutine: RoutineCardData = {
  id: "routine-source",
  sourceChatId: "source-chat",
  sourceAssistantMessageId: "assistant-source",
  status: "ACTIVE",
  proposal,
  archivedAt: null,
  latestAttempt: null,
};

function RoutineProbe() {
  const { activeRoutine, refreshActiveRoutine, openRoutineCheckIn } =
    useChatContext();
  return (
    <div>
      <output data-testid="active-routine">
        {activeRoutine
          ? `${activeRoutine.id}:${activeRoutine.sourceChatId ?? "orphan"}`
          : "NONE"}
      </output>
      <button type="button" onClick={() => void refreshActiveRoutine()}>
        Aggiorna routine
      </button>
      <button
        type="button"
        onClick={() => activeRoutine && openRoutineCheckIn(activeRoutine)}
      >
        Apri check-in
      </button>
    </div>
  );
}

function renderLayout(initialActiveRoutine: RoutineCardData | null) {
  return render(
    <LayoutClient
      initialChats={[
        {
          id: "source-chat",
          title: "Chat sorgente",
          visibility: "PRIVATE",
          createdAt: "2026-08-08T08:00:00.000Z",
          updatedAt: "2026-08-08T09:00:00.000Z",
          messageCount: 2,
        },
      ]}
      initialUsageData={null}
      initialCoachingGoal={null}
      initialActiveRoutine={initialActiveRoutine}
      guestConversionPending={false}
      isGuest={false}
    >
      <RoutineProbe />
    </LayoutClient>,
  );
}

function deferredRoutine() {
  let resolve: (routine: RoutineCardData | null) => void = () => undefined;
  const promise = new Promise<RoutineCardData | null>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (
        String(input) === "/api/chats/source-chat" &&
        init?.method === "DELETE"
      ) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (String(input) === "/api/chats") {
        return new Response(JSON.stringify({ chats: [] }), { status: 200 });
      }
      return new Response(null, { status: 500 });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("persistent active routine context", () => {
  it("uses the authoritative orphan selector after deleting the source chat", async () => {
    const orphanRoutine = {
      ...sourceRoutine,
      sourceChatId: null,
      sourceAssistantMessageId: null,
    };
    mocks.fetchActiveRoutineForReturn.mockResolvedValue(orphanRoutine);
    const user = userEvent.setup();
    renderLayout(sourceRoutine);

    await user.click(
      screen.getByRole("button", { name: "Elimina chat sorgente" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("active-routine").textContent).toBe(
        "routine-source:orphan",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Apri check-in" }));
    expect(mocks.routerPush).toHaveBeenLastCalledWith(
      "/chat?checkInRoutineId=routine-source",
      { scroll: false },
    );
  });

  it("reveals the authoritative next active routine after the selected one is archived", async () => {
    const nextActiveRoutine = {
      ...sourceRoutine,
      id: "routine-next-active",
      sourceChatId: "next-chat",
      sourceAssistantMessageId: "assistant-next",
    };
    mocks.fetchActiveRoutineForReturn.mockResolvedValue(nextActiveRoutine);
    const user = userEvent.setup();
    renderLayout(sourceRoutine);

    await user.click(screen.getByRole("button", { name: "Aggiorna routine" }));

    await waitFor(() =>
      expect(screen.getByTestId("active-routine").textContent).toBe(
        "routine-next-active:next-chat",
      ),
    );
  });

  it("ignores an older selector response that resolves after a newer refresh", async () => {
    const first = deferredRoutine();
    const second = deferredRoutine();
    mocks.fetchActiveRoutineForReturn
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const newerRoutine = {
      ...sourceRoutine,
      id: "routine-newer",
      sourceChatId: "newer-chat",
    };
    const olderRoutine = {
      ...sourceRoutine,
      id: "routine-older",
      sourceChatId: "older-chat",
    };
    const user = userEvent.setup();
    renderLayout(sourceRoutine);

    await user.click(screen.getByRole("button", { name: "Aggiorna routine" }));
    await user.click(screen.getByRole("button", { name: "Aggiorna routine" }));
    second.resolve(newerRoutine);
    await waitFor(() =>
      expect(screen.getByTestId("active-routine").textContent).toBe(
        "routine-newer:newer-chat",
      ),
    );
    first.resolve(olderRoutine);

    await waitFor(() =>
      expect(screen.getByTestId("active-routine").textContent).toBe(
        "routine-newer:newer-chat",
      ),
    );
  });
});
