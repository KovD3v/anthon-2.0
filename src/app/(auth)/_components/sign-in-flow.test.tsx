// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignInFlow } from "./sign-in-flow";

const mocks = vi.hoisted(() => {
  const router = { replace: vi.fn() };
  const signIn = {
    status: "needs_identifier",
    supportedSecondFactors: [] as Array<{ strategy: string }>,
    password: vi.fn(),
    finalize: vi.fn(),
    reset: vi.fn().mockResolvedValue({ error: null }),
    sso: vi.fn(),
    mfa: {
      sendEmailCode: vi.fn(),
      verifyEmailCode: vi.fn(),
      sendPhoneCode: vi.fn(),
      verifyPhoneCode: vi.fn(),
      verifyTOTP: vi.fn(),
      verifyBackupCode: vi.fn(),
    },
  };
  return { auth: { isLoaded: true, isSignedIn: false }, router, signIn };
});

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => mocks.auth,
  useSignIn: () => ({
    signIn: mocks.signIn,
    fetchStatus: "idle",
    errors: { fields: { identifier: null, password: null, code: null } },
  }),
  useSignUp: () => ({ signUp: { sso: vi.fn() } }),
}));

describe("SignInFlow", () => {
  beforeEach(() => {
    mocks.signIn.status = "needs_identifier";
    mocks.auth.isSignedIn = false;
    mocks.signIn.supportedSecondFactors = [];
    mocks.signIn.password.mockReset();
    mocks.signIn.finalize.mockReset();
    mocks.signIn.mfa.sendEmailCode.mockReset();
    mocks.router.replace.mockReset();
  });

  it("renders the complete custom Italian entry UI", () => {
    render(<SignInFlow continuation="/chat" />);
    expect(screen.getByRole("heading", { name: "Bentornato" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Continua con Apple" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Continua con Facebook" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Continua con Google" }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
  });

  it("finalizes a complete password sign-in and keeps the continuation", async () => {
    mocks.signIn.password.mockImplementation(async () => {
      mocks.signIn.status = "complete";
      return { error: null };
    });
    mocks.signIn.finalize.mockImplementation(async ({ navigate }) => {
      navigate({
        session: { currentTask: null },
        decorateUrl: (url: string) => url,
      });
      return { error: null };
    });
    const user = userEvent.setup();
    render(<SignInFlow continuation="/admin?page=2" />);

    await user.type(screen.getByLabelText("Email"), "coach@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Accedi" }));

    expect(mocks.signIn.password).toHaveBeenCalledWith({
      emailAddress: "coach@example.com",
      password: "password123",
    });
    expect(mocks.router.replace).toHaveBeenCalledWith("/admin?page=2");
  });

  it("starts client trust verification on a new device", async () => {
    mocks.signIn.password.mockImplementation(async () => {
      mocks.signIn.status = "needs_client_trust";
      mocks.signIn.supportedSecondFactors = [{ strategy: "email_code" }];
      return { error: null };
    });
    mocks.signIn.mfa.sendEmailCode.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<SignInFlow continuation="/chat" />);

    await user.type(screen.getByLabelText("Email"), "coach@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Accedi" }));

    expect(mocks.signIn.mfa.sendEmailCode).toHaveBeenCalledOnce();
  });

  it("redirects an already authenticated user to the safe continuation", () => {
    mocks.auth.isSignedIn = true;
    render(<SignInFlow continuation="/settings" />);
    expect(mocks.router.replace).toHaveBeenCalledWith("/settings");
  });

  it("normalizes password errors in Italian", async () => {
    mocks.signIn.password.mockResolvedValue({
      error: { code: "form_password_incorrect" },
    });
    const user = userEvent.setup();
    render(<SignInFlow continuation="/chat" />);

    await user.type(screen.getByLabelText("Email"), "coach@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Accedi" }));

    expect(screen.getByRole("alert").textContent).toContain(
      "La password non è corretta",
    );
  });
});
