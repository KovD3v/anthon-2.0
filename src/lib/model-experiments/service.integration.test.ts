import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { reserveAiUsage } from "@/lib/rate-limit";
import {
  createChat,
  createMessage,
  createUser,
  resetIntegrationDb,
} from "@/test/integration/factories";
import {
  createModelComparisonPair,
  createModelExperiment,
  finalizeFailedModelComparisonPair,
  finalizeReadyModelComparisonPair,
  transitionModelExperiment,
  updateDraftModelExperiment,
} from "./service";

function experimentInput(key: string) {
  return {
    key,
    name: `Experiment ${key}`,
    posthogFlagKey: `flag-${key}`,
    targetCountry: "IT",
    cooldownHours: 1,
    perUserCap: 2,
    control: {
      modelId: "provider/control",
      generationConfig: { fallbacks: false as const },
    },
    candidate: {
      modelId: "provider/candidate",
      generationConfig: { fallbacks: false as const },
    },
  };
}

describe("integration model experiment serialization", () => {
  beforeEach(async () => {
    await resetIntegrationDb();
  });

  it("commits only one competing lifecycle transition from the same state", async () => {
    const actor = await createUser({ role: "ADMIN" });
    const experiment = await createModelExperiment(
      actor.id,
      experimentInput("concurrent-ready"),
    );

    const results = await Promise.allSettled([
      transitionModelExperiment(experiment.id, actor.id, "READY"),
      transitionModelExperiment(experiment.id, actor.id, "READY"),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({
        message: "INVALID_LIFECYCLE_TRANSITION",
      }),
    });
    await expect(
      prisma.modelExperiment.findUniqueOrThrow({
        where: { id: experiment.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "READY" });
    await expect(
      prisma.modelExperimentAudit.count({
        where: { experimentId: experiment.id, action: "READY" },
      }),
    ).resolves.toBe(1);
  });

  it("never applies a draft edit after the experiment becomes ready", async () => {
    const actor = await createUser({ role: "ADMIN" });
    const input = experimentInput("edit-ready-race");
    const experiment = await createModelExperiment(actor.id, input);

    const [edit, ready] = await Promise.allSettled([
      updateDraftModelExperiment(experiment.id, actor.id, {
        name: "Edited before ready",
      }),
      transitionModelExperiment(experiment.id, actor.id, "READY"),
    ]);

    expect(ready.status).toBe("fulfilled");
    if (edit.status === "rejected") {
      expect(edit.reason).toMatchObject({
        message: "CONFIGURATION_IMMUTABLE",
      });
    }

    const persisted = await prisma.modelExperiment.findUniqueOrThrow({
      where: { id: experiment.id },
      select: {
        status: true,
        name: true,
        audits: {
          orderBy: { createdAt: "asc" },
          select: { action: true },
        },
      },
    });
    expect(persisted.status).toBe("READY");
    expect([input.name, "Edited before ready"]).toContain(persisted.name);
    const readyIndex = persisted.audits.findIndex(
      (audit) => audit.action === "READY",
    );
    expect(readyIndex).toBeGreaterThanOrEqual(1);
    expect(
      persisted.audits
        .slice(readyIndex + 1)
        .some(({ action }) => action === "UPDATED"),
    ).toBe(false);
  });

  it("rechecks active state after a concurrent lifecycle lock commits a pause", async () => {
    const actor = await createUser({ role: "ADMIN" });
    const participantUser = await createUser();
    const experiment = await createModelExperiment(
      actor.id,
      experimentInput("pair-pause-race"),
    );
    await transitionModelExperiment(experiment.id, actor.id, "READY");
    await transitionModelExperiment(experiment.id, actor.id, "ACTIVATE");
    const chat = await createChat(participantUser.id);
    const thread = await prisma.conversationThread.findUniqueOrThrow({
      where: { chatId: chat.id },
      select: { id: true },
    });
    const sourceMessage = await createMessage({
      userId: participantUser.id,
      chatId: chat.id,
      text: "Should this comparison start?",
    });

    let pairOutcomePromise:
      | Promise<
          { status: "fulfilled" } | { status: "rejected"; reason: unknown }
        >
      | undefined;
    await prisma.$transaction(async (tx) => {
      const [{ pid: lifecycleBackendPid }] = await tx.$queryRaw<
        Array<{ pid: number }>
      >`SELECT pg_backend_pid()::integer AS pid`;
      await tx.$queryRaw`
        SELECT "id"
        FROM "ModelExperiment"
        WHERE "id" = ${experiment.id}
        FOR UPDATE
      `;

      pairOutcomePromise = createModelComparisonPair({
        experimentId: experiment.id,
        userId: participantUser.id,
        chatId: chat.id,
        conversationThreadId: thread.id,
        sourceMessageId: sourceMessage.id,
        countryCode: "IT",
      }).then(
        () => ({ status: "fulfilled" as const }),
        (reason: unknown) => ({ status: "rejected" as const, reason }),
      );

      let pairIsWaitingForLifecycle = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const [{ blocked }] = await prisma.$queryRaw<
          Array<{ blocked: boolean }>
        >`
          SELECT EXISTS (
            SELECT 1
            FROM pg_stat_activity
            WHERE ${lifecycleBackendPid} = ANY(pg_blocking_pids(pid))
          ) AS blocked
        `;
        if (blocked) {
          pairIsWaitingForLifecycle = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(pairIsWaitingForLifecycle).toBe(true);

      await tx.modelExperiment.update({
        where: { id: experiment.id },
        data: { status: "PAUSED", pausedAt: new Date() },
      });
    });

    await expect(pairOutcomePromise).resolves.toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ message: "EXPERIMENT_NOT_ACTIVE" }),
    });
    await expect(
      prisma.modelExperimentPair.count({
        where: { experimentId: experiment.id },
      }),
    ).resolves.toBe(0);
  });

  it("atomically charges one request across concurrent ready finalizers", async () => {
    const actor = await createUser({ role: "ADMIN" });
    const participantUser = await createUser();
    const experiment = await createModelExperiment(
      actor.id,
      experimentInput("ready-accounting"),
    );
    await transitionModelExperiment(experiment.id, actor.id, "READY");
    await transitionModelExperiment(experiment.id, actor.id, "ACTIVATE");
    const chat = await createChat(participantUser.id);
    const thread = await prisma.conversationThread.findUniqueOrThrow({
      where: { chatId: chat.id },
      select: { id: true },
    });
    const sourceMessage = await createMessage({
      userId: participantUser.id,
      chatId: chat.id,
      text: "Compare both responses",
    });
    await expect(
      reserveAiUsage({
        userId: participantUser.id,
        requestKey: sourceMessage.id,
        limits: {
          maxRequestsPerDay: 20,
          maxInputTokensPerDay: 100_000,
          maxOutputTokensPerDay: 50_000,
          maxCostPerDay: 5,
          maxContextMessages: 20,
        },
      }),
    ).resolves.toMatchObject({ allowed: true });
    const { pair } = await createModelComparisonPair({
      experimentId: experiment.id,
      userId: participantUser.id,
      chatId: chat.id,
      conversationThreadId: thread.id,
      sourceMessageId: sourceMessage.id,
      countryCode: "IT",
    });
    const metrics = {
      model: "provider/control + provider/candidate",
      inputTokens: 20,
      outputTokens: 10,
      reasoningTokens: null,
      reasoningContent: null,
      toolCalls: null,
      ragUsed: false,
      ragChunksCount: 0,
      costUsd: 0.002,
      generationTimeMs: 200,
      reasoningTimeMs: null,
    };

    await expect(
      Promise.all([
        finalizeReadyModelComparisonPair({
          pairId: pair.id,
          userId: participantUser.id,
          metrics,
        }),
        finalizeReadyModelComparisonPair({
          pairId: pair.id,
          userId: participantUser.id,
          metrics,
        }),
      ]),
    ).resolves.toHaveLength(2);

    await expect(
      prisma.dailyUsage.findFirstOrThrow({
        where: { userId: participantUser.id },
        select: {
          requestCount: true,
          inputTokens: true,
          outputTokens: true,
          totalCostUsd: true,
        },
      }),
    ).resolves.toEqual({
      requestCount: 1,
      inputTokens: 20,
      outputTokens: 10,
      totalCostUsd: 0.002,
    });
    await expect(
      prisma.aiUsageReservation.findUniqueOrThrow({
        where: {
          userId_requestKey: {
            userId: participantUser.id,
            requestKey: sourceMessage.id,
          },
        },
        select: { status: true, assistantMessageId: true },
      }),
    ).resolves.toEqual({
      status: "RECONCILED",
      assistantMessageId: null,
    });
    await expect(
      prisma.modelExperimentPair.findUniqueOrThrow({
        where: { id: pair.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "READY" });
  });

  it("atomically releases the reservation when a recovered pair has no success", async () => {
    const actor = await createUser({ role: "ADMIN" });
    const participantUser = await createUser();
    const experiment = await createModelExperiment(
      actor.id,
      experimentInput("failed-accounting"),
    );
    await transitionModelExperiment(experiment.id, actor.id, "READY");
    await transitionModelExperiment(experiment.id, actor.id, "ACTIVATE");
    const chat = await createChat(participantUser.id);
    const thread = await prisma.conversationThread.findUniqueOrThrow({
      where: { chatId: chat.id },
      select: { id: true },
    });
    const sourceMessage = await createMessage({
      userId: participantUser.id,
      chatId: chat.id,
      text: "Both providers failed",
    });
    await reserveAiUsage({
      userId: participantUser.id,
      requestKey: sourceMessage.id,
      limits: {
        maxRequestsPerDay: 20,
        maxInputTokensPerDay: 100_000,
        maxOutputTokensPerDay: 50_000,
        maxCostPerDay: 5,
        maxContextMessages: 20,
      },
    });
    const { pair } = await createModelComparisonPair({
      experimentId: experiment.id,
      userId: participantUser.id,
      chatId: chat.id,
      conversationThreadId: thread.id,
      sourceMessageId: sourceMessage.id,
      countryCode: "IT",
    });

    await finalizeFailedModelComparisonPair({
      pairId: pair.id,
      userId: participantUser.id,
    });

    await expect(
      prisma.modelExperimentPair.findUniqueOrThrow({
        where: { id: pair.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "FAILED" });
    await expect(
      prisma.aiUsageReservation.findUniqueOrThrow({
        where: {
          userId_requestKey: {
            userId: participantUser.id,
            requestKey: sourceMessage.id,
          },
        },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "RELEASED" });
    await expect(
      prisma.dailyUsage.count({ where: { userId: participantUser.id } }),
    ).resolves.toBe(0);
  });

  it("admits one concurrent pair, honors the cooldown boundary, then enforces the cap", async () => {
    const actor = await createUser({ role: "ADMIN" });
    const participantUser = await createUser();
    const experiment = await createModelExperiment(
      actor.id,
      experimentInput("cadence"),
    );
    await transitionModelExperiment(experiment.id, actor.id, "READY");
    await transitionModelExperiment(experiment.id, actor.id, "ACTIVATE");
    const chat = await createChat(participantUser.id);
    const thread = await prisma.conversationThread.findUniqueOrThrow({
      where: { chatId: chat.id },
      select: { id: true },
    });
    const messages = await Promise.all(
      ["first", "second", "third", "fourth"].map((text) =>
        createMessage({
          userId: participantUser.id,
          chatId: chat.id,
          text,
        }),
      ),
    );
    const now = new Date("2026-07-31T10:00:00Z");
    const inputFor = (sourceMessageId: string, pairNow: Date) => ({
      experimentId: experiment.id,
      userId: participantUser.id,
      chatId: chat.id,
      conversationThreadId: thread.id,
      sourceMessageId,
      countryCode: "it",
      now: pairNow,
      random: () => 0.1,
    });

    const concurrent = await Promise.allSettled([
      createModelComparisonPair(inputFor(messages[0].id, now)),
      createModelComparisonPair(inputFor(messages[1].id, now)),
    ]);

    expect(
      concurrent.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      concurrent.find((result) => result.status === "rejected"),
    ).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ message: "PARTICIPANT_NOT_ELIGIBLE" }),
    });

    const atBoundary = new Date(now.getTime() + 60 * 60 * 1_000);
    await expect(
      createModelComparisonPair(inputFor(messages[2].id, atBoundary)),
    ).resolves.toMatchObject({ noticeRequired: true });
    await expect(
      createModelComparisonPair(
        inputFor(
          messages[3].id,
          new Date(atBoundary.getTime() + 60 * 60 * 1_000),
        ),
      ),
    ).rejects.toThrow("PARTICIPANT_NOT_ELIGIBLE");

    await expect(
      prisma.modelExperimentParticipant.findUniqueOrThrow({
        where: {
          experimentId_userId: {
            experimentId: experiment.id,
            userId: participantUser.id,
          },
        },
        select: { attempts: true, nextEligibleAt: true },
      }),
    ).resolves.toEqual({
      attempts: 2,
      nextEligibleAt: new Date(atBoundary.getTime() + 60 * 60 * 1_000),
    });
    await expect(
      prisma.modelExperimentPair.count({
        where: { experimentId: experiment.id, userId: participantUser.id },
      }),
    ).resolves.toBe(2);
  });
});
