// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoachingContextSection } from "./CoachingContextSection";

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));
vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
  }: {
    open: boolean;
    onConfirm: () => void;
  }) =>
    open ? (
      <button type="button" onClick={onConfirm}>
        Conferma eliminazione
      </button>
    ) : null,
}));

const context = {
  profile: {
    sport: "Tennis",
    goal: "Restare lucido",
    experience: "Agonista",
  },
  memories: [
    {
      id: "memory-1",
      content: "Mi alleno il martedì",
      category: "schedule",
      updatedAt: "2026-07-31T08:00:00.000Z",
    },
  ],
};

describe("CoachingContextSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => context,
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders only user-facing profile and memory content", async () => {
    render(<CoachingContextSection />);
    expect(await screen.findByDisplayValue("Tennis")).toBeTruthy();
    expect(screen.getByText("Mi alleno il martedì")).toBeTruthy();
    expect(screen.queryByText("memory-1")).toBeNull();
  });

  it("saves an edited coaching goal", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => context,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...context.profile, goal: "Nuovo obiettivo" }),
      } as Response);
    render(<CoachingContextSection />);

    const goal = await screen.findByLabelText("Obiettivo");
    fireEvent.change(goal, { target: { value: "Nuovo obiettivo" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva profilo" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/coaching-context",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  it("requires confirmation before deleting a memory", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => context,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deleted: true }),
      } as Response);
    render(<CoachingContextSection />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Elimina memoria" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Conferma eliminazione" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Mi alleno il martedì")).toBeNull();
  });
});
