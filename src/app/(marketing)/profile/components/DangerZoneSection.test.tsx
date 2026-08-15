// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DangerZoneSection } from "./DangerZoneSection";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  signOut: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: mocks.signOut }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError },
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
    confirmText,
    cancelText,
  }: {
    open: boolean;
    onConfirm: () => void;
    confirmText: string;
    cancelText: string;
  }) =>
    open ? (
      <div role="alertdialog">
        <button type="button" onClick={() => undefined}>
          {cancelText}
        </button>
        <button type="button" onClick={onConfirm}>
          {confirmText}
        </button>
      </div>
    ) : null,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DangerZoneSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue(undefined);
  });

  it("deletes the account only after explicit confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    render(<DangerZoneSection />);

    fireEvent.click(screen.getByRole("button", { name: "Elimina account" }));
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Sì, elimina" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/user/me", {
        method: "DELETE",
      }),
    );
    expect(mocks.signOut).toHaveBeenCalledWith({ redirectUrl: "/" });
    expect(mocks.push).toHaveBeenCalledWith("/");
  });

  it("keeps the danger zone available when deletion fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    render(<DangerZoneSection />);
    fireEvent.click(screen.getByRole("button", { name: "Elimina account" }));
    fireEvent.click(screen.getByRole("button", { name: "Sì, elimina" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Elimina account" }),
    ).toBeTruthy();
  });
});
