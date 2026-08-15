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
  messageId: "message-admin-1",
  model: "deepseek/deepseek-v4-flash",
  provider: "Together",
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
          model: "deepseek/deepseek-v4-flash",
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
    expect(screen.getByText("ID messaggio")).toBeTruthy();
    expect(screen.getByText("message-admin-1")).toBeTruthy();
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

  it("ignores historical profile-router metadata instead of presenting it as current latency", () => {
    render(
      <TechnicalMetricsDetails
        usage={
          {
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
              attempts: [],
            },
          } as never
        }
      />,
    );

    expect(screen.queryByText("Classificazione")).toBeNull();
    expect(screen.queryByText("Timeline ricostruita")).toBeNull();
    expect(screen.queryByText(/profilo/i)).toBeNull();
  });

  it("shows current model, tools, RAG, and memory diagnostics without routing fields", () => {
    const { container } = render(
      <TechnicalMetricsDetails
        usage={{
          inputTokens: 1200,
          outputTokens: 320,
          reasoningTokens: 48,
          cost: 0.00314,
          generationTimeMs: 1420,
          model: "deepseek/deepseek-v4-flash",
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
        }}
      />,
    );

    expect(container.querySelector("details")?.open).toBe(true);
    expect(screen.getByText("deepseek/deepseek-v4-flash")).toBeTruthy();
    expect(screen.getByText("Together")).toBeTruthy();
    expect(screen.getByText("2 chiamate · 1,8k caratteri")).toBeTruthy();
    expect(screen.getByText("usato · 3 chunk")).toBeTruthy();
    expect(screen.getByText("active · 2 fatti · 1 evidenze")).toBeTruthy();
    expect(screen.queryByText("Modello classificatore")).toBeNull();
    expect(screen.queryByText("Provider classificatore")).toBeNull();
    expect(screen.queryByText("Classificazione")).toBeNull();
    expect(screen.queryByText(/Escalation/i)).toBeNull();
  });
});
