// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionTaskGuard } from "./session-task-guard";

const mocks = vi.hoisted(() => ({ pathname: "/chat" }));

vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@clerk/nextjs", () => ({
  RedirectToTasks: () => <div data-testid="redirect-to-tasks" />,
}));

describe("SessionTaskGuard", () => {
  it("checks ordinary application routes for pending tasks", () => {
    mocks.pathname = "/chat";
    render(<SessionTaskGuard />);
    expect(screen.getByTestId("redirect-to-tasks")).toBeTruthy();
  });

  it.each(["/sign-in", "/sso-callback", "/session-tasks/setup-mfa"])(
    "does not create a redirect loop on %s",
    (pathname) => {
      mocks.pathname = pathname;
      const { container } = render(<SessionTaskGuard />);
      expect(container.innerHTML).toBe("");
    },
  );
});
