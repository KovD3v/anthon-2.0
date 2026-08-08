// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SearchDialog } from "./SearchDialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function SearchDialogHarness() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Apri ricerca
      </button>
      <SearchDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

describe("SearchDialog", () => {
  it("keeps a centered mobile inset without the default vertical translation", async () => {
    const user = userEvent.setup();
    render(<SearchDialogHarness />);

    await user.click(screen.getByRole("button", { name: "Apri ricerca" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Cerca nelle conversazioni",
    });
    expect(dialog.className).toContain("translate-y-0");
    expect(dialog.className).toContain("w-[calc(100%-2rem)]");
    expect(dialog.className).toContain("max-w-xl");
  });

  it("traps keyboard focus and restores the opener after Escape", async () => {
    const user = userEvent.setup();
    render(<SearchDialogHarness />);

    const opener = screen.getByRole("button", { name: "Apri ricerca" });
    opener.focus();
    await user.click(opener);

    const searchInput = screen.getByRole("textbox", {
      name: "Cerca nei messaggi",
    });
    await waitFor(() => expect(document.activeElement).toBe(searchInput));

    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Chiudi ricerca" }),
    );
    await user.tab();
    expect(document.activeElement).toBe(searchInput);

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Cerca nelle conversazioni" }),
      ).toBeNull(),
    );
    expect(document.activeElement).toBe(opener);
  });
});
