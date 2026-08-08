// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ChatIcon as ChatIconKey } from "@/lib/chat-icons";
import { ChatIcon } from "./ChatIcon";

describe("ChatIcon", () => {
  it("renders the selected icon and falls back safely", () => {
    const { rerender } = render(
      <ChatIcon icon="TARGET" data-testid="chat-icon" />,
    );
    expect(screen.getByTestId("chat-icon").getAttribute("data-chat-icon")).toBe(
      "TARGET",
    );

    rerender(
      <ChatIcon icon={"UNKNOWN" as ChatIconKey} data-testid="chat-icon" />,
    );
    expect(screen.getByTestId("chat-icon").getAttribute("data-chat-icon")).toBe(
      "MESSAGE_SQUARE",
    );
  });
});
