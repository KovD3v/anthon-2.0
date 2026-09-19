// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchDialog } from "./SearchDialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
  it("does not refocus the input after the user tabs before the next animation frame", async () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrameId = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = ++nextFrameId;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    const user = userEvent.setup();
    render(<SearchDialogHarness />);
    await user.click(screen.getByRole("button", { name: "Apri ricerca" }));
    const input = screen.getByRole("textbox", { name: "Cerca nei messaggi" });
    expect(document.activeElement).toBe(input);
    await user.tab();
    const close = screen.getByRole("button", { name: "Chiudi ricerca" });
    expect(document.activeElement).toBe(close);

    act(() => {
      const pendingFrames = [...frames.values()];
      frames.clear();
      for (const callback of pendingFrames) callback(performance.now());
    });

    expect(document.activeElement).toBe(close);
  });
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
