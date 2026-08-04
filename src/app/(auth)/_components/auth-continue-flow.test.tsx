// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContinueFlow } from "./auth-continue-flow";

const mocks = vi.hoisted(() => ({
  router: { replace: vi.fn() },
  auth: { isLoaded: true, isSignedIn: false },
  signIn: {
    status: "needs_identifier",
    supportedSecondFactors: [],
    finalize: vi.fn(),
    mfa: {},
  },
  signUp: {
    id: "sua_test",
    status: "missing_requirements",
    firstName: null,
    lastName: null,
    emailAddress: "oauth@example.com",
    legalAcceptedAt: null,
    missingFields: ["legal_accepted"],
    unverifiedFields: [] as string[],
    update: vi.fn(),
    finalize: vi.fn(),
    verifications: { sendEmailCode: vi.fn(), verifyEmailCode: vi.fn() },
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => mocks.auth,
  useSignIn: () => ({ signIn: mocks.signIn, fetchStatus: "idle" }),
  useSignUp: () => ({
    signUp: mocks.signUp,
    fetchStatus: "idle",
    errors: {
      fields: {
        code: null,
        firstName: null,
        lastName: null,
        emailAddress: null,
      },
    },
  }),
}));

describe("AuthContinueFlow", () => {
  beforeEach(() => {
    mocks.auth.isLoaded = true;
    mocks.auth.isSignedIn = false;
    mocks.signUp.id = "sua_test";
    mocks.signUp.status = "missing_requirements";
    mocks.signUp.missingFields = ["legal_accepted"];
    mocks.signUp.unverifiedFields = [];
    mocks.signUp.update.mockReset().mockImplementation(async () => {
      mocks.signUp.status = "complete";
      return { error: null };
    });
    mocks.signUp.finalize
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

  it("collects a missing OAuth legal requirement and finalizes", async () => {
    const user = userEvent.setup();
    render(<AuthContinueFlow continuation="/chat/thread_1" />);

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Continua" }));

    expect(mocks.signUp.update).toHaveBeenCalledWith({
      emailAddress: undefined,
      firstName: undefined,
      lastName: undefined,
      legalAccepted: true,
      locale: "it-IT",
    });
    expect(mocks.router.replace).toHaveBeenCalledWith("/chat/thread_1");
  });

  it("does not submit when the OAuth sign-up session is missing", () => {
    mocks.signUp.id = undefined;

    render(<AuthContinueFlow continuation="/chat/thread_1" />);

    expect(
      screen.getByRole("heading", { name: "Riprendi l’accesso" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Ricomincia registrazione" })
        .getAttribute("href"),
    ).toBe("/sign-up?redirect_url=%2Fchat%2Fthread_1");
    expect(mocks.signUp.update).not.toHaveBeenCalled();
  });
});
