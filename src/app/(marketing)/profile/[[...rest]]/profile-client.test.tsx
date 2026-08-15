// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileClient } from "./profile-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock("../components/AccountConsole", () => ({
  AccountConsole: () => <section aria-label="Account nativo Anthon" />,
}));

afterEach(cleanup);

describe("ProfileClient", () => {
  it("renders the native account console instead of Clerk's profile UI", () => {
    render(<ProfileClient />);

    expect(
      screen.getByRole("region", { name: "Account nativo Anthon" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Profilo Clerk")).toBeNull();
  });
});
