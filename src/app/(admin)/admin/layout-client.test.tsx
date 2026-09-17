// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import AdminLayout from "./layout-client";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/users",
}));

vi.mock("../../(chat)/components/SidebarBottom", () => ({
  SidebarBottom: () => null,
}));

afterEach(cleanup);

it("keeps desktop and mobile admin navigation without the retired beta console", async () => {
  const user = userEvent.setup();
  render(<AdminLayout>Admin content</AdminLayout>);

  const desktop = screen.getByRole("navigation", {
    name: "Navigazione amministrazione",
  });
  expect(
    within(desktop).getByRole("link", { name: "Utenti" }).getAttribute("href"),
  ).toBe("/admin/users");
  expect(within(desktop).queryByRole("link", { name: "Beta" })).toBeNull();

  await user.click(
    screen.getByRole("button", { name: "Apri navigazione amministrazione" }),
  );
  const mobile = within(screen.getByRole("dialog"));
  expect(
    mobile.getByRole("link", { name: "Utenti" }).getAttribute("href"),
  ).toBe("/admin/users");
  expect(mobile.queryByRole("link", { name: "Beta" })).toBeNull();
  expect(
    mobile.getByRole("link", { name: "Torna alla chat" }).getAttribute("href"),
  ).toBe("/chat");
});
