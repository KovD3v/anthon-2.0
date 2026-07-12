import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  streamChat: vi.fn(),
  userCreate: vi.fn(),
  userDeleteMany: vi.fn(),
  chatCreate: vi.fn(),
  conversationThreadCreate: vi.fn(),
  messageCreate: vi.fn(),
  persistAssistantOutput: vi.fn(),
}));

vi.mock("@/lib/ai/orchestrator", () => ({
  streamChat: mocks.streamChat,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      create: mocks.userCreate,
      deleteMany: mocks.userDeleteMany,
    },
    chat: {
      create: mocks.chatCreate,
    },
    conversationThread: {
      create: mocks.conversationThreadCreate,
    },
    message: {
      create: mocks.messageCreate,
    },
  },
}));

vi.mock("@/lib/channel-flow/persistence", () => ({
  persistAssistantOutput: mocks.persistAssistantOutput,
}));

import {
  createDatabaseBackedRealityExecutor,
  createStreamChatRealityExecutor,
} from "./reality";

describe("benchmark/reality orchestrator executor", () => {
  beforeEach(() => {
    mocks.streamChat.mockReset();
    mocks.userCreate.mockReset();
    mocks.userDeleteMany.mockReset();
    mocks.chatCreate.mockReset();
    mocks.conversationThreadCreate.mockReset();
    mocks.messageCreate.mockReset();
    mocks.persistAssistantOutput.mockReset();
  });

  it("runs a reality turn through streamChat with an explicit benchmark model", async () => {
    const metrics = {
      model: "candidate/model",
      inputTokens: 12,
      outputTokens: 18,
      reasoningTokens: null,
      reasoningContent: null,
      toolCalls: null,
      ragUsed: false,
      ragChunksCount: 0,
      costUsd: 0.002,
      generationTimeMs: 900,
      reasoningTimeMs: null,
    };

    mocks.streamChat.mockImplementation(async (input) => ({
      textStream: (async function* () {
        await input.onFinish?.({ text: "Risposta concreta", metrics });
        yield "Risposta ";
        yield "concreta";
      })(),
    }));

    const executor = createStreamChatRealityExecutor({
      userId: "benchmark-user",
      chatId: "benchmark-chat",
      planId: "trial",
      userRole: "USER",
      subscriptionStatus: "TRIAL",
    });

    const result = await executor({
      modelId: "candidate/model",
      scenario: {
        id: "scenario",
        title: "Scenario",
        persona: "Atleta",
        tags: ["memory"],
        setup: {},
        turns: [],
      },
      turn: {
        userMessage: "Mi serve un piano",
        requiredSignals: ["piano"],
      },
      turnIndex: 0,
      transcript: [],
    });

    expect(mocks.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "benchmark-user",
        chatId: "benchmark-chat",
        userMessage: "Mi serve un piano",
        planId: "trial",
        benchmarkModelId: "candidate/model",
        memoryEnabled: true,
        responseMode: "text",
      }),
    );
    expect(result).toMatchObject({
      text: "Risposta concreta",
      metrics,
      metadata: { executor: "streamChat", turnIndex: 0 },
    });
  });

  it("creates isolated DB-backed scenario state and persists turns for orchestrator history", async () => {
    const metrics = {
      model: "candidate/model",
      inputTokens: 12,
      outputTokens: 18,
      reasoningTokens: null,
      reasoningContent: null,
      toolCalls: null,
      ragUsed: false,
      ragChunksCount: 0,
      costUsd: 0.002,
      generationTimeMs: 900,
      reasoningTimeMs: null,
    };

    mocks.userCreate.mockResolvedValue({ id: "user-db" });
    mocks.chatCreate.mockResolvedValue({ id: "chat-db" });
    mocks.conversationThreadCreate.mockResolvedValue({ id: "thread-db" });
    mocks.messageCreate.mockResolvedValue({ id: "message-db" });
    mocks.persistAssistantOutput.mockResolvedValue({ id: "assistant-db" });
    mocks.userDeleteMany.mockResolvedValue({ count: 1 });
    mocks.streamChat.mockImplementation(async (input) => ({
      textStream: (async function* () {
        await input.onFinish?.({ text: "Risposta concreta", metrics });
        yield "Risposta concreta";
      })(),
    }));

    const { executor, cleanup } = createDatabaseBackedRealityExecutor({
      runLabel: "prelaunch-test",
      planId: "trial",
      userRole: "USER",
      subscriptionStatus: "TRIAL",
    });
    const scenario = {
      id: "scenario",
      title: "Scenario",
      persona: "Atleta",
      tags: ["memory"],
      setup: {
        profile: { name: "Luca", sport: "tennis", role: "atleta" },
        preferences: { language: "it", tone: "direct" },
        memories: [{ key: "goal", value: "partita domenica" }],
      },
      turns: [],
    };

    await executor({
      modelId: "candidate/model",
      scenario,
      turn: { userMessage: "Primo turno", requiredSignals: ["piano"] },
      turnIndex: 0,
      transcript: [],
    });
    await executor({
      modelId: "candidate/model",
      scenario,
      turn: { userMessage: "Secondo turno", requiredSignals: ["piano"] },
      turnIndex: 1,
      transcript: [],
    });
    await cleanup();

    expect(mocks.userCreate).toHaveBeenCalledTimes(1);
    expect(mocks.userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          profile: expect.objectContaining({
            create: expect.objectContaining({
              name: "Luca",
              sport: "tennis",
              notes: expect.stringContaining("role: atleta"),
            }),
          }),
          memories: {
            create: [
              {
                key: "goal",
                value: "partita domenica",
                category: "other",
              },
            ],
          },
        }),
      }),
    );
    expect(mocks.chatCreate).toHaveBeenCalledTimes(1);
    expect(mocks.conversationThreadCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-db",
          chatId: "chat-db",
          channel: "WEB",
        }),
      }),
    );
    expect(mocks.messageCreate).toHaveBeenCalledTimes(2);
    expect(mocks.streamChat).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-db",
        chatId: "chat-db",
        conversationThreadId: "thread-db",
        benchmarkModelId: "candidate/model",
      }),
    );
    expect(mocks.persistAssistantOutput).toHaveBeenCalledTimes(2);
    expect(mocks.userDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["user-db"] } },
    });
  });
});
