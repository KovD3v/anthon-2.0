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
  it("keeps a compact routine shelf visible with active count and latest routine", () => {
    render(
      <RoutineSidebarShelf
        routines={[routine("routine-1"), routine("routine-2", "ARCHIVED")]}
        isLoading={false}
        error={null}
        onRetry={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByRole("region", { name: "Routine" })).toBeTruthy();
    expect(screen.getByText("Routine")).toBeTruthy();
    expect(screen.getByText("1 attiva")).toBeTruthy();
    expect(screen.getByText("Reset rapido")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Espandi routine" }),
    ).toBeTruthy();
    expect(screen.getByTestId("routine-sidebar-shelf").className).toContain(
      "shrink-0",
    );
  });

  it("expands upward with active/archive filter and owner-safe source href", async () => {
    const user = userEvent.setup();
    render(
      <RoutineSidebarShelf
        routines={[routine("routine-1"), routine("routine-2", "ARCHIVED")]}
        isLoading={false}
        error={null}
        onRetry={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Espandi routine" }));
    expect(screen.getByRole("button", { name: "Archiviate" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Reset rapido/ }).getAttribute("href"),
    ).toBe("/chat/chat-source?checkInRoutineId=routine-1");
    await user.click(screen.getByRole("button", { name: "Archiviate" }));
    expect(
      screen.getByRole("link", { name: /Reset rapido/ }).getAttribute("href"),
    ).toBe("/chat?checkInRoutineId=routine-2");
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
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByText("Nessuna routine salvata")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Riprova routine" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
