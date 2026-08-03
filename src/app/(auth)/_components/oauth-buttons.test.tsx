// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OAuthButtons } from "./oauth-buttons";

const mocks = vi.hoisted(() => ({
  signIn: { sso: vi.fn() },
  signUp: { sso: vi.fn() },
}));

vi.mock("@clerk/nextjs", () => ({
  useSignIn: () => ({ signIn: mocks.signIn }),
  useSignUp: () => ({ signUp: mocks.signUp }),
}));

describe("OAuthButtons", () => {
  beforeEach(() => {
    mocks.signIn.sso.mockReset().mockResolvedValue({ error: null });
    mocks.signUp.sso.mockReset().mockResolvedValue({ error: null });
  });

  it("serializes the safe continuation into both OAuth routes", async () => {
    const user = userEvent.setup();
    render(
      <OAuthButtons
        mode="sign-in"
        continuation="/chat/thread_1?source=guest"
        onError={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Continua con Google" }),
    );

    expect(mocks.signIn.sso).toHaveBeenCalledWith({
      strategy: "oauth_google",
      redirectUrl:
        "/sso-callback?redirect_url=%2Fchat%2Fthread_1%3Fsource%3Dguest",
      redirectCallbackUrl:
        "/auth-continue?redirect_url=%2Fchat%2Fthread_1%3Fsource%3Dguest",
    });
  });

  it("blocks OAuth signup until legal consent is accepted", async () => {
    const onError = vi.fn();
    const user = userEvent.setup();
    render(
      <OAuthButtons mode="sign-up" continuation="/chat" onError={onError} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Continua con Apple" }),
    );

    expect(mocks.signUp.sso).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("Termini"));
  });
});
