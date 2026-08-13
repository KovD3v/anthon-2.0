// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TechnicalMetricsDetails } from "./TechnicalMetricsDetails";

const completeProfilerUsage = {
  inputTokens: 1_200,
  outputTokens: 320,
  reasoningTokens: 48,
  cost: 0.00314,
  generationTimeMs: 1_420,
  model: "deepseek/deepseek-v4-flash-0731",
  provider: "Together",
  executedProfile: "standard" as const,
  serverTrace: {
    version: 1 as const,
    status: "completed" as const,
    totalMs: 1_400,
    timeToFirstTokenMs: 390,
    spans: [
      {
        id: 1,
        name: "history" as const,
        startOffsetMs: 20,
        durationMs: 180,
        status: "completed" as const,
      },
      {
        id: 2,
        name: "user_context" as const,
        startOffsetMs: 40,
        durationMs: 170,
        status: "completed" as const,
      },
      {
        id: 3,
        name: "model_stream" as const,
        startOffsetMs: 350,
        durationMs: 1_000,
        status: "completed" as const,
        attributes: {
          attemptSequence: 1 as const,
          profile: "standard" as const,
          model: "deepseek/deepseek-v4-flash-0731",
          provider: "Together",
          outcome: "completed" as const,
        },
      },
      {
        id: 4,
        name: "assistant_persistence" as const,
        startOffsetMs: 1_350,
        durationMs: 50,
        status: "completed" as const,
      },
    ],
  },
  clientTrace: {
    version: 1 as const,
    status: "completed" as const,
    milestones: {
      requestStartedMs: 0 as const,
      streamOpenedMs: 12,
      firstChunkReceivedMs: 410,
      firstTextDeltaReceivedMs: 430,
      firstDomTextMs: 460,
      firstVisibleFrameMs: 480,
      streamCompletedMs: 1_520,
      persistedMessageResolvedMs: 1_610,
    },
  },
};

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
    expect(screen.getByText("Dati legacy")).toBeTruthy();
  });

  it("opens and closes the native details control from the keyboard", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TechnicalMetricsDetails
        usage={{ inputTokens: 1, outputTokens: 1, cost: 0 }}
      />,
    );
    const details = container.querySelector("details");
    const summary = container.querySelector("summary");

    await user.tab();
    expect(document.activeElement).toBe(summary);
    await user.keyboard("{Enter}");
    expect(details?.open).toBe(true);
    await user.keyboard(" ");
    expect(details?.open).toBe(false);
  });

  it("renders the complete backend and browser profiler without additive timing claims", () => {
    const { container } = render(
      <TechnicalMetricsDetails usage={completeProfilerUsage} />,
    );

    const root = container.querySelector("details");
    expect(root?.className).toContain("min-w-0");
    expect(root?.className).toContain("max-w-full");
    expect(root?.className).toContain("overflow-hidden");
    expect(screen.getByText("Traccia completa")).toBeTruthy();
    expect(screen.getByText("TTFT server")).toBeTruthy();
    expect(screen.getByText("Primo delta")).toBeTruthy();
    expect(screen.getByText("Primo testo visibile")).toBeTruthy();
    expect(screen.getAllByText("Risposta completa").length).toBeGreaterThan(0);
    expect(screen.getByText("Fine persistenza")).toBeTruthy();
    expect(screen.getByText("320 token/s")).toBeTruthy();
    expect(screen.getByText("Timeline backend")).toBeTruthy();
    expect(screen.getByText("Totale backend")).toBeTruthy();
    expect(screen.getByText("20 ms → 200 ms")).toBeTruthy();
    expect(screen.getByText("Timeline browser")).toBeTruthy();
    expect(screen.getByText("Fuori dal backend misurato")).toBeTruthy();
    expect(screen.queryByText("Latenza di rete")).toBeNull();
    expect(screen.getByText(/non sono additive/i)).toBeTruthy();
    expect(screen.getByText("Più lungo misurato")).toBeTruthy();
    expect(screen.getAllByText(/Completato/).length).toBeGreaterThanOrEqual(4);
    expect(root?.querySelectorAll(".inset-y-0").length).toBeGreaterThan(0);
    expect(root?.innerHTML).not.toContain("min-w-[");
  });

  it("labels partial traces and omits missing browser values instead of inventing zeroes", () => {
    render(
      <TechnicalMetricsDetails
        usage={{
          inputTokens: 10,
          outputTokens: 4,
          cost: 0.0001,
          serverTrace: {
            version: 1,
            status: "partial",
            totalMs: 80,
            spans: [],
          },
        }}
      />,
    );

    expect(screen.getByText("Traccia parziale")).toBeTruthy();
    expect(screen.queryByText("Primo delta")).toBeNull();
    expect(screen.queryByText("Primo testo visibile")).toBeNull();
    expect(screen.queryByText("Risposta completa")).toBeNull();
    expect(screen.queryByText("0 ms")).toBeNull();
  });

  it("reconstructs legacy phases on one clock without presenting a false total", () => {
    const { container } = render(
      <TechnicalMetricsDetails
        usage={{
          inputTokens: 120,
          outputTokens: 80,
          cost: 0.001,
          generationTimeMs: 1_190,
          executionRoute: {
            routingMode: "active",
            eligibleProfile: "light",
            plannedProfile: "light",
            executedProfile: "light",
            taskKind: "coaching",
            decisionSource: "classifier",
            confidenceBucket: "high",
            reasonCodes: ["simple_turn"],
            classificationLatencyMs: 1_356,
            routingOverheadMs: 52,
            totalRequestTimeToFirstTokenMs: 1_991,
            attempts: [
              {
                sequence: 1,
                profile: "light",
                outcome: "completed",
                timeToFirstTokenMs: 582,
                generationTimeMs: 1_190,
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByText("Timeline ricostruita")).toBeTruthy();
    expect(screen.getByText("Tempo totale risposta")).toBeTruthy();
    expect(screen.getByText("Non registrato")).toBeTruthy();
    expect(screen.getByText("Fine generazione stimata")).toBeTruthy();
    expect(screen.getByText("2,6 s")).toBeTruthy();
    expect(screen.getByText("0 ms → 1,36 s")).toBeTruthy();
    expect(screen.getByText("1,36 s → 1,41 s")).toBeTruthy();
    expect(screen.getByText("1,41 s → 2,6 s")).toBeTruthy();
    expect(screen.getByText("Primo token a 1,99 s")).toBeTruthy();
    expect(screen.queryByText("Profiler latenza")).toBeNull();
    expect(container.querySelectorAll(".inset-y-0").length).toBeGreaterThan(0);
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
            classifierModel: "nvidia/nemotron-3.5-lightning",
            classifierProvider: "DeepInfra",
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
    expect(screen.getByText("Modello classificatore")).toBeTruthy();
    expect(screen.getByText("nvidia/nemotron-3.5-lightning")).toBeTruthy();
    expect(screen.getByText("Provider classificatore")).toBeTruthy();
    expect(screen.getByText("DeepInfra")).toBeTruthy();
    expect(screen.getAllByText("Standard").length).toBeGreaterThan(0);
    expect(screen.getByText("Timeline ricostruita")).toBeTruthy();
    expect(screen.getByText("Tempo totale risposta")).toBeTruthy();
    expect(screen.getByText("Classificazione")).toBeTruthy();
    expect(
      screen.getByText("Escalation Light → Standard: errore provider"),
    ).toBeTruthy();
    expect(screen.getByText("2 chiamate · 1,8k caratteri")).toBeTruthy();
    expect(screen.getByText("usato · 3 chunk")).toBeTruthy();
    expect(screen.getByText("active · 2 fatti · 1 evidenze")).toBeTruthy();
  });
});
