// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatHeader } from "./ChatHeader";

describe("ChatHeader", () => {
  it("names the export action for mobile assistive technology", () => {
    render(<ChatHeader chatId="chat-1" title="Allenamento" />);

    expect(
      screen.getByRole("button", { name: "Esporta conversazione" }),
    ).toBeTruthy();
    expect(screen.getByText("Esporta").className).toContain("sm:inline");
  });
});
