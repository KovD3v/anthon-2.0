// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

const mocks = vi.hoisted(() => ({
  useSignIn: vi.fn(),
  create: vi.fn(),
  attemptFirstFactor: vi.fn(),
  setActive: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useSignIn: mocks.useSignIn,
}));

vi.mock("@clerk/nextjs/errors", () => ({
  isClerkAPIResponseError: (error: unknown) =>
    Boolean(error && typeof error === "object" && "clerkError" in error),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

type SetActiveOptions = {
  navigate?: (params: { session: null }) => Promise<void>;
};

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({});
    mocks.attemptFirstFactor.mockResolvedValue({
      status: "complete",
      createdSessionId: "session-1",
    });
    mocks.setActive.mockImplementation(async (options: SetActiveOptions) => {
      await options.navigate?.({ session: null });
    });
    mocks.useSignIn.mockReturnValue({
      isLoaded: true,
      signIn: {
        create: mocks.create,
        attemptFirstFactor: mocks.attemptFirstFactor,
      },
      setActive: mocks.setActive,
    });
  });

  afterEach(() => {
    cleanup();
  });

  async function requestCode() {
    fireEvent.change(screen.getByLabelText("Indirizzo email"), {
      target: { value: " athlete@example.com " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Invia codice di reset" }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Codice di verifica")).toBeTruthy(),
    );
  }

  it("sends a reset code and advances to password verification", async () => {
    render(<ForgotPasswordForm />);

    await requestCode();

    expect(mocks.create).toHaveBeenCalledWith({
      strategy: "reset_password_email_code",
      identifier: "athlete@example.com",
    });
    expect(screen.getByText(/Abbiamo inviato un codice/)).toBeTruthy();
  });

  it("shows Clerk errors when the reset request fails", async () => {
    mocks.create.mockRejectedValueOnce({
      clerkError: true,
      errors: [{ longMessage: "L'indirizzo email non è valido." }],
    });
    render(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText("Indirizzo email"), {
      target: { value: "unknown@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Invia codice di reset" }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "L'indirizzo email non è valido.",
    );
  });

  it("does not submit mismatched passwords", async () => {
    render(<ForgotPasswordForm />);
    await requestCode();

    fireEvent.change(screen.getByLabelText("Codice di verifica"), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByLabelText("Nuova password"), {
      target: { value: "new-password" },
    });
    fireEvent.change(screen.getByLabelText("Conferma nuova password"), {
      target: { value: "different-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna password" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Le password non coincidono.",
    );
    expect(mocks.attemptFirstFactor).not.toHaveBeenCalled();
  });

  it("completes the reset and activates the new Clerk session", async () => {
    render(<ForgotPasswordForm />);
    await requestCode();

    fireEvent.change(screen.getByLabelText("Codice di verifica"), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByLabelText("Nuova password"), {
      target: { value: "new-password" },
    });
    fireEvent.change(screen.getByLabelText("Conferma nuova password"), {
      target: { value: "new-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Aggiorna password" }));

    await waitFor(() =>
      expect(mocks.attemptFirstFactor).toHaveBeenCalledWith({
        strategy: "reset_password_email_code",
        code: "123456",
        password: "new-password",
      }),
    );
    expect(mocks.setActive).toHaveBeenCalledWith(
      expect.objectContaining({ session: "session-1" }),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/chat");
  });
});
