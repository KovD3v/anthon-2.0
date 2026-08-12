// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarBottom } from "./SidebarBottom";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  setTheme: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: mocks.signOut }),
  useUser: () => ({
    user: {
      fullName: "Tommaso",
      imageUrl: "/avatar.jpg",
      emailAddresses: [{ emailAddress: "tommaso@example.com" }],
      organizationMemberships: [],
    },
  }),
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => children,
  m: {
    div: ({ children, ...props }: ComponentProps<"div">) => (
      <div {...props}>{children}</div>
    ),
  },
  useReducedMotion: () => true,
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme: mocks.setTheme }),
}));

describe("SidebarBottom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("opens an opaque account menu integrated with the sidebar", async () => {
    const user = userEvent.setup();
    render(<SidebarBottom />);

    const trigger = screen.getByRole("button", { name: "Apri menu account" });
    expect(trigger.className).toContain("bg-transparent");

    await user.click(trigger);

    const menu = screen.getByRole("menu", { name: "Navigazione account" });
    expect(menu.className).toContain("bg-popover");
    expect(menu.className).not.toContain("dark:bg-black/60");
    expect(
      screen
        .getByRole("button", { name: "Chiudi menu account" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("keeps the account actions working and closes the menu", async () => {
    const user = userEvent.setup();
    render(<SidebarBottom />);

    await user.click(screen.getByRole("button", { name: "Apri menu account" }));
    await user.click(screen.getByRole("menuitem", { name: "Tema chiaro" }));

    expect(mocks.setTheme).toHaveBeenCalledWith("light");
    expect(
      screen.queryByRole("menu", { name: "Navigazione account" }),
    ).toBeNull();
  });

  it("keeps only account-level destinations in the menu", async () => {
    const user = userEvent.setup();
    render(<SidebarBottom />);

    await user.click(screen.getByRole("button", { name: "Apri menu account" }));

    expect(screen.queryByRole("menuitem", { name: "Chat" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Utilizzo" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Prezzi" })).toBeNull();
    expect(
      screen.getByRole("menuitem", { name: "Profilo e impostazioni" }),
    ).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Canali" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Assistenza" })).toBeTruthy();
  });
});
