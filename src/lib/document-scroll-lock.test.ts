import { describe, expect, it, vi } from "vitest";
import { installDocumentScrollLock } from "./document-scroll-lock";

describe("installDocumentScrollLock", () => {
  it("releases the page scroll lock when the owning view unmounts", () => {
    const add = vi.fn();
    const remove = vi.fn();

    const cleanup = installDocumentScrollLock(
      { classList: { add, remove } },
      true,
    );

    expect(add).toHaveBeenCalledWith("no-scroll");

    cleanup();

    expect(remove).toHaveBeenCalledWith("no-scroll");
  });

  it("clears a stale lock when the sidebar is closed", () => {
    const add = vi.fn();
    const remove = vi.fn();

    const cleanup = installDocumentScrollLock(
      { classList: { add, remove } },
      false,
    );

    expect(add).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("no-scroll");

    cleanup();

    expect(remove).toHaveBeenCalledTimes(2);
  });
});
