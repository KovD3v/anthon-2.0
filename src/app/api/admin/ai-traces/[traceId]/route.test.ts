import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  traceFindUnique: vi.fn(),
  accessAuditCreate: vi.fn(),
  decryptAiTurnTrace: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireSuperAdmin: mocks.requireSuperAdmin,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    aiTurnTrace: { findUnique: mocks.traceFindUnique },
    aiTraceAccessAudit: { create: mocks.accessAuditCreate },
  },
}));

vi.mock("@/lib/ai/trace", () => ({
  decryptAiTurnTrace: mocks.decryptAiTurnTrace,
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn() }),
  withRequestLogContext: async (
    _request: Request,
    _context: unknown,
    callback: () => Promise<Response>,
  ) => callback(),
}));

import { GET } from "./route";

describe("GET /api/admin/ai-traces/[traceId]", () => {
  beforeEach(() => {
    mocks.requireSuperAdmin.mockReset();
    mocks.traceFindUnique.mockReset();
    mocks.accessAuditCreate.mockReset();
    mocks.decryptAiTurnTrace.mockReset();

    mocks.requireSuperAdmin.mockResolvedValue({
      user: { id: "admin-1" },
      errorResponse: null,
    });
    mocks.traceFindUnique.mockResolvedValue({
      id: "trace-1",
      metadata: {
        turnPlan: {
          capabilities: { memoryDelete: true },
          memoryDeleteTarget: "training_schedule",
        },
      },
      payloadCiphertext: new Uint8Array([1]),
      payloadIv: new Uint8Array([2]),
      payloadTag: new Uint8Array([3]),
    });
    mocks.accessAuditCreate.mockResolvedValue({ id: "audit-1" });
    mocks.decryptAiTurnTrace.mockReturnValue({
      systemPrompt: "BASE\n\nUSER MEMORIES\nDiagnosi privata",
      toolCalls: [
        {
          name: "saveMemory",
          args: { key: "health_condition", value: "Diagnosi privata" },
          result: { approvalId: "approval-1", memoryId: "memory-1" },
        },
      ],
    });
  });

  it("redacts legacy memory payloads from the technical trace response", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/ai-traces/trace-1"),
      { params: Promise.resolve({ traceId: "trace-1" }) },
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain(
      '"toolCalls":[{"name":"saveMemory","status":"completed"}]',
    );
    expect(body).not.toContain("training_schedule");
    expect(body).not.toContain("Diagnosi privata");
    expect(body).not.toContain("approval-1");
    expect(body).not.toContain("memory-1");
  });
});
