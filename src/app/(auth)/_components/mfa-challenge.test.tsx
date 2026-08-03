// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MfaChallenge } from "./mfa-challenge";

const mocks = vi.hoisted(() => ({
  signIn: {
    status: "needs_second_factor",
    supportedSecondFactors: [] as Array<{ strategy: string }>,
    mfa: {
      sendEmailCode: vi.fn(),
      verifyEmailCode: vi.fn(),
      sendPhoneCode: vi.fn(),
      verifyPhoneCode: vi.fn(),
      verifyTOTP: vi.fn(),
      verifyBackupCode: vi.fn(),
    },
  },
}));

vi.mock("@clerk/nextjs", () => ({
  useSignIn: () => ({
    signIn: mocks.signIn,
    fetchStatus: "idle",
    errors: { fields: { code: null } },
  }),
}));

describe("MfaChallenge", () => {
  beforeEach(() => {
    mocks.signIn.status = "needs_second_factor";
    for (const method of Object.values(mocks.signIn.mfa)) {
      method.mockReset().mockResolvedValue({ error: null });
    }
  });

  it.each([
    ["phone_code", "verifyPhoneCode"],
    ["totp", "verifyTOTP"],
    ["backup_code", "verifyBackupCode"],
  ] as const)("verifies the %s factor", async (strategy, method) => {
    mocks.signIn.supportedSecondFactors = [{ strategy }];
    mocks.signIn.mfa[method].mockImplementation(async () => {
      mocks.signIn.status = "complete";
      return { error: null };
    });
    const onComplete = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<MfaChallenge onComplete={onComplete} />);

    await user.type(screen.getByLabelText("Codice di verifica"), "123456");
    await user.click(screen.getByRole("button", { name: "Verifica e accedi" }));

    expect(mocks.signIn.mfa[method]).toHaveBeenCalledWith({ code: "123456" });
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("sends the client-trust email code when the callback has not sent it", async () => {
    mocks.signIn.status = "needs_client_trust";
    mocks.signIn.supportedSecondFactors = [{ strategy: "email_code" }];
    render(<MfaChallenge onComplete={vi.fn()} emailCodeAlreadySent={false} />);

    await waitFor(() =>
      expect(mocks.signIn.mfa.sendEmailCode).toHaveBeenCalledOnce(),
    );
  });
});
