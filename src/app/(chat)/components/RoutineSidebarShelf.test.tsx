// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoutineCardData } from "@/lib/coaching/routine";
import { RoutineSidebarShelf } from "./RoutineSidebarShelf";

afterEach(cleanup);

const proposal = {
  title: "Reset rapido",
  trigger: "Dopo un errore",
  durationLabel: "60 secondi",
  steps: ["Fermati", "Espira"],
  completionCue: "Riparti",
};

function routine(
  id: string,
  status: "ACTIVE" | "ARCHIVED" = "ACTIVE",
): RoutineCardData {
  return {
    id,
    sourceChatId: status === "ACTIVE" ? "chat-source" : null,
    sourceAssistantMessageId: status === "ACTIVE" ? "message-source" : null,
    status,
    formatVersion: 1,
    proposal,
    archivedAt: status === "ARCHIVED" ? "2026-08-08T10:00:00.000Z" : null,
    latestAttempt: null,
  };
}

describe("RoutineSidebarShelf", () => {
  it("offers only a compact link to the routine collection", () => {
    render(
      <RoutineSidebarShelf
        routines={[routine("routine-1"), routine("routine-2", "ARCHIVED")]}
        isLoading={false}
        error={null}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole("region", { name: "Routine" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Routine/ }).getAttribute("href"),
    ).toBe("/chat/routines");
    expect(
      screen.queryByRole("button", { name: "Espandi routine" }),
    ).toBeNull();
    expect(screen.queryByRole("tab", { name: "Archiviate" })).toBeNull();
    expect(screen.queryByText("Reset rapido")).toBeNull();
    expect(screen.getByTestId("routine-sidebar-shelf").className).toContain(
      "shrink-0",
    );
    expect(screen.getByRole("link", { name: /Routine/ }).className).toContain(
      "min-h-11",
    );
  });

  it("renders a quiet empty state and a retry action for collection errors", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <RoutineSidebarShelf
        routines={[]}
        isLoading={false}
        error="failed"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Routine non disponibili")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Riprova routine" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
