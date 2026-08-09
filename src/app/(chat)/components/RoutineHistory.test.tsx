// @vitest-environment jsdom

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

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

  it("reloads visible history after the routine receives a new outcome", async () => {
    const { rerender } = render(<RoutineHistory routine={routine} />);
    fireEvent.click(screen.getByRole("button", { name: "Storico tentativi" }));
    await waitFor(() =>
      expect(mocks.fetchRoutineAttempts).toHaveBeenCalledTimes(1),
    );
    mocks.fetchRoutineAttempts.mockResolvedValueOnce({
      attempts: [
        {
          id: "attempt-new",
          attemptedAt: "2026-08-09T09:00:00.000Z",
          outcome: "NOT_HELPFUL",
          outcomeNote: null,
          outcomeRecordedAt: "2026-08-09T09:01:00.000Z",
        },
      ],
      nextCursor: null,
    });

    rerender(
      <RoutineHistory
        routine={{
          ...routine,
          latestAttempt: {
            id: "attempt-new",
            attemptedAt: "2026-08-09T09:00:00.000Z",
            outcome: "NOT_HELPFUL",
            outcomeNote: null,
            outcomeRecordedAt: "2026-08-09T09:01:00.000Z",
          },
        }}
      />,
    );

    await waitFor(() =>
      expect(mocks.fetchRoutineAttempts).toHaveBeenCalledTimes(2),
    );
    expect(screen.getByText(/^Ultimo esito: Non mi ha aiutato$/)).toBeTruthy();
  });

  it("starts a new history request and ignores a stale response after latestAttempt changes", async () => {
    const firstPage = deferred<{
      attempts: Array<{
        id: string;
        attemptedAt: string;
        outcome: "HELPFUL";
        outcomeNote: null;
        outcomeRecordedAt: string;
      }>;
      nextCursor: null;
    }>();
    const secondPage = deferred<{
      attempts: Array<{
        id: string;
        attemptedAt: string;
        outcome: "NOT_HELPFUL";
        outcomeNote: null;
        outcomeRecordedAt: string;
      }>;
      nextCursor: null;
    }>();
    mocks.fetchRoutineAttempts
      .mockReturnValueOnce(firstPage.promise)
      .mockReturnValueOnce(secondPage.promise);
    const { rerender } = render(<RoutineHistory routine={routine} />);
    fireEvent.click(screen.getByRole("button", { name: "Storico tentativi" }));
    await waitFor(() =>
      expect(mocks.fetchRoutineAttempts).toHaveBeenCalledTimes(1),
    );

    rerender(
      <RoutineHistory
        routine={{
          ...routine,
          latestAttempt: {
            id: "attempt-new",
            attemptedAt: "2026-08-09T09:00:00.000Z",
            outcome: "NOT_HELPFUL",
            outcomeNote: null,
            outcomeRecordedAt: "2026-08-09T09:01:00.000Z",
          },
        }}
      />,
    );

    await waitFor(() =>
      expect(mocks.fetchRoutineAttempts).toHaveBeenCalledTimes(2),
    );
    await act(async () => {
      firstPage.resolve({
        attempts: [
          {
            id: "attempt-stale",
            attemptedAt: "2026-08-08T09:00:00.000Z",
            outcome: "HELPFUL",
            outcomeNote: null,
            outcomeRecordedAt: "2026-08-08T09:01:00.000Z",
          },
        ],
        nextCursor: null,
      });
      secondPage.resolve({
        attempts: [
          {
            id: "attempt-new",
            attemptedAt: "2026-08-09T09:00:00.000Z",
            outcome: "NOT_HELPFUL",
            outcomeNote: null,
            outcomeRecordedAt: "2026-08-09T09:01:00.000Z",
          },
        ],
        nextCursor: null,
      });
    });

    expect(screen.getByText(/^Ultimo esito: Non mi ha aiutato$/)).toBeTruthy();
    expect(screen.queryByText(/^Ultimo esito: Mi ha aiutato$/)).toBeNull();
  });

  it("ignores a stale history error after latestAttempt changes", async () => {
    const firstPage = deferred<{
      attempts: RoutineCardData["latestAttempt"][];
      nextCursor: null;
    }>();
    const secondPage = deferred<{
      attempts: Array<{
        id: string;
        attemptedAt: string;
        outcome: "HELPFUL";
        outcomeNote: null;
        outcomeRecordedAt: string;
      }>;
      nextCursor: null;
    }>();
    mocks.fetchRoutineAttempts
      .mockReturnValueOnce(firstPage.promise)
      .mockReturnValueOnce(secondPage.promise);
    const { rerender } = render(<RoutineHistory routine={routine} />);
    fireEvent.click(screen.getByRole("button", { name: "Storico tentativi" }));
    await waitFor(() =>
      expect(mocks.fetchRoutineAttempts).toHaveBeenCalledTimes(1),
    );
    rerender(
      <RoutineHistory
        routine={{
          ...routine,
          latestAttempt: {
            id: "attempt-helpful",
            attemptedAt: "2026-08-09T09:00:00.000Z",
            outcome: "HELPFUL",
            outcomeNote: null,
            outcomeRecordedAt: "2026-08-09T09:01:00.000Z",
          },
        }}
      />,
    );
    await waitFor(() =>
      expect(mocks.fetchRoutineAttempts).toHaveBeenCalledTimes(2),
    );

    await act(async () => {
      firstPage.reject(new Error("stale request failed"));
      secondPage.resolve({
        attempts: [
          {
            id: "attempt-helpful",
            attemptedAt: "2026-08-09T09:00:00.000Z",
            outcome: "HELPFUL",
            outcomeNote: null,
            outcomeRecordedAt: "2026-08-09T09:01:00.000Z",
          },
        ],
        nextCursor: null,
      });
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/^Ultimo esito: Mi ha aiutato$/)).toBeTruthy();
  });
});
