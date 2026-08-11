import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    conversationThread: { findMany: vi.fn() },
    $disconnect: vi.fn(),
  },
}));
vi.mock("@/lib/ai/conversation-index", () => ({
  indexConversationWindow: vi.fn(),
}));

describe("conversation recall backfill", () => {
  it("rejects ambiguous mode flags", async () => {
    const { parseBackfillArgs } = await import(
      "./backfill-conversation-recall"
    );
    expect(() => parseBackfillArgs([])).toThrow();
    expect(() => parseBackfillArgs(["--dry-run", "--apply"])).toThrow();
  });

  it("dry-runs deterministically without indexing", async () => {
    const { runConversationRecallBackfill } = await import(
      "./backfill-conversation-recall"
    );
    const listThreads = vi.fn().mockResolvedValue([
      { id: "thread-a", userId: "user-1", messages: [{ id: "m1" }] },
      { id: "thread-b", userId: "user-1", messages: [{ id: "m2" }] },
    ]);
    const indexWindow = vi.fn();

    const result = await runConversationRecallBackfill(
      { mode: "dry-run", batchSize: 50 },
      { listThreads, indexWindow },
    );

    expect(result).toEqual({
      threads: 2,
      windows: 2,
      failures: 0,
      checkpoint: "thread-b",
    });
    expect(indexWindow).not.toHaveBeenCalled();
    expect(listThreads).toHaveBeenCalledWith({
      afterThreadId: undefined,
      batchSize: 50,
    });
  });

  it("continues after a failed thread and reports a resumable checkpoint", async () => {
    const { runConversationRecallBackfill } = await import(
      "./backfill-conversation-recall"
    );
    const listThreads = vi.fn().mockResolvedValue([
      { id: "thread-a", userId: "user-1", messages: [{ id: "m1" }] },
      { id: "thread-b", userId: "user-2", messages: [{ id: "m2" }] },
    ]);
    const indexWindow = vi
      .fn()
      .mockRejectedValueOnce(new Error("provider"))
      .mockResolvedValue({ status: "indexed" });

    const result = await runConversationRecallBackfill(
      { mode: "apply", batchSize: 2, afterThreadId: "thread-0" },
      { listThreads, indexWindow },
    );

    expect(result.failures).toBe(1);
    expect(result.checkpoint).toBe("thread-b");
    expect(indexWindow).toHaveBeenCalledTimes(2);
  });
});
