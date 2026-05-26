import { describe, expect, it, vi } from "vitest";
import {
  getChatViewportSizing,
  installChatViewportSizing,
} from "./visual-viewport";

describe("getChatViewportSizing", () => {
  it.each([
    {
      name: "mobile browser chrome",
      input: {
        innerHeight: 844,
        visualViewport: {
          height: 692,
        },
      },
      output: {
        height: "692px",
      },
    },
    {
      name: "compact landscape viewport",
      input: {
        innerHeight: 430,
        visualViewport: {
          height: 356.4,
        },
      },
      output: {
        height: "356px",
      },
    },
    {
      name: "tall Android-style viewport",
      input: {
        innerHeight: 915,
        visualViewport: {
          height: 812.3,
        },
      },
      output: {
        height: "812px",
      },
    },
    {
      name: "keyboard-reduced viewport",
      input: {
        innerHeight: 852,
        visualViewport: {
          height: 421.6,
        },
      },
      output: {
        height: "422px",
      },
    },
  ])("uses visualViewport metrics for $name", ({ input, output }) => {
    expect(getChatViewportSizing(input)).toEqual(output);
  });

  it("falls back to innerHeight when visualViewport is unavailable", () => {
    expect(
      getChatViewportSizing({
        innerHeight: 844,
      }),
    ).toEqual({
      height: "844px",
    });
  });
});

describe("installChatViewportSizing", () => {
  it("writes viewport CSS variables and removes listeners on cleanup", () => {
    const setProperty = vi.fn();
    const removeProperty = vi.fn();
    const addVisualListener = vi.fn();
    const removeVisualListener = vi.fn();
    const addWindowListener = vi.fn();
    const removeWindowListener = vi.fn();

    const cleanup = installChatViewportSizing(
      {
        style: {
          removeProperty,
          setProperty,
        },
      },
      {
        addEventListener: addWindowListener,
        innerHeight: 844,
        removeEventListener: removeWindowListener,
        visualViewport: {
          addEventListener: addVisualListener,
          height: 692,
          removeEventListener: removeVisualListener,
        },
      },
    );

    expect(setProperty).toHaveBeenCalledWith("--chat-viewport-height", "692px");
    expect(addVisualListener).toHaveBeenCalledWith("resize", expect.anything());
    expect(addVisualListener).toHaveBeenCalledWith("scroll", expect.anything());
    expect(addWindowListener).toHaveBeenCalledWith("resize", expect.anything());

    cleanup();

    expect(removeVisualListener).toHaveBeenCalledWith(
      "resize",
      expect.anything(),
    );
    expect(removeVisualListener).toHaveBeenCalledWith(
      "scroll",
      expect.anything(),
    );
    expect(removeWindowListener).toHaveBeenCalledWith(
      "resize",
      expect.anything(),
    );
    expect(removeProperty).toHaveBeenCalledWith("--chat-viewport-height");
  });
});
