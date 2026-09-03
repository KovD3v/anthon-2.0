// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChannelsPageClient } from "./client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

afterEach(cleanup);

describe("ChannelsPageClient", () => {
  it("offers the live Italian WhatsApp number when the channel is not linked", () => {
    render(<ChannelsPageClient connectedChannels={[]} linkTokens={[]} />);

    const link = screen.getByRole("link", { name: "Collega WhatsApp" });

    expect(link.getAttribute("href")).toBe(
      "https://wa.me/393513894441?text=collega",
    );
    expect(screen.getByText("+39 351 389 4441")).toBeTruthy();
    expect(screen.queryByText("Presto disponibile")).toBeNull();
  });
});
