// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SecuritySection } from "./SecuritySection";

const mocks = vi.hoisted(() => ({
  updatePassword: vi.fn(),
  createPasskey: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  user: {
    passwordEnabled: true,
    passkeys: [
      {
        id: "passkey_1",
        name: "MacBook Touch ID",
        lastUsedAt: new Date("2026-08-14T10:00:00.000Z"),
        delete: vi.fn(),
      },
    ],
    totpEnabled: false,
    backupCodeEnabled: false,
    twoFactorEnabled: false,
    updatePassword: vi.fn(),
    createPasskey: vi.fn(),
    createTOTP: vi.fn(),
    verifyTOTP: vi.fn(),
  },
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ isLoaded: true, user: mocks.user }),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

afterEach(cleanup);

describe("SecuritySection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.updatePassword.mockResolvedValue(mocks.user);
  });

  it("renders password and factor controls", () => {
    render(<SecuritySection />);

    expect(screen.getByLabelText("Password attuale")).toBeTruthy();
    expect(screen.getByLabelText("Nuova password")).toBeTruthy();
    expect(screen.getByLabelText("Conferma nuova password")).toBeTruthy();
    expect(screen.getByLabelText("Termina le altre sessioni")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salva password" })).toBeTruthy();
    expect(screen.getByText("MacBook Touch ID")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Aggiungi passkey" }),
    ).toBeTruthy();
  });

  it("validates confirmation before updating the password", async () => {
    render(<SecuritySection />);

    fireEvent.change(screen.getByLabelText("Password attuale"), {
      target: { value: "old-password" },
    });
    fireEvent.change(screen.getByLabelText("Nuova password"), {
      target: { value: "new-password" },
    });
    fireEvent.change(screen.getByLabelText("Conferma nuova password"), {
      target: { value: "different-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva password" }));

    expect(mocks.user.updatePassword).not.toHaveBeenCalled();
    expect(screen.getByText("Le password non coincidono.")).toBeTruthy();
  });

  it("updates the password and revokes other sessions when selected", async () => {
    render(<SecuritySection />);

    fireEvent.change(screen.getByLabelText("Password attuale"), {
      target: { value: "old-password" },
    });
    fireEvent.change(screen.getByLabelText("Nuova password"), {
      target: { value: "new-password" },
    });
    fireEvent.change(screen.getByLabelText("Conferma nuova password"), {
      target: { value: "new-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva password" }));

    await waitFor(() =>
      expect(mocks.user.updatePassword).toHaveBeenCalledWith({
        currentPassword: "old-password",
        newPassword: "new-password",
        signOutOfOtherSessions: true,
      }),
    );
  });

  it("keeps the password draft after a rejected update", async () => {
    mocks.user.updatePassword.mockRejectedValueOnce(new Error("invalid"));
    render(<SecuritySection />);

    fireEvent.change(screen.getByLabelText("Nuova password"), {
      target: { value: "new-password" },
    });
    fireEvent.change(screen.getByLabelText("Conferma nuova password"), {
      target: { value: "new-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salva password" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(
      (screen.getByLabelText("Nuova password") as HTMLInputElement).value,
    ).toBe("new-password");
  });
});
