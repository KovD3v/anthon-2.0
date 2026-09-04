import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  messageFindMany: vi.fn(),
  resolveEffectiveEntitlements: vi.fn(),
  consolidateTurnMemory: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    message: { findMany: mocks.messageFindMany },
  },
}));
vi.mock("@/lib/organizations/entitlements", () => ({
  resolveEffectiveEntitlements: mocks.resolveEffectiveEntitlements,
}));
vi.mock("@/lib/ai/memory-consolidator", () => ({
  consolidateTurnMemory: mocks.consolidateTurnMemory,
}));

import { PlanResolutionError } from "@/lib/plans";
import { backfillLinkedWhatsAppMemories } from "./memory-backfill";

function turn(id: string) {
  return {
    id,
    conversationThreadId: "thread-1",
    parts: [{ type: "text", text: `Informazione durevole ${id}` }],
    generatedResponse: {
      parts: [{ type: "text", text: `Risposta ${id}` }],
      deletedAt: null,
    },
  };
}

describe("WhatsApp linked memory backfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      isGuest: false,
      role: "USER",
      subscription: { status: "ACTIVE", planId: "basic" },
    });
    mocks.resolveEffectiveEntitlements.mockResolvedValue({ plan: "BASIC" });
    mocks.messageFindMany.mockResolvedValue([
      turn("newest"),
      turn("middle"),
      turn("oldest"),
      turn("earliest"),
    ]);
    mocks.consolidateTurnMemory.mockResolvedValue({
      considered: 1,
      persisted: 1,
      approvalsCreated: 0,
      rejected: 0,
    });
  });

  it("imports at most three recent completed turns in chronological order", async () => {
    await expect(
      backfillLinkedWhatsAppMemories({
        userId: "user-1",
        externalThreadId: "39333111222",
        before: new Date("2026-09-04T18:00:00.000Z"),
      }),
    ).resolves.toEqual({
      status: "completed",
      turnsConsidered: 4,
      persisted: 3,
      approvalsCreated: 0,
    });

    expect(mocks.messageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          channel: "WHATSAPP",
          externalInboundStatus: "COMPLETED",
          createdAt: { lte: new Date("2026-09-04T18:00:00.000Z") },
          conversationThread: { externalThreadId: "39333111222" },
        }),
        take: 12,
      }),
    );
    expect(mocks.consolidateTurnMemory).toHaveBeenCalledTimes(3);
    expect(
      mocks.consolidateTurnMemory.mock.calls.map(
        ([input]) => input.inboundMessageId,
      ),
    ).toEqual(["earliest", "oldest", "middle"]);
    expect(mocks.consolidateTurnMemory).toHaveBeenCalledWith(
      expect.objectContaining({ maxCandidates: 1, memoryOnly: true }),
    );
  });

  it("does not inspect history without paid or organization access", async () => {
    mocks.resolveEffectiveEntitlements.mockRejectedValue(
      new PlanResolutionError("PAID_ACCESS_REQUIRED"),
    );

    await expect(
      backfillLinkedWhatsAppMemories({
        userId: "user-1",
        externalThreadId: "39333111222",
        before: new Date("2026-09-04T18:00:00.000Z"),
      }),
    ).resolves.toEqual({ status: "ineligible" });
    expect(mocks.messageFindMany).not.toHaveBeenCalled();
    expect(mocks.consolidateTurnMemory).not.toHaveBeenCalled();
  });
});
