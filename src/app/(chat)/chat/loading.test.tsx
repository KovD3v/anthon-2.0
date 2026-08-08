// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ChatLoading from "./loading";

describe("ChatLoading", () => {
  it("renders dark-aware typing dots on the calm assistant card", () => {
    render(
      <div className="dark">
        <ChatLoading />
      </div>,
    );

    const dots = screen.getByTestId("assistant-typing-dots");
    for (const dot of dots.querySelectorAll("span")) {
      expect(dot.className).toContain("bg-muted-foreground/50");
      expect(dot.className).toContain("dark:bg-muted-foreground/70");
      expect(dot.className).not.toContain("bg-black");
    }
  });
});
