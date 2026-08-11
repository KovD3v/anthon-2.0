import { beforeEach, describe, expect, it, vi } from "vitest";

type StreamOptions = {
  execute(input: { writer: { write(value: unknown): void } }): Promise<void>;
};

type VariantOutcome =
  | { type: "success"; text: string }
  | { type: "empty" }
  | { type: "failure"; error: Error };

const mocks = vi.hoisted(() => ({
  streamOptions: null as StreamOptions | null,
  preparedCapabilityDecision: null as Record<string, unknown> | null,
  preparedTurnDecision: null as Record<string, unknown> | null,
  outcomes: new Map<string, VariantOutcome>(),
  createUIMessageStream: vi.fn(),
  createUIMessageStreamResponse: vi.fn(),
  prepareChatTurn: vi.fn(),
  executePreparedChatTurn: vi.fn(),
  getImmediatelyAttributableApproval: vi.fn(),
  mightResolvePendingMemoryApproval: vi.fn(),
  checkStaticEligibility: vi.fn(),
  getExperimentCandidate: vi.fn(),
  isCheaplySafeMessage: vi.fn(),
  isFlagEnabled: vi.fn(),
  isSafeTurn: vi.fn(),
  createPair: vi.fn(),
  markExposed: vi.fn(),
  resolvePair: vi.fn(),
  updatePair: vi.fn(),
  findPair: vi.fn(),
  findUsageReservation: vi.fn(),
  updateResponse: vi.fn(),
  reserveUsage: vi.fn(),
  releaseUsage: vi.fn(),
  finalizeFailedPair: vi.fn(),
  finalizePair: vi.fn(),
  captureEvent: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("ai", () => ({
  createUIMessageStream: mocks.createUIMessageStream,
  createUIMessageStreamResponse: mocks.createUIMessageStreamResponse,
}));

vi.mock("@/lib/ai/orchestrator", () => ({
  prepareChatTurn: mocks.prepareChatTurn,
  executePreparedChatTurn: mocks.executePreparedChatTurn,
}));

vi.mock("@/lib/ai/memory-approval", () => ({
  getImmediatelyAttributableApproval: mocks.getImmediatelyAttributableApproval,
  mightResolvePendingMemoryApproval: mocks.mightResolvePendingMemoryApproval,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    modelExperimentPair: {
      findUnique: mocks.findPair,
      update: mocks.updatePair,
    },
    modelExperimentResponse: { update: mocks.updateResponse },
    aiUsageReservation: { findUnique: mocks.findUsageReservation },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  reserveAiUsage: mocks.reserveUsage,
  releaseAiUsageReservation: mocks.releaseUsage,
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: mocks.loggerError }),
}));

vi.mock("./analytics", () => ({
  captureModelComparisonEvent: mocks.captureEvent,
  MODEL_COMPARISON_EVENTS: {
    ready: "model_comparison_ready",
    failed: "model_comparison_failed",
  },
}));

vi.mock("./eligibility", () => ({
  checkStaticModelComparisonEligibility: mocks.checkStaticEligibility,
  getModelExperimentCandidate: mocks.getExperimentCandidate,
  isCheaplySafeModelComparisonMessage: mocks.isCheaplySafeMessage,
  isModelExperimentFlagEnabled: mocks.isFlagEnabled,
  isSafeModelComparisonTurn: mocks.isSafeTurn,
}));

vi.mock("./service", () => ({
  createModelComparisonPair: mocks.createPair,
  finalizeFailedModelComparisonPair: mocks.finalizeFailedPair,
  finalizeReadyModelComparisonPair: mocks.finalizePair,
  markModelComparisonExposed: mocks.markExposed,
  resolveModelComparisonPair: mocks.resolvePair,
}));

import { freezeTurnDecision } from "@/lib/ai/execution-routing";
import { tryCreateModelComparisonResponse } from "./runtime";

const metrics = {
  model: "provider/model",
  inputTokens: 10,
  outputTokens: 5,
  reasoningTokens: null,
  reasoningContent: null,
  toolCalls: null,
  ragUsed: false,
  ragChunksCount: 0,
  costUsd: 0.001,
  generationTimeMs: 100,
  reasoningTimeMs: null,
};

const experiment = {
  id: "experiment-1",
  targetCountry: "IT",
  variants: [
    {
      id: "control",
      role: "CONTROL",
      modelId: "provider/control",
      generationConfig: { fallbacks: false, temperature: 0.2 },
    },
    {
      id: "candidate",
      role: "CANDIDATE",
      modelId: "provider/candidate",
      generationConfig: {
        fallbacks: false,
        temperature: 0.8,
        reasoning: "low",
      },
    },
  ],
};

const pair = {
  id: "pair-1",
  slotAVariantId: "control",
  slotBVariantId: "candidate",
  responses: [
    { id: "response-control", variantId: "control", traceId: "trace-1" },
    {
      id: "response-candidate",
      variantId: "candidate",
      traceId: "trace-2",
    },
  ],
};

function runtimeInput() {
  return {
    user: {
      id: "user-1",
      clerkId: "clerk-1",
      role: "USER",
      isGuest: false,
    },
    request: new Request("http://localhost/api/chat", {
      headers: { "x-vercel-ip-country": "it" },
    }),
    chatId: "chat-1",
    conversationThreadId: "thread-1",
    sourceMessageId: "message-1",
    userMessage: "Aiutami a pianificare la giornata",
    hasAttachments: false,
    effectiveEntitlements: {
      limits: {
        maxRequestsPerDay: 20,
        maxInputTokensPerDay: 100_000,
        maxOutputTokensPerDay: 50_000,
        maxCostPerDay: 5,
        maxContextMessages: 20,
      },
      uploadLimits: {
        maxUploadsPerDay: 10,
        maxUploadBytesPerDay: 100_000_000,
      },
      modelTier: "BASIC" as const,
      sources: [],
    },
  };
}

async function executeCapturedStream() {
  if (!mocks.streamOptions) throw new Error("stream was not created");
  const events: unknown[] = [];
  const writer = {
    write(value: unknown) {
      events.push(structuredClone(value));
    },
  };
  await mocks.streamOptions.execute({ writer });
  return events;
}

describe("model comparison runtime", () => {
  beforeEach(() => {
    mocks.streamOptions = null;
    mocks.outcomes.clear();
    mocks.createUIMessageStream.mockImplementation((options) => {
      mocks.streamOptions = options as StreamOptions;
      return options;
    });
    mocks.createUIMessageStreamResponse.mockReturnValue(
      new Response("comparison-stream"),
    );
    mocks.checkStaticEligibility.mockReturnValue(true);
    mocks.isCheaplySafeMessage.mockReturnValue(true);
    mocks.mightResolvePendingMemoryApproval.mockReturnValue(false);
    mocks.getImmediatelyAttributableApproval.mockResolvedValue(null);
    mocks.getExperimentCandidate.mockResolvedValue(experiment);
    mocks.isFlagEnabled.mockResolvedValue(true);
    mocks.isSafeTurn.mockReturnValue(true);
    mocks.findPair.mockResolvedValue(null);
    mocks.findUsageReservation.mockResolvedValue({
      status: "RESERVED",
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.reserveUsage.mockResolvedValue({
      allowed: true,
      reservationId: "reservation-1",
      claimToken: "claim-1",
    });
    mocks.releaseUsage.mockResolvedValue(true);
    mocks.finalizeFailedPair.mockResolvedValue({
      id: "pair-1",
      status: "FAILED",
    });
    mocks.finalizePair.mockResolvedValue({ id: "pair-1", status: "READY" });
    const capabilityDecision = Object.freeze({
      rag: true,
      webSearch: false,
      webFetch: false,
      memoryRead: false,
      memoryWrite: false,
      memoryDelete: false,
      memoryDeleteTarget: null,
      routineProposal: false,
      userContext: true,
      voiceOutput: false,
      source: "classifier",
      reasonCodes: Object.freeze([]),
    });
    mocks.preparedCapabilityDecision = capabilityDecision;
    const turnDecision = freezeTurnDecision({
      version: 1,
      capabilities: capabilityDecision as never,
      execution: {
        eligibleProfile: "light",
        taskKind: "rewrite",
        contextDependency: "recent",
        source: "classifier",
        confidenceBucket: "high",
        reasonCodes: ["classifier_light", "task_allowlisted"],
        policyVersion: 1,
        classifierVersion: 1,
      },
    });
    mocks.preparedTurnDecision = turnDecision;
    const plannedExecution = Object.freeze({
      routingMode: "shadow",
      eligibleProfile: "light",
      plannedProfile: "standard",
      reasonCodes: Object.freeze(["classifier_light", "rollout_shadow"]),
      primary: Object.freeze({
        version: 1,
        profile: "standard",
        promptProfile: "existing",
        toolPolicy: "planned",
        reasoningBudget: "normal",
      }),
    });
    mocks.prepareChatTurn.mockResolvedValue({
      promptMode: "full",
      effectiveModelTier: "standard",
      turnPlan: { execution: plannedExecution },
      turnDecision,
      classificationLatencyMs: 12,
      plannedExecution,
      capabilityDecision,
      capabilityPlannerMode: "agentic",
    });
    mocks.createPair.mockResolvedValue({ pair, noticeRequired: true });
    mocks.markExposed.mockResolvedValue(undefined);
    mocks.resolvePair.mockResolvedValue(undefined);
    mocks.updatePair.mockResolvedValue(undefined);
    mocks.updateResponse.mockResolvedValue(undefined);
    mocks.executePreparedChatTurn.mockImplementation(
      ({ modelId, onFirstToken, onFinish }) => {
        const outcome = mocks.outcomes.get(modelId) ?? {
          type: "success",
          text: modelId.endsWith("control") ? "Controllo" : "Candidato",
        };
        const textStream = (async function* () {
          if (outcome.type === "failure") throw outcome.error;
          onFirstToken?.(20);
          onFinish?.({ metrics });
          if (outcome.type === "success") yield outcome.text;
        })();
        return { textStream };
      },
    );
  });

  it("streams and persists two successful variants before marking the pair ready", async () => {
    const input = runtimeInput();
    const response = await tryCreateModelComparisonResponse(input);
    const events = await executeCapturedStream();

    expect(await response?.text()).toBe("comparison-stream");
    expect(mocks.prepareChatTurn).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: input.request.signal }),
    );
    expect(mocks.prepareChatTurn).toHaveBeenCalledTimes(1);
    expect(mocks.executePreparedChatTurn).toHaveBeenCalledTimes(2);
    for (const [options] of mocks.executePreparedChatTurn.mock.calls) {
      expect(options).toEqual(
        expect.objectContaining({ abortSignal: input.request.signal }),
      );
      expect(options.prepared.capabilityDecision).toBe(
        mocks.preparedCapabilityDecision,
      );
      expect(options.prepared.turnDecision).toBe(mocks.preparedTurnDecision);
      expect(Object.isFrozen(options.prepared.turnDecision)).toBe(true);
    }
    expect(mocks.executePreparedChatTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "provider/control",
        generationConfig: { fallbacks: false, temperature: 0.2 },
      }),
    );
    expect(mocks.executePreparedChatTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "provider/candidate",
        generationConfig: {
          fallbacks: false,
          temperature: 0.8,
          reasoning: "low",
        },
      }),
    );
    expect(mocks.updateResponse).toHaveBeenCalledWith({
      where: { id: "response-control" },
      data: expect.objectContaining({
        status: "COMPLETED",
        text: "Controllo",
        inputTokens: 10,
        outputTokens: 5,
        timeToFirstTokenMs: 20,
      }),
    });
    expect(mocks.updateResponse).toHaveBeenCalledWith({
      where: { id: "response-candidate" },
      data: expect.objectContaining({
        status: "COMPLETED",
        text: "Candidato",
      }),
    });
    expect(mocks.finalizePair).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({
      data: {
        status: "ready",
        slots: {
          A: { status: "completed", text: "Controllo" },
          B: { status: "completed", text: "Candidato" },
        },
      },
    });
    expect(mocks.captureEvent).toHaveBeenCalledWith(
      "model_comparison_ready",
      "clerk-1",
      expect.objectContaining({
        pair_id: "pair-1",
        routing_mode: "shadow",
        eligible_profile: "light",
        planned_profile: "standard",
        task_kind: "rewrite",
        policy_version: 1,
      }),
    );
    expect(mocks.reserveUsage).toHaveBeenCalledWith({
      userId: "user-1",
      requestKey: "message-1",
      limits: runtimeInput().effectiveEntitlements.limits,
    });
    expect(mocks.reserveUsage.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createPair.mock.invocationCallOrder[0],
    );
    expect(mocks.createPair).toHaveBeenCalledWith(
      expect.objectContaining({
        experimentId: "experiment-1",
        userId: "user-1",
        chatId: "chat-1",
        conversationThreadId: "thread-1",
        sourceMessageId: "message-1",
        countryCode: "IT",
        capabilityPlannerMode: "agentic",
        turnDecision: mocks.preparedTurnDecision,
        routingMode: "shadow",
        plannedProfile: "standard",
      }),
    );
    expect(mocks.finalizePair).toHaveBeenCalledWith({
      pairId: "pair-1",
      userId: "user-1",
      metrics: expect.objectContaining({
        inputTokens: 20,
        outputTokens: 10,
        reasoningTokens: null,
        costUsd: 0.002,
        generationTimeMs: 200,
      }),
    });
    expect(mocks.updatePair).toHaveBeenCalledWith({
      where: { id: "pair-1" },
      data: {
        promptMode: "full",
      },
    });
    expect(mocks.releaseUsage).not.toHaveBeenCalled();
  });

  it("treats empty output as a failed variant and auto-selects the success", async () => {
    mocks.outcomes.set("provider/candidate", { type: "empty" });

    await tryCreateModelComparisonResponse(runtimeInput());
    const events = await executeCapturedStream();

    expect(mocks.updateResponse).toHaveBeenCalledWith({
      where: { id: "response-candidate" },
      data: {
        status: "FAILED",
        errorCode: "Error",
        completedAt: expect.any(Date),
      },
    });
    expect(mocks.resolvePair).toHaveBeenCalledWith(
      expect.objectContaining({
        pairId: "pair-1",
        userId: "user-1",
        clerkId: "clerk-1",
        choice: "AUTO_SUCCESS",
      }),
    );
    expect(events.at(-1)).toMatchObject({
      data: {
        status: "partial_failed",
        slots: { B: { status: "failed", text: "" } },
      },
    });
    expect(mocks.resolvePair).toHaveBeenCalledWith(
      expect.objectContaining({
        usageMetrics: expect.objectContaining({
          inputTokens: 10,
          outputTokens: 5,
          costUsd: 0.001,
        }),
      }),
    );
  });

  it("preserves a successful response when the other provider fails", async () => {
    mocks.outcomes.set("provider/control", {
      type: "failure",
      error: new TypeError("provider unavailable"),
    });

    await tryCreateModelComparisonResponse(runtimeInput());
    const events = await executeCapturedStream();

    expect(mocks.updateResponse).toHaveBeenCalledWith({
      where: { id: "response-control" },
      data: {
        status: "FAILED",
        errorCode: "TypeError",
        completedAt: expect.any(Date),
      },
    });
    expect(mocks.resolvePair).toHaveBeenCalledWith(
      expect.objectContaining({ choice: "AUTO_SUCCESS" }),
    );
    expect(events.at(-1)).toMatchObject({
      data: {
        status: "partial_failed",
        slots: {
          A: { status: "failed", text: "" },
          B: { status: "completed", text: "Candidato" },
        },
      },
    });
  });

  it("marks the pair failed when both providers fail", async () => {
    mocks.outcomes.set("provider/control", {
      type: "failure",
      error: new Error("control failed"),
    });
    mocks.outcomes.set("provider/candidate", {
      type: "failure",
      error: new Error("candidate failed"),
    });

    await tryCreateModelComparisonResponse(runtimeInput());

    await expect(executeCapturedStream()).rejects.toThrow(
      "MODEL_COMPARISON_FAILED",
    );
    expect(mocks.finalizeFailedPair).toHaveBeenCalledWith({
      pairId: "pair-1",
      userId: "user-1",
    });
    expect(mocks.resolvePair).not.toHaveBeenCalled();
    expect(mocks.captureEvent).toHaveBeenCalledWith(
      "model_comparison_failed",
      "clerk-1",
      expect.objectContaining({ pair_id: "pair-1" }),
    );
    expect(mocks.finalizePair).not.toHaveBeenCalled();
    expect(mocks.releaseUsage).not.toHaveBeenCalled();
  });

  it("cancels both providers and finalizes the reservation after a request abort", async () => {
    const abortController = new AbortController();
    const input = runtimeInput();
    input.request = new Request("http://localhost/api/chat", {
      headers: { "x-vercel-ip-country": "it" },
      signal: abortController.signal,
    });
    mocks.executePreparedChatTurn.mockImplementation(({ abortSignal }) => ({
      textStream: (async function* () {
        if (abortSignal?.aborted) throw abortSignal.reason;
        yield "unexpected";
      })(),
    }));

    await tryCreateModelComparisonResponse(input);
    abortController.abort(new Error("client disconnected"));

    await expect(executeCapturedStream()).rejects.toThrow(
      "MODEL_COMPARISON_FAILED",
    );
    expect(mocks.executePreparedChatTurn).toHaveBeenCalledTimes(2);
    for (const [options] of mocks.executePreparedChatTurn.mock.calls) {
      expect(options.abortSignal).toBe(input.request.signal);
    }
    expect(mocks.finalizeFailedPair).toHaveBeenCalledWith({
      pairId: "pair-1",
      userId: "user-1",
    });
    expect(mocks.finalizePair).not.toHaveBeenCalled();
  });

  it("does not prepare or generate when atomic usage reservation is denied", async () => {
    mocks.reserveUsage.mockResolvedValue({
      allowed: false,
      reason: "Daily request limit reached",
      retryable: false,
    });

    const response = await tryCreateModelComparisonResponse(runtimeInput());

    expect(response?.status).toBe(429);
    await expect(response?.json()).resolves.toMatchObject({
      code: "USAGE_RESERVATION_DENIED",
      retryable: false,
    });
    expect(mocks.prepareChatTurn).not.toHaveBeenCalled();
    expect(mocks.createPair).not.toHaveBeenCalled();
    expect(mocks.executePreparedChatTurn).not.toHaveBeenCalled();
    expect(mocks.finalizePair).not.toHaveBeenCalled();
  });

  it("replays a ready pair without reserving or regenerating", async () => {
    mocks.checkStaticEligibility.mockReturnValue(false);
    mocks.findPair.mockResolvedValue({
      id: "pair-1",
      userId: "user-1",
      status: "READY",
      slotAVariantId: "control",
      slotBVariantId: "candidate",
      responses: [
        { variantId: "control", status: "COMPLETED", text: "Controllo" },
        {
          variantId: "candidate",
          status: "COMPLETED",
          text: "Candidato",
        },
      ],
    });

    const response = await tryCreateModelComparisonResponse(runtimeInput());
    const events = await executeCapturedStream();

    expect(await response?.text()).toBe("comparison-stream");
    expect(events).toEqual([
      expect.objectContaining({
        type: "data-modelComparison",
        data: expect.objectContaining({
          pairId: "pair-1",
          status: "ready",
          slots: {
            A: { status: "completed", text: "Controllo" },
            B: { status: "completed", text: "Candidato" },
          },
        }),
      }),
    ]);
    expect(mocks.reserveUsage).not.toHaveBeenCalled();
    expect(mocks.getExperimentCandidate).not.toHaveBeenCalled();
    expect(mocks.prepareChatTurn).not.toHaveBeenCalled();
    expect(mocks.executePreparedChatTurn).not.toHaveBeenCalled();
  });

  it.each([
    {
      databaseStatus: "PARTIAL_FAILED",
      streamStatus: "partial_failed",
      responses: [
        { variantId: "control", status: "FAILED", text: null },
        {
          variantId: "candidate",
          status: "COMPLETED",
          text: "Candidato",
        },
      ],
    },
    {
      databaseStatus: "RESOLVED",
      streamStatus: "resolved",
      responses: [
        { variantId: "control", status: "COMPLETED", text: "Controllo" },
        {
          variantId: "candidate",
          status: "COMPLETED",
          text: "Candidato",
        },
      ],
    },
  ])(
    "replays stored slots for a $databaseStatus pair",
    async ({ databaseStatus, streamStatus, responses }) => {
      mocks.findPair.mockResolvedValue({
        id: "pair-1",
        userId: "user-1",
        status: databaseStatus,
        slotAVariantId: "control",
        slotBVariantId: "candidate",
        responses,
      });

      await tryCreateModelComparisonResponse(runtimeInput());
      const events = await executeCapturedStream();

      expect(events.at(-1)).toMatchObject({
        data: { pairId: "pair-1", status: streamStatus },
      });
      expect(mocks.reserveUsage).not.toHaveBeenCalled();
      expect(mocks.executePreparedChatTurn).not.toHaveBeenCalled();
    },
  );

  it("falls back to normal generation for a failed stored pair", async () => {
    mocks.findPair.mockResolvedValue({
      id: "pair-1",
      userId: "user-1",
      status: "FAILED",
      slotAVariantId: "control",
      slotBVariantId: "candidate",
      responses: [
        { variantId: "control", status: "FAILED", text: null },
        { variantId: "candidate", status: "FAILED", text: null },
      ],
    });

    await expect(
      tryCreateModelComparisonResponse(runtimeInput()),
    ).resolves.toBeNull();
    expect(mocks.reserveUsage).not.toHaveBeenCalled();
    expect(mocks.createPair).not.toHaveBeenCalled();
    expect(mocks.executePreparedChatTurn).not.toHaveBeenCalled();
  });

  it("returns a retryable conflict for an active generating pair", async () => {
    mocks.findPair.mockResolvedValue({
      id: "pair-1",
      userId: "user-1",
      status: "GENERATING",
      slotAVariantId: "control",
      slotBVariantId: "candidate",
      responses: [],
    });

    const response = await tryCreateModelComparisonResponse(runtimeInput());

    expect(response?.status).toBe(409);
    expect(response?.headers.get("retry-after")).toBe("2");
    await expect(response?.json()).resolves.toMatchObject({
      code: "MODEL_COMPARISON_IN_PROGRESS",
      retryable: true,
    });
    expect(mocks.reserveUsage).not.toHaveBeenCalled();
    expect(mocks.executePreparedChatTurn).not.toHaveBeenCalled();
  });

  it("fails a stale generating pair and falls back after its lease expires", async () => {
    mocks.findPair.mockResolvedValue({
      id: "pair-1",
      userId: "user-1",
      status: "GENERATING",
      slotAVariantId: "control",
      slotBVariantId: "candidate",
      responses: [],
    });
    mocks.findUsageReservation.mockResolvedValue({
      status: "RESERVED",
      expiresAt: new Date(Date.now() - 1),
    });

    await expect(
      tryCreateModelComparisonResponse(runtimeInput()),
    ).resolves.toBeNull();
    expect(mocks.finalizeFailedPair).toHaveBeenCalledWith({
      pairId: "pair-1",
      userId: "user-1",
    });
    expect(mocks.reserveUsage).not.toHaveBeenCalled();
    expect(mocks.executePreparedChatTurn).not.toHaveBeenCalled();
  });

  it("atomically releases a zero-success crash and falls back without regenerating", async () => {
    mocks.findPair.mockResolvedValue({
      id: "pair-1",
      userId: "user-1",
      status: "GENERATING",
      slotAVariantId: "control",
      slotBVariantId: "candidate",
      responses: [
        { variantId: "control", status: "FAILED", text: null },
        { variantId: "candidate", status: "FAILED", text: null },
      ],
    });

    await expect(
      tryCreateModelComparisonResponse(runtimeInput()),
    ).resolves.toBeNull();
    expect(mocks.finalizeFailedPair).toHaveBeenCalledWith({
      pairId: "pair-1",
      userId: "user-1",
    });
    expect(mocks.reserveUsage).not.toHaveBeenCalled();
    expect(mocks.executePreparedChatTurn).not.toHaveBeenCalled();
  });

  it("releases an expected participant cadence race and falls back", async () => {
    mocks.createPair.mockRejectedValue(new Error("PARTICIPANT_NOT_ELIGIBLE"));

    await expect(
      tryCreateModelComparisonResponse(runtimeInput()),
    ).resolves.toBeNull();
    expect(mocks.releaseUsage).toHaveBeenCalledWith({
      reservationId: "reservation-1",
      claimToken: "claim-1",
      userId: "user-1",
    });
    expect(mocks.createUIMessageStream).not.toHaveBeenCalled();
    expect(mocks.executePreparedChatTurn).not.toHaveBeenCalled();
  });

  it("releases setup usage but preserves unexpected pair errors", async () => {
    mocks.createPair.mockRejectedValue(new Error("database unavailable"));

    await expect(
      tryCreateModelComparisonResponse(runtimeInput()),
    ).rejects.toThrow("database unavailable");
    expect(mocks.releaseUsage).toHaveBeenCalledTimes(1);
    expect(mocks.executePreparedChatTurn).not.toHaveBeenCalled();
  });

  it("fails an admitted pair when prompt metadata persistence fails", async () => {
    mocks.updatePair.mockRejectedValue(new Error("prompt update failed"));

    await expect(
      tryCreateModelComparisonResponse(runtimeInput()),
    ).rejects.toThrow("prompt update failed");
    expect(mocks.finalizeFailedPair).toHaveBeenCalledWith({
      pairId: "pair-1",
      userId: "user-1",
    });
    expect(mocks.releaseUsage).not.toHaveBeenCalled();
    expect(mocks.executePreparedChatTurn).not.toHaveBeenCalled();
  });

  it("fails the pair when stream setup stops before provider generation", async () => {
    mocks.markExposed.mockRejectedValue(new Error("exposure unavailable"));

    await tryCreateModelComparisonResponse(runtimeInput());
    await expect(executeCapturedStream()).rejects.toThrow(
      "exposure unavailable",
    );

    expect(mocks.finalizeFailedPair).toHaveBeenCalledWith({
      pairId: "pair-1",
      userId: "user-1",
    });
    expect(mocks.executePreparedChatTurn).not.toHaveBeenCalled();
  });

  it("recovers persisted responses after reconciliation fails without regenerating", async () => {
    mocks.finalizePair.mockRejectedValueOnce(new Error("accounting offline"));

    await tryCreateModelComparisonResponse(runtimeInput());
    await expect(executeCapturedStream()).rejects.toThrow("accounting offline");
    expect(mocks.releaseUsage).not.toHaveBeenCalled();

    mocks.findPair.mockResolvedValue({
      id: "pair-1",
      userId: "user-1",
      status: "GENERATING",
      slotAVariantId: "control",
      slotBVariantId: "candidate",
      responses: [
        {
          variantId: "control",
          status: "COMPLETED",
          text: "Controllo",
          modelId: "provider/control",
          provider: "openrouter",
          inputTokens: 10,
          outputTokens: 5,
          reasoningTokens: null,
          costUsd: 0.001,
          generationTimeMs: 100,
        },
        {
          variantId: "candidate",
          status: "COMPLETED",
          text: "Candidato",
          modelId: "provider/candidate",
          provider: "openrouter",
          inputTokens: 10,
          outputTokens: 5,
          reasoningTokens: null,
          costUsd: 0.001,
          generationTimeMs: 100,
        },
      ],
    });

    const retryResponse = await tryCreateModelComparisonResponse(
      runtimeInput(),
    );
    const retryEvents = await executeCapturedStream();

    expect(await retryResponse?.text()).toBe("comparison-stream");
    expect(retryEvents.at(-1)).toMatchObject({
      data: { pairId: "pair-1", status: "ready" },
    });
    expect(mocks.finalizePair).toHaveBeenCalledTimes(2);
    expect(mocks.finalizePair).toHaveBeenLastCalledWith({
      pairId: "pair-1",
      userId: "user-1",
      metrics: expect.objectContaining({
        inputTokens: 20,
        outputTokens: 10,
        costUsd: 0.002,
      }),
    });
    expect(mocks.executePreparedChatTurn).toHaveBeenCalledTimes(2);
    expect(mocks.reserveUsage).toHaveBeenCalledTimes(1);
  });

  it("returns null before preparing a turn when static eligibility fails", async () => {
    mocks.checkStaticEligibility.mockReturnValue(false);

    await expect(
      tryCreateModelComparisonResponse(runtimeInput()),
    ).resolves.toBeNull();
    expect(mocks.getExperimentCandidate).not.toHaveBeenCalled();
    expect(mocks.prepareChatTurn).not.toHaveBeenCalled();
  });

  it("returns null before experiment lookup for an unsafe message", async () => {
    mocks.isCheaplySafeMessage.mockReturnValue(false);

    await expect(
      tryCreateModelComparisonResponse(runtimeInput()),
    ).resolves.toBeNull();
    expect(mocks.getExperimentCandidate).not.toHaveBeenCalled();
  });

  it("returns null before reserving usage when the message has an attributable memory approval", async () => {
    const input = runtimeInput();
    mocks.mightResolvePendingMemoryApproval.mockReturnValue(true);
    mocks.getImmediatelyAttributableApproval.mockResolvedValue({} as never);

    await expect(tryCreateModelComparisonResponse(input)).resolves.toBeNull();

    expect(mocks.getImmediatelyAttributableApproval).toHaveBeenCalledWith({
      userId: input.user.id,
      conversationId: input.conversationThreadId,
      currentUserMessageId: input.sourceMessageId,
    });
    expect(mocks.reserveUsage).not.toHaveBeenCalled();
    expect(mocks.createPair).not.toHaveBeenCalled();
  });

  it("still compares a safe message when no attributable memory approval exists", async () => {
    const input = runtimeInput();
    mocks.mightResolvePendingMemoryApproval.mockReturnValue(true);
    mocks.getImmediatelyAttributableApproval.mockResolvedValue(null);

    await expect(
      tryCreateModelComparisonResponse(input),
    ).resolves.toBeInstanceOf(Response);

    expect(mocks.reserveUsage).toHaveBeenCalledTimes(1);
    expect(mocks.createPair).toHaveBeenCalledTimes(1);
  });

  it("does not inspect memory approvals for guest messages", async () => {
    const input = runtimeInput();
    input.user.isGuest = true;

    await tryCreateModelComparisonResponse(input);

    expect(mocks.mightResolvePendingMemoryApproval).not.toHaveBeenCalled();
    expect(mocks.getImmediatelyAttributableApproval).not.toHaveBeenCalled();
  });

  it("returns null when no active experiment is eligible", async () => {
    mocks.getExperimentCandidate.mockResolvedValue(null);

    await expect(
      tryCreateModelComparisonResponse(runtimeInput()),
    ).resolves.toBeNull();
    expect(mocks.isFlagEnabled).not.toHaveBeenCalled();
  });

  it("fails closed when the experiment feature flag is disabled", async () => {
    mocks.isFlagEnabled.mockResolvedValue(false);

    await expect(
      tryCreateModelComparisonResponse(runtimeInput()),
    ).resolves.toBeNull();
    expect(mocks.prepareChatTurn).not.toHaveBeenCalled();
  });

  it("returns null when prepared capabilities make the turn unsafe", async () => {
    mocks.isSafeTurn.mockReturnValue(false);
    const onPreparedTurnRejected = vi.fn();
    const input = runtimeInput();

    await expect(
      tryCreateModelComparisonResponse({
        ...input,
        onPreparedTurnRejected,
      }),
    ).resolves.toBeNull();
    expect(onPreparedTurnRejected).toHaveBeenCalledWith({
      turnDecision: mocks.preparedTurnDecision,
      capabilityPlannerMode: "agentic",
      classificationLatencyMs: 12,
    });
    expect(mocks.createPair).not.toHaveBeenCalled();
    expect(mocks.releaseUsage).toHaveBeenCalledWith({
      reservationId: "reservation-1",
      claimToken: "claim-1",
      userId: "user-1",
    });
  });

  it("reuses the prepared turn after an expected pair admission race", async () => {
    mocks.createPair.mockRejectedValueOnce(
      new Error("PARTICIPANT_NOT_ELIGIBLE"),
    );
    const onPreparedTurnRejected = vi.fn();
    const input = runtimeInput();

    await expect(
      tryCreateModelComparisonResponse({
        ...input,
        onPreparedTurnRejected,
      }),
    ).resolves.toBeNull();

    expect(mocks.prepareChatTurn).toHaveBeenCalledTimes(1);
    expect(onPreparedTurnRejected).toHaveBeenCalledTimes(1);
    expect(onPreparedTurnRejected).toHaveBeenCalledWith({
      turnDecision: mocks.preparedTurnDecision,
      capabilityPlannerMode: "agentic",
      classificationLatencyMs: 12,
    });
    expect(mocks.executePreparedChatTurn).not.toHaveBeenCalled();
    expect(mocks.releaseUsage).toHaveBeenCalledWith({
      reservationId: "reservation-1",
      claimToken: "claim-1",
      userId: "user-1",
    });
  });
});
