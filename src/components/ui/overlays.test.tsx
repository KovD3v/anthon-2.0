// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

afterEach(cleanup);

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("UI overlay compatibility", () => {
  it("composes a dialog trigger and closes the dialog", async () => {
    const user = userEvent.setup();

    render(
      <Dialog>
        <DialogTrigger asChild>
          <a href="#dialog">Apri dialog</a>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Preferenze</DialogTitle>
          <DialogDescription>Modifica le preferenze.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    await user.click(screen.getByRole("link", { name: "Apri dialog" }));
    expect(screen.getByRole("dialog", { name: "Preferenze" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("keeps sheet trigger and close asChild semantics", async () => {
    const user = userEvent.setup();

    render(
      <Sheet>
        <SheetTrigger asChild>
          <button type="button">Apri menu</button>
        </SheetTrigger>
        <SheetContent showCloseButton={false}>
          <SheetTitle>Navigazione</SheetTitle>
          <SheetDescription>Sezioni disponibili.</SheetDescription>
          <SheetClose asChild>
            <a href="#closed">Chiudi menu</a>
          </SheetClose>
        </SheetContent>
      </Sheet>,
    );

    await user.click(screen.getByRole("button", { name: "Apri menu" }));
    expect(screen.getByRole("dialog", { name: "Navigazione" })).toBeTruthy();

    await user.click(screen.getByRole("link", { name: "Chiudi menu" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("calls dropdown item onSelect", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button">Azioni</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onSelect}>Rigenera</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    const trigger = screen.getByRole("button", { name: "Azioni" });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    await user.click(screen.getByRole("menuitem", { name: "Rigenera" }));

    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("changes a select value", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Select defaultValue="standard" onValueChange={onValueChange}>
        <SelectTrigger aria-label="Profilo">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="standard">Standard</SelectItem>
          <SelectItem value="light">Light</SelectItem>
        </SelectContent>
      </Select>,
    );

    const trigger = screen.getByRole("combobox", { name: "Profilo" });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    await user.click(screen.getByRole("option", { name: "Light" }));

    expect(onValueChange).toHaveBeenLastCalledWith("light");
  });
});
