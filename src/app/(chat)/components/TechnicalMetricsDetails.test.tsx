// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TechnicalMetricsDetails } from "./TechnicalMetricsDetails";

describe("TechnicalMetricsDetails", () => {
  it("renders nothing without authorized usage", () => {
    const { container } = render(<TechnicalMetricsDetails usage={undefined} />);

    expect(container.childElementCount).toBe(0);
  });

  it("keeps authorized usage closed until requested and omits unrelated diagnostics", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TechnicalMetricsDetails
        usage={{
          inputTokens: 120,
          outputTokens: 80,
          cost: 0.99,
          generationTimeMs: 1250,
        }}
      />,
    );

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(screen.getByText("Dettagli tecnici")).toBeTruthy();

    await user.click(screen.getByText("Dettagli tecnici"));

    expect(screen.getByText("200 token totali")).toBeTruthy();
    expect(screen.getByText("120 in ingresso")).toBeTruthy();
    expect(screen.getByText("80 in uscita")).toBeTruthy();
    expect(screen.getByText("Durata: 1,25 s")).toBeTruthy();
    expect(screen.queryByText(/costo/i)).toBeNull();
    expect(screen.queryByText(/rag/i)).toBeNull();
    expect(screen.queryByText(/tool/i)).toBeNull();
  });
});
