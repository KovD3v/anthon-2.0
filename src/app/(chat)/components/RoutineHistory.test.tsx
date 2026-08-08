// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutineCardData } from "@/lib/coaching/routine";

const mocks = vi.hoisted(() => ({ fetchRoutineAttempts: vi.fn() }));

vi.mock("@/lib/coaching/routine-client", () => ({
  fetchRoutineAttempts: mocks.fetchRoutineAttempts,
}));

import { RoutineHistory } from "./RoutineHistory";

const routine: RoutineCardData = {
  id: "routine-1",
  sourceChatId: "chat-1",
  sourceAssistantMessageId: "cm123456789012345678901234",
  status: "ACTIVE",
  formatVersion: 1,
  proposal: {
    title: "Reset",
    trigger: "Dopo un errore",
    durationLabel: null,
    steps: ["Fermati", "Respira"],
    completionCue: "Riparti",
  },
  archivedAt: null,
  latestAttempt: null,
};

describe("RoutineHistory", () => {
  beforeEach(() => {
    mocks.fetchRoutineAttempts.mockReset();
    mocks.fetchRoutineAttempts.mockResolvedValue({
      attempts: [
        {
          id: "attempt-2",
          attemptedAt: "2026-08-08T09:00:00.000Z",
          outcome: "HELPFUL",
          outcomeNote: "Mi ha aiutato a ripartire",
          outcomeRecordedAt: "2026-08-08T09:01:00.000Z",
        },
        {
          id: "attempt-1",
          attemptedAt: "2026-08-04T09:00:00.000Z",
          outcome: "PARTIALLY_HELPFUL",
          outcomeNote: null,
          outcomeRecordedAt: "2026-08-04T09:01:00.000Z",
        },
      ],
      nextCursor: null,
    });
  });

  it("loads a collapsed, readable history only when opened", async () => {
    render(<RoutineHistory routine={routine} />);

    expect(mocks.fetchRoutineAttempts).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Storico tentativi" }));

    await waitFor(() => {
      expect(mocks.fetchRoutineAttempts).toHaveBeenCalledWith("routine-1", {});
    });
    expect(screen.getByText("Mi ha aiutato a ripartire")).toBeTruthy();
    expect(screen.getByText(/2 tentativi in 4 giorni/)).toBeTruthy();
    expect(screen.getByText(/^Ultimo esito: Mi ha aiutato$/)).toBeTruthy();
  });

  it("appends an older page without discarding the visible entries", async () => {
    mocks.fetchRoutineAttempts
      .mockResolvedValueOnce({
        attempts: [
          {
            id: "attempt-2",
            attemptedAt: "2026-08-08T09:00:00.000Z",
            outcome: "HELPFUL",
            outcomeNote: null,
            outcomeRecordedAt: "2026-08-08T09:01:00.000Z",
          },
        ],
        nextCursor: "older",
      })
      .mockResolvedValueOnce({
        attempts: [
          {
            id: "attempt-1",
            attemptedAt: "2026-08-04T09:00:00.000Z",
            outcome: "NOT_HELPFUL",
            outcomeNote: null,
            outcomeRecordedAt: "2026-08-04T09:01:00.000Z",
          },
        ],
        nextCursor: null,
      });
    render(<RoutineHistory routine={routine} />);
    fireEvent.click(screen.getByRole("button", { name: "Storico tentativi" }));
    await screen.findByText(/Ultimo esito/);
    fireEvent.click(
      screen.getByRole("button", { name: "Carica altri tentativi" }),
    );

    await waitFor(() => {
      expect(mocks.fetchRoutineAttempts).toHaveBeenLastCalledWith("routine-1", {
        cursor: "older",
      });
    });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});
