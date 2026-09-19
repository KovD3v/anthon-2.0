import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  trackSupportAiUsage: vi.fn(),
  publishToQueue: vi.fn(),
}));
vi.mock("ai", () => ({ generateText: mocks.generateText }));
vi.mock("@/lib/ai/providers/openrouter", () => ({
  SUB_AGENT_MODEL_ID: "summary-test-model",
  subAgentModel: "summary-test-model",
}));
vi.mock("@/lib/ai/providers/openrouter-routing", () => ({
  getOpenRouterProviderOptionsForModel: vi.fn(() => ({})),
}));
vi.mock("@/lib/ai/usage-meter", () => ({
  trackSupportAiUsage: mocks.trackSupportAiUsage,
}));
vi.mock("@/lib/ai/cost-attribution", () => ({
  recordAiOperationFailure: vi.fn(),
}));
vi.mock("@/lib/qstash", () => ({ publishToQueue: mocks.publishToQueue }));

import { prisma } from "@/lib/db";
import {
  createChat,
  createUser,
  resetIntegrationDb,
} from "@/test/integration/factories";
import {
  buildThreadContext,
  processThreadSummaryJob,
  type ThreadSummaryJob,
} from "./thread-context";
import { deleteMessagesWithThreadSummaries } from "./thread-summary-lifecycle";

const createdAt = new Date("2026-08-14T10:00:00.000Z");
async function fixture(count = 12) {
  const owner = await createUser();
  const chat = await createChat(owner.id);
  const thread = await prisma.conversationThread.findUniqueOrThrow({
    where: { chatId: chat.id },
  });
  const ids = Array.from(
    { length: count },
    (_, index) => `${thread.id}-message-${String(index).padStart(4, "0")}`,
  );
  await prisma.message.createMany({
    data: ids.map((id, index) => ({
      id,
      userId: owner.id,
      chatId: chat.id,
      conversationThreadId: thread.id,
      role: index % 2 ? ("ASSISTANT" as const) : ("USER" as const),
      direction: index % 2 ? ("OUTBOUND" as const) : ("INBOUND" as const),
      channel: "WEB" as const,
      type: "TEXT" as const,
      createdAt,
      parts: [{ type: "text", text: `message ${index}` }],
    })),
  });
  return {
    owner,
    chat,
    thread,
    ids,
    job: { conversationThreadId: thread.id, userId: owner.id },
  };
}
const result = (text: string) => ({
  text,
  usage: { inputTokens: 20, outputTokens: 10 },
  providerMetadata: {},
});
function holdModel() {
  const releases: Array<(value: ReturnType<typeof result>) => void> = [];
  mocks.generateText.mockImplementation(
    () =>
      new Promise((resolve) => {
        releases.push(resolve);
      }),
  );
  return releases;
}

describe("integration bounded thread summaries", () => {
  beforeEach(async () => {
    await resetIntegrationDb();
    mocks.generateText.mockResolvedValue(result("Summary"));
    mocks.trackSupportAiUsage.mockResolvedValue(undefined);
    mocks.publishToQueue.mockResolvedValue(undefined);
  });

  it.each([false, true])(
    "only commits the winning concurrent summary (existing=%s)",
    async (existing) => {
      const { job, ids, thread } = await fixture(existing ? 14 : 12);
      if (existing) {
        await prisma.conversationThreadSummary.create({
          data: {
            conversationThreadId: thread.id,
            summary: "Previous",
            throughMessageId: ids[1],
            throughMessageCreatedAt: createdAt,
            version: 7,
          },
        });
      }
      const releases = holdModel();
      const first = processThreadSummaryJob(job);
      const second = processThreadSummaryJob(job);
      await vi.waitFor(() => expect(releases).toHaveLength(2), {
        timeout: 10_000,
      });
      releases[1](result("Winning summary"));
      await vi.waitFor(
        async () =>
          expect(
            (
              await prisma.conversationThreadSummary.findUnique({
                where: { conversationThreadId: thread.id },
              })
            )?.summary,
          ).toBe("Winning summary"),
        { timeout: 10_000 },
      );
      releases[0](result("Stale summary"));
      expect((await Promise.all([first, second])).sort()).toEqual([
        "stale",
        "updated",
      ]);
      expect(
        await prisma.conversationThreadSummary.findUnique({
          where: { conversationThreadId: thread.id },
        }),
      ).toMatchObject({
        summary: "Winning summary",
        version: existing ? 8 : 1,
        throughMessageId: ids.at(-1),
      });
      expect(mocks.trackSupportAiUsage).toHaveBeenCalledTimes(2);
    },
  );

  it("refuses sources deleted during generation and invalidates an already committed summary", async () => {
    const { job, ids, thread } = await fixture();
    const releases = holdModel();
    const pending = processThreadSummaryJob(job);
    await vi.waitFor(() => expect(releases).toHaveLength(1), {
      timeout: 10_000,
    });
    await prisma.$transaction((tx) =>
      deleteMessagesWithThreadSummaries(tx, { id: { in: ids } }),
    );
    releases[0](result("Deleted source text"));
    expect(await pending).toBe("stale");
    expect(
      await prisma.conversationThreadSummary.count({
        where: { conversationThreadId: thread.id },
      }),
    ).toBe(0);

    const fresh = await fixture();
    mocks.generateText.mockResolvedValue(result("Committed summary"));
    expect(await processThreadSummaryJob(fresh.job)).toBe("updated");
    await prisma.$transaction((tx) =>
      deleteMessagesWithThreadSummaries(tx, {
        id: fresh.ids[0],
        userId: fresh.owner.id,
      }),
    );
    expect(
      await prisma.conversationThreadSummary.count({
        where: { conversationThreadId: fresh.thread.id },
      }),
    ).toBe(0);
  });

  it("uses tied timestamp checkpoints and drains the final small batch without skipping or repeating turns", async () => {
    const { job, ids, thread } = await fixture(86);
    const queued: ThreadSummaryJob[] = [];
    mocks.publishToQueue.mockImplementation(async (_endpoint, payload) => {
      queued.push(payload);
    });
    await processThreadSummaryJob(job);
    let deliveries = 0;
    for (
      let next = queued.shift();
      next && deliveries < 5;
      next = queued.shift()
    ) {
      deliveries++;
      await processThreadSummaryJob(next);
    }
    expect(deliveries).toBe(2);
    expect(queued).toHaveLength(0);
    expect(mocks.generateText).toHaveBeenCalledTimes(3);
    expect(
      await prisma.conversationThreadSummary.findUnique({
        where: { conversationThreadId: thread.id },
      }),
    ).toMatchObject({
      version: 3,
      throughMessageId: ids[85],
      throughMessageCreatedAt: createdAt,
    });
    for (let index = 0; index < 86; index++) {
      const transcript = mocks.generateText.mock.calls
        .map((call) => call[0].prompt.split("Nuovi turni:\n")[1])
        .join("\n");
      expect(
        transcript
          .split("\n")
          .filter((line) => line.endsWith(`: message ${index}`)),
      ).toHaveLength(1);
    }
  });

  it("includes an earlier tied checkpoint and protects owner/deleted thread boundaries", async () => {
    const { job, ids, thread, chat } = await fixture(14);
    await prisma.conversationThreadSummary.create({
      data: {
        conversationThreadId: thread.id,
        summary: "Earlier context",
        throughMessageId: ids[1],
        throughMessageCreatedAt: createdAt,
      },
    });
    const context = await buildThreadContext(thread.id, {
      includeSummary: true,
      maxRawTurns: 1,
      maxRawChars: 1_000,
    });
    expect(context.summaryMessageId).toBe(ids[1]);
    expect(context.includedMessageIds).toEqual(ids.slice(-2));
    const other = await createUser();
    expect(await processThreadSummaryJob({ ...job, userId: other.id })).toBe(
      "unavailable",
    );
    await prisma.chat.update({
      where: { id: chat.id },
      data: { deletedAt: new Date() },
    });
    expect(await processThreadSummaryJob(job)).toBe("unavailable");
    expect(
      await buildThreadContext(thread.id, {
        includeSummary: true,
        maxRawTurns: 1,
        maxRawChars: 1_000,
      }),
    ).toMatchObject({ messages: [], includedMessageIds: [] });
    expect(mocks.generateText).not.toHaveBeenCalled();
  });
});
