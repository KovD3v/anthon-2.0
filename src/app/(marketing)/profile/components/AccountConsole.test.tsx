// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountConsole } from "./AccountConsole";

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    isLoaded: true,
    user: {
      id: "user_test_123",
      firstName: "Ada",
      lastName: "Lovelace",
      username: null,
      imageUrl: "https://example.com/avatar.png",
    },
  }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock("./ProfileIdentitySection", () => ({
  ProfileIdentitySection: () => <section aria-label="Identità account" />,
}));

vi.mock("./DangerZoneSection", () => ({
  DangerZoneSection: () => <section aria-label="Zona pericolosa" />,
}));

vi.mock("./UsageSection", () => ({
  UsageSection: () => <section aria-label="Utilizzo" />,
}));

vi.mock("./CoachingContextSection", () => ({
  CoachingContextSection: () => <section aria-label="Memorie" />,
}));

vi.mock("./PreferencesSection", () => ({
  PreferencesSection: () => <section aria-label="Impostazioni Anthon" />,
}));

vi.mock("./SecuritySection", () => ({
  SecuritySection: () => <section aria-label="Sicurezza account" />,
}));

vi.mock("./SessionsSection", () => ({
  SessionsSection: () => <section aria-label="Sessioni attive" />,
}));

vi.mock("./ConnectedAccountsSection", () => ({
  ConnectedAccountsSection: () => <section aria-label="Account collegati" />,
}));

afterEach(cleanup);

describe("AccountConsole", () => {
  it("renders the native account tabs and profile content", () => {
    render(<AccountConsole />);

    expect(screen.getByRole("tab", { name: "Profilo" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Anthon" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Sicurezza" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Sessioni" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Account collegati" })).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Profilo account" }),
    ).toBeTruthy();
    expect(screen.getByRole("region", { name: "Utilizzo" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Memorie" })).toBeTruthy();
    expect(screen.queryByLabelText("Profilo Clerk")).toBeNull();
  });
});
