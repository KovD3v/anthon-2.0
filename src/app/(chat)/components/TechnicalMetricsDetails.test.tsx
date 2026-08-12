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

  it("keeps legacy usage closed until requested", async () => {
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
  });

  it("opens rich localhost diagnostics and exposes routing, profiler, and context", () => {
    const { container } = render(
      <TechnicalMetricsDetails
        usage={{
          inputTokens: 1200,
          outputTokens: 320,
          reasoningTokens: 48,
          cost: 0.00314,
          generationTimeMs: 1420,
          model: "deepseek/deepseek-v4-flash-0731",
          provider: "Together",
          toolCallCount: 2,
          toolResultChars: 1840,
          toolTiming: {
            firstModelStepMs: 280,
            toolExecutionMs: 410,
            finalModelStepMs: 620,
          },
          ragAttempted: true,
          ragUsed: true,
          ragChunksCount: 3,
          memoryRecall: {
            mode: "active",
            reason: "returning_user",
            factCount: 2,
            evidenceCount: 1,
            factRecallMs: 12,
            conversationRecallMs: 34,
            degraded: false,
          },
          executionRoute: {
            routingMode: "active",
            eligibleProfile: "light",
            plannedProfile: "light",
            executedProfile: "standard",
            taskKind: "coaching",
            decisionSource: "classifier",
            confidenceBucket: "high",
            reasonCodes: ["simple_turn"],
            classificationLatencyMs: 18,
            routingOverheadMs: 24,
            totalRequestTimeToFirstTokenMs: 390,
            attempts: [
              {
                sequence: 1,
                profile: "light",
                outcome: "failed_before_stream",
                generationTimeMs: 150,
              },
              {
                sequence: 2,
                profile: "standard",
                outcome: "completed",
                timeToFirstTokenMs: 210,
                generationTimeMs: 1270,
              },
            ],
            escalation: {
              from: "light",
              to: "standard",
              reason: "provider_error",
            },
          },
        }}
      />,
    );

    expect(container.querySelector("details")?.open).toBe(true);
    expect(screen.getByText("deepseek/deepseek-v4-flash-0731")).toBeTruthy();
    expect(screen.getAllByText("Standard").length).toBeGreaterThan(0);
    expect(screen.getByText("Profiler latenza")).toBeTruthy();
    expect(screen.getByText("TTFT totale")).toBeTruthy();
    expect(screen.getByText("Classificazione")).toBeTruthy();
    expect(
      screen.getByText("Escalation Light → Standard: errore provider"),
    ).toBeTruthy();
    expect(screen.getByText("2 chiamate · 1,8k caratteri")).toBeTruthy();
    expect(screen.getByText("usato · 3 chunk")).toBeTruthy();
    expect(screen.getByText("active · 2 fatti · 1 evidenze")).toBeTruthy();
  });
});
