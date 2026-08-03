// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordFlow } from "./forgot-password-flow";

const mocks = vi.hoisted(() => {
  const signIn = {
    status: "needs_identifier",
    supportedSecondFactors: [],
    create: vi.fn(),
    finalize: vi.fn(),
    reset: vi.fn(),
    resetPasswordEmailCode: {
      sendCode: vi.fn(),
      verifyCode: vi.fn(),
      submitPassword: vi.fn(),
    },
    mfa: { sendEmailCode: vi.fn() },
  };
  return { signIn, router: { replace: vi.fn() } };
});

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
  useSignIn: () => ({
    signIn: mocks.signIn,
    fetchStatus: "idle",
    errors: { fields: { identifier: null, password: null, code: null } },
  }),
}));

describe("ForgotPasswordFlow", () => {
  beforeEach(() => {
    mocks.signIn.status = "needs_identifier";
    mocks.signIn.create.mockReset().mockResolvedValue({ error: null });
    mocks.signIn.resetPasswordEmailCode.sendCode
      .mockReset()
      .mockResolvedValue({ error: null });
    mocks.signIn.resetPasswordEmailCode.verifyCode
      .mockReset()
      .mockImplementation(async () => {
        mocks.signIn.status = "needs_new_password";
        return { error: null };
      });
    mocks.signIn.resetPasswordEmailCode.submitPassword
      .mockReset()
      .mockImplementation(async () => {
        mocks.signIn.status = "complete";
        return { error: null };
      });
    mocks.signIn.finalize
      .mockReset()
      .mockImplementation(async ({ navigate }) => {
        navigate({
          session: { currentTask: null },
          decorateUrl: (url: string) => url,
        });
        return { error: null };
      });
    mocks.router.replace.mockReset();
  });

  it("completes the Clerk v7 email reset flow", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordFlow continuation="/profile" />);

    await user.type(screen.getByLabelText("Email"), "coach@example.com");
    await user.click(screen.getByRole("button", { name: "Invia il codice" }));
    expect(mocks.signIn.create).toHaveBeenCalledWith({
      identifier: "coach@example.com",
    });
    expect(mocks.signIn.resetPasswordEmailCode.sendCode).toHaveBeenCalledOnce();

    await user.type(screen.getByLabelText("Codice di verifica"), "123456");
    await user.click(
      screen.getByRole("button", { name: "Verifica il codice" }),
    );

    await user.type(screen.getByLabelText("Nuova password"), "newpassword123");
    await user.type(
      screen.getByLabelText("Conferma nuova password"),
      "newpassword123",
    );
    await user.click(screen.getByRole("button", { name: "Salva e accedi" }));

    expect(
      mocks.signIn.resetPasswordEmailCode.submitPassword,
    ).toHaveBeenCalledWith({
      password: "newpassword123",
      signOutOfOtherSessions: true,
    });
    expect(mocks.router.replace).toHaveBeenCalledWith("/profile");
  });
});
