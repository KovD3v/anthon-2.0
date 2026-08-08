// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatHeader } from "./ChatHeader";

describe("ChatHeader", () => {
  it("names the export action for mobile assistive technology", () => {
    render(<ChatHeader chatId="chat-1" title="Allenamento" icon="DUMBBELL" />);

    expect(
      screen.getByRole("button", { name: "Esporta conversazione" }),
    ).toBeTruthy();
    expect(screen.getByText("Esporta").className).toContain("sm:inline");
    expect(
      screen.getByTestId("chat-header-icon").getAttribute("data-chat-icon"),
    ).toBe("DUMBBELL");
    expect(
      screen.getByRole("button", {
        name: "Rinomina conversazione: Allenamento",
      }),
    ).toBeTruthy();
  });

  it("keeps the compact guest registration status visible on a 390px viewport", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });

    render(
      <ChatHeader
        chatId="chat-1"
        title="Allenamento"
        icon="DUMBBELL"
        onOpenSidebar={() => undefined}
        guestConversationNotice={{
          remaining: 2,
          registrationHref: "/sign-up?redirect_url=%2Fchat%2Fchat-1",
        }}
      />,
    );

    expect(
      screen.getByRole("link", {
        name: "Registrati: 2 messaggi rimasti",
      }),
    ).toBeTruthy();
    expect(screen.getByText("2 rimasti").className).toContain("inline");
    expect(screen.getByText("2 rimasti").className).not.toContain("hidden");
  });

  it("keeps the guest registration status available on desktop", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
    });

    render(
      <ChatHeader
        chatId="chat-1"
        title="Allenamento"
        icon="DUMBBELL"
        guestConversationNotice={{
          remaining: 2,
          registrationHref: "/sign-up?redirect_url=%2Fchat%2Fchat-1",
        }}
      />,
    );

    const registrationLink = screen.getByRole("link", {
      name: "Registrati: 2 messaggi rimasti",
    });
    expect(registrationLink.className).not.toContain("md:hidden");
    expect(screen.getByText("2 rimasti").className).toContain("inline");
  });
});
