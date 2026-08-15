// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileClient } from "./profile-client";

vi.mock("@clerk/nextjs", () => ({
  UserProfile: () => <section aria-label="Profilo Clerk" />,
  useUser: () => ({ isLoaded: true, user: { id: "user_test_123" } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

vi.mock("../components/UsageSection", () => ({
  UsageSection: () => <section aria-label="Utilizzo" />,
}));

vi.mock("../components/PreferencesSection", () => ({
  PreferencesSection: () => <section aria-label="Impostazioni" />,
}));

vi.mock("../components/CoachingContextSection", () => ({
  CoachingContextSection: () => <section aria-label="Contesto coaching" />,
}));

afterEach(cleanup);

describe("ProfileClient", () => {
  it("places usage between the Clerk profile and settings", () => {
    render(<ProfileClient />);

    const profile = screen.getByRole("region", { name: "Profilo Clerk" });
    const usage = screen.getByRole("region", { name: "Utilizzo" });
    const preferences = screen.getByRole("region", { name: "Impostazioni" });

    expect(
      profile.compareDocumentPosition(usage) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      usage.compareDocumentPosition(preferences) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows the authenticated user id", () => {
    render(<ProfileClient />);

    const userId = screen.getByRole("region", { name: "ID utente" });

    expect(userId.textContent).toContain("user_test_123");
  });
});
