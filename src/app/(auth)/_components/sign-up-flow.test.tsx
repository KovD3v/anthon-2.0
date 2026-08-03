// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpFlow } from "./sign-up-flow";

const mocks = vi.hoisted(() => {
  const signUp = {
    status: "missing_requirements",
    password: vi.fn(),
    sso: vi.fn(),
    finalize: vi.fn(),
    reset: vi.fn(),
    verifications: { sendEmailCode: vi.fn(), verifyEmailCode: vi.fn() },
  };
  return { signUp, router: { replace: vi.fn() } };
});

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
  useSignIn: () => ({ signIn: { sso: vi.fn() } }),
  useSignUp: () => ({
    signUp: mocks.signUp,
    fetchStatus: "idle",
    errors: {
      fields: {
        emailAddress: null,
        password: null,
        code: null,
        captcha: null,
        legalAccepted: null,
      },
    },
  }),
}));

describe("SignUpFlow", () => {
  beforeEach(() => {
    mocks.signUp.status = "missing_requirements";
    mocks.signUp.password.mockReset().mockResolvedValue({ error: null });
    mocks.signUp.verifications.sendEmailCode
      .mockReset()
      .mockResolvedValue({ error: null });
    mocks.signUp.verifications.verifyEmailCode.mockReset();
    mocks.signUp.finalize.mockReset();
    mocks.router.replace.mockReset();
  });

  it("requires legal consent and mounts Clerk CAPTCHA", async () => {
    const user = userEvent.setup();
    const { container } = render(<SignUpFlow continuation="/chat/chat_123" />);
    expect(container.querySelector("#clerk-captcha")).toBeTruthy();

    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(
      screen.getByRole("button", { name: "Crea il mio account" }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Accetta i Termini",
    );
    expect(mocks.signUp.password).not.toHaveBeenCalled();
  });

  it("creates the minimal account and sends the verification code", async () => {
    const user = userEvent.setup();
    render(<SignUpFlow continuation="/chat/chat_123" />);

    await user.click(screen.getByRole("checkbox"));
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(
      screen.getByRole("button", { name: "Crea il mio account" }),
    );

    expect(mocks.signUp.password).toHaveBeenCalledWith({
      emailAddress: "new@example.com",
      password: "password123",
      legalAccepted: true,
      locale: "it-IT",
    });
    expect(mocks.signUp.verifications.sendEmailCode).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("heading", { name: "Controlla la tua email" }),
    ).toBeTruthy();
  });

  it("verifies the email, finalizes, and preserves the guest chat", async () => {
    mocks.signUp.verifications.verifyEmailCode.mockImplementation(async () => {
      mocks.signUp.status = "complete";
      return { error: null };
    });
    mocks.signUp.finalize.mockImplementation(async ({ navigate }) => {
      navigate({
        session: { currentTask: null },
        decorateUrl: (url: string) => url,
      });
      return { error: null };
    });
    const user = userEvent.setup();
    render(<SignUpFlow continuation="/chat/chat_123" />);

    await user.click(screen.getByRole("checkbox"));
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(
      screen.getByRole("button", { name: "Crea il mio account" }),
    );
    await user.type(screen.getByLabelText("Codice di verifica"), "123456");
    await user.click(screen.getByRole("button", { name: "Verifica email" }));

    expect(mocks.signUp.verifications.verifyEmailCode).toHaveBeenCalledWith({
      code: "123456",
    });
    expect(mocks.router.replace).toHaveBeenCalledWith("/chat/chat_123");
  });
});
