// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SsoCallbackPage from "./page";

const mocks = vi.hoisted(() => ({
  callback: vi.fn(() => null),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("redirect_url=%2Fchat%2Fthread_1"),
}));

vi.mock("@clerk/nextjs", () => ({
  AuthenticateWithRedirectCallback: mocks.callback,
}));

describe("SsoCallbackPage", () => {
  it("keeps OAuth account transfers on the custom auth routes", () => {
    render(<SsoCallbackPage />);

    expect(mocks.callback).toHaveBeenCalledWith(
      expect.objectContaining({
        signInUrl: "/sign-in?redirect_url=%2Fchat%2Fthread_1",
        signUpUrl: "/sign-up?redirect_url=%2Fchat%2Fthread_1",
      }),
      undefined,
    );
  });
});
