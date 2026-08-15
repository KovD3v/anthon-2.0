// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectedAccountsSection } from "./ConnectedAccountsSection";

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  googleDestroy: vi.fn(),
  appleDestroy: vi.fn(),
  user: {
    externalAccounts: [
      {
        id: "external_google",
        emailAddress: "ada@gmail.com",
        providerTitle: () => "Google",
        verification: { status: "verified" },
        destroy: vi.fn(),
      },
      {
        id: "external_apple",
        emailAddress: "ada@icloud.com",
        providerTitle: () => "Apple",
        verification: { status: "verified" },
        destroy: vi.fn(),
      },
    ],
  },
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ isLoaded: true, user: mocks.user }),
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

describe("ConnectedAccountsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.externalAccounts[0].destroy.mockResolvedValue(undefined);
    mocks.user.externalAccounts[1].destroy.mockResolvedValue(undefined);
  });

  it("lists connected providers and their verification state", () => {
    render(<ConnectedAccountsSection />);

    expect(screen.getByText("Google")).toBeTruthy();
    expect(screen.getByText("ada@gmail.com")).toBeTruthy();
    expect(screen.getByText("Apple")).toBeTruthy();
    expect(screen.getAllByText("Verificato")).toHaveLength(2);
  });

  it("removes only the confirmed provider", async () => {
    render(<ConnectedAccountsSection />);

    fireEvent.click(screen.getByRole("button", { name: "Rimuovi Google" }));
    fireEvent.click(screen.getByRole("button", { name: "Sì, rimuovi" }));

    await waitFor(() =>
      expect(mocks.user.externalAccounts[0].destroy).toHaveBeenCalled(),
    );
    expect(mocks.user.externalAccounts[1].destroy).not.toHaveBeenCalled();
    expect(screen.queryByText("Google")).toBeNull();
  });

  it("keeps a provider after a removal failure", async () => {
    mocks.user.externalAccounts[0].destroy.mockRejectedValueOnce(
      new Error("cannot remove"),
    );
    render(<ConnectedAccountsSection />);

    fireEvent.click(screen.getByRole("button", { name: "Rimuovi Google" }));
    fireEvent.click(screen.getByRole("button", { name: "Sì, rimuovi" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(screen.getByText("Google")).toBeTruthy();
  });
});
