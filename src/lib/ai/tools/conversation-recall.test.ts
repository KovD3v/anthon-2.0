import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tool: vi.fn((definition) => definition),
  search: vi.fn(),
  expand: vi.fn(),
}));
vi.mock("ai", () => ({ tool: mocks.tool }));
vi.mock("@/lib/ai/conversation-recall", () => ({
  searchPastConversations: mocks.search,
  expandConversationEvidence: mocks.expand,
}));

type ToolDefinition = { execute: (input: Record<string, unknown>) => Promise<unknown> };

describe("conversation recall tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search.mockResolvedValue({
      packets: [{ id: "evidence-1", excerpts: [], summary: "finale" }],
      scope: "current_thread",
      degraded: false,
      elapsedMs: 20,
    });
    mocks.expand.mockResolvedValue({ id: "evidence-1", excerpts: [] });
  });

  it("binds ownership server-side and downgrades forbidden cross-channel search", async () => {
    const { createConversationRecallTools } = await import("./conversation-recall");
    const allowed = new Set<string>();
    const tools = createConversationRecallTools({
      userId: "user-1",
      conversationThreadId: "thread-1",
      allowCrossChannel: false,
      allowedEvidenceIds: allowed,
    });

    await (tools.searchPastConversations as unknown as ToolDefinition).execute({
      query: "finale",
      scope: "all_channels",
      userId: "attacker",
      limit: 99,
    });

    expect(mocks.search).toHaveBeenCalledWith({
      userId: "user-1",
      conversationThreadId: "thread-1",
      query: "finale",
      scope: "current_thread",
    });
    expect(allowed).toContain("evidence-1");
  });

  it("expands only evidence returned in the same turn", async () => {
    const { createConversationRecallTools } = await import("./conversation-recall");
    const tools = createConversationRecallTools({
      userId: "user-1",
      conversationThreadId: "thread-1",
      allowCrossChannel: true,
      allowedEvidenceIds: new Set(),
    });
    const expand = tools.expandConversationEvidence as unknown as ToolDefinition;

    expect(await expand.execute({ evidenceId: "raw-chunk-id" })).toEqual({ status: "not_allowed" });
    expect(mocks.expand).not.toHaveBeenCalled();
  });
});
