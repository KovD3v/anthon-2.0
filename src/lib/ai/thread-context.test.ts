import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  summaryFindUnique: vi.fn(),
  messageFindMany: vi.fn(),
  generateText: vi.fn(),
  trackSupportAiUsage: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    conversationThreadSummary: {
      findUnique: mocks.summaryFindUnique,
    },
    message: {
      findMany: mocks.messageFindMany,
    },
  },
}));

vi.mock("@/lib/ai/providers/openrouter", () => ({
  SUB_AGENT_MODEL_ID: "sub-agent-model",
  subAgentModel: "sub-agent",
}));

vi.mock("@/lib/ai/providers/openrouter-routing", () => ({
  getOpenRouterProviderOptionsForModel: vi.fn(() => ({})),
}));

vi.mock("@/lib/ai/usage-meter", () => ({
  trackSupportAiUsage: mocks.trackSupportAiUsage,
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

import { buildThreadContext } from "./thread-context";

describe("ai/thread-context", () => {
  beforeEach(() => {
    mocks.summaryFindUnique.mockReset();
    mocks.messageFindMany.mockReset();
    mocks.summaryFindUnique.mockResolvedValue(null);
  });

  it("loads only the message fields needed to build model context", async () => {
    const userCreatedAt = new Date("2026-08-14T10:00:00.000Z");
    const assistantCreatedAt = new Date("2026-08-14T10:01:00.000Z");
    mocks.messageFindMany.mockResolvedValue([
      {
        id: "assistant-1",
        role: "ASSISTANT",
        parts: [{ type: "text", text: "Certo." }],
        createdAt: assistantCreatedAt,
      },
      {
        id: "user-1",
        role: "USER",
        parts: [{ type: "text", text: "Ciao" }],
        createdAt: userCreatedAt,
      },
    ]);

    await buildThreadContext("thread-1", {
      includeSummary: false,
      maxRawTurns: 1,
      maxRawChars: 1_000,
    });

    expect(mocks.messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          role: true,
          parts: true,
          createdAt: true,
        },
      }),
    );
  });
});
