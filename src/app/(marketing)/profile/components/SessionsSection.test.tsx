// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionsSection } from "./SessionsSection";

const mocks = vi.hoisted(() => ({
  getSessions: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  currentSession: { id: "session_current" },
  otherSession: {
    id: "session_other",
    status: "active",
    expireAt: new Date("2026-09-01T10:00:00.000Z"),
    abandonAt: new Date("2026-09-01T10:00:00.000Z"),
    lastActiveAt: new Date("2026-08-14T10:00:00.000Z"),
    latestActivity: {
      browserName: "Safari",
      browserVersion: "18",
      deviceType: "desktop",
      city: "Roma",
      country: "IT",
      isMobile: false,
    },
    revoke: vi.fn(),
  },
  currentSessionResource: {
    id: "session_current",
    status: "active",
    expireAt: new Date("2026-09-01T10:00:00.000Z"),
    abandonAt: new Date("2026-09-01T10:00:00.000Z"),
    lastActiveAt: new Date("2026-08-15T10:00:00.000Z"),
    latestActivity: {
      browserName: "Chrome",
      browserVersion: "126",
      deviceType: "desktop",
      city: "Milano",
      country: "IT",
      isMobile: false,
    },
    revoke: vi.fn(),
  },
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    isLoaded: true,
    user: { getSessions: mocks.getSessions },
  }),
  useSession: () => ({ session: mocks.currentSession }),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
    confirmText,
  }: {
    open: boolean;
    onConfirm: () => void;
    confirmText: string;
  }) =>
    open ? (
      <button type="button" onClick={onConfirm}>
        {confirmText}
      </button>
    ) : null,
}));

afterEach(cleanup);

describe("SessionsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessions.mockResolvedValue([
      mocks.currentSessionResource,
      mocks.otherSession,
    ]);
    mocks.otherSession.revoke.mockResolvedValue(mocks.otherSession);
  });

  it("lists the current and other active sessions", async () => {
    render(<SessionsSection />);

    expect(await screen.findByText("Chrome 126")).toBeTruthy();
    expect(screen.getByText("Questa sessione")).toBeTruthy();
    expect(screen.getByText("Safari 18")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Revoca sessione Safari 18" }),
    ).toBeTruthy();
  });

  it("revokes a selected non-current session", async () => {
    render(<SessionsSection />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Revoca sessione Safari 18" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sì, revoca" }));

    await waitFor(() => expect(mocks.otherSession.revoke).toHaveBeenCalled());
    expect(screen.queryByText("Safari 18")).toBeNull();
  });

  it("keeps a session visible after a revoke failure", async () => {
    mocks.otherSession.revoke.mockRejectedValueOnce(new Error("offline"));
    render(<SessionsSection />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Revoca sessione Safari 18" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sì, revoca" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(screen.getByText("Safari 18")).toBeTruthy();
  });
});
