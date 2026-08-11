// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SuggestedActions } from "./SuggestedActions";

afterEach(cleanup);

describe("SuggestedActions", () => {
  it("shows the four coaching presets", () => {
    render(<SuggestedActions onSelect={() => undefined} variant="cards" />);

    expect(
      screen.getByText("Ansia, pressione o paura di sbagliare"),
    ).toBeTruthy();
    expect(
      screen.getByText("Gestisci tensioni, giudizio e pensieri negativi"),
    ).toBeTruthy();
    expect(screen.getByText("Fiducia e sicurezza mentale")).toBeTruthy();
    expect(
      screen.getByText("Ritrova convinzione e sicurezza in campo"),
    ).toBeTruthy();
    expect(screen.getByText("Preparati a una partita importante")).toBeTruthy();
    expect(
      screen.getByText("Arriva al momento che conta lucido e pronto"),
    ).toBeTruthy();
    expect(screen.getByText("Voglio parlarti di altro")).toBeTruthy();
    expect(screen.getByText("Raccontami cosa sta succedendo")).toBeTruthy();

    expect(screen.queryByText("Dammi un esempio")).toBeNull();
  });

  it("sends the matching coaching prompt when a preset is selected", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(<SuggestedActions onSelect={onSelect} variant="cards" />);

    await user.click(
      screen.getByRole("button", {
        name: /Preparati a una partita importante/,
      }),
    );

    expect(onSelect).toHaveBeenCalledWith(
      "Ho una partita importante in arrivo. Aiutami ad arrivare al momento che conta lucido e pronto.",
    );
  });
});
