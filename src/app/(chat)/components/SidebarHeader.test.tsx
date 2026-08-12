// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarHeader } from "./SidebarHeader";

afterEach(cleanup);

describe("SidebarHeader", () => {
  it("places conversation search before the collapse control", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();

    render(<SidebarHeader onCollapse={vi.fn()} onSearch={onSearch} />);

    expect(
      screen
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Cerca nelle conversazioni", "Chiudi la barra laterale"]);

    await user.click(
      screen.getByRole("button", { name: "Cerca nelle conversazioni" }),
    );

    expect(onSearch).toHaveBeenCalledOnce();
  });

  it("omits conversation search when no callback is available", () => {
    render(<SidebarHeader onCollapse={vi.fn()} />);

    expect(
      screen.queryByRole("button", { name: "Cerca nelle conversazioni" }),
    ).toBeNull();
  });
});
