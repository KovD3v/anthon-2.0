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

import { POST } from "./route";

describe("POST /api/admin/ai-traces/[traceId]", () => {
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
      expiresAt: new Date(Date.now() + 60_000),
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
    const response = await POST(
      new Request("http://localhost/api/admin/ai-traces/trace-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "DEBUGGING",
          reason: "Investigate provider failure",
          caseId: "INC-123",
        }),
      }),
      { params: Promise.resolve({ traceId: "trace-1" }) },
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toContain(
      '"toolCalls":[{"name":"saveMemory","status":"completed"}]',
    );
    expect(body).not.toContain("training_schedule");
    expect(body).not.toContain("Diagnosi privata");
    expect(body).not.toContain("approval-1");
    expect(body).not.toContain("memory-1");
    expect(mocks.accessAuditCreate).toHaveBeenCalledWith({
      data: {
        traceId: "trace-1",
        actorUserId: "admin-1",
        action: "READ_CONTENT",
        purpose: "DEBUGGING",
        reason: "Investigate provider failure",
        caseId: "INC-123",
      },
    });
  });

  it.each([
    ["purpose", { reason: "Investigate provider failure", caseId: "INC-123" }],
    ["reason", { purpose: "DEBUGGING", caseId: "INC-123" }],
    [
      "case reference",
      { purpose: "DEBUGGING", reason: "Investigate provider failure" },
    ],
  ])("requires a %s before decryption", async (_field, body) => {
    const response = await POST(
      new Request("http://localhost/api/admin/ai-traces/trace-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ traceId: "trace-1" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.traceFindUnique).not.toHaveBeenCalled();
    expect(mocks.accessAuditCreate).not.toHaveBeenCalled();
    expect(mocks.decryptAiTurnTrace).not.toHaveBeenCalled();
  });

  it("rejects quality review until an approved project mechanism exists", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/ai-traces/trace-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "APPROVED_QUALITY_REVIEW",
          reason: "Review approved sample",
          caseId: "QR-123",
        }),
      }),
      { params: Promise.resolve({ traceId: "trace-1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Approved quality review projects are not available",
    });
    expect(mocks.traceFindUnique).not.toHaveBeenCalled();
    expect(mocks.decryptAiTurnTrace).not.toHaveBeenCalled();
  });

  it("does not decrypt an expired trace", async () => {
    mocks.traceFindUnique.mockResolvedValueOnce({
      id: "trace-1",
      expiresAt: new Date(Date.now() - 1),
      payloadCiphertext: new Uint8Array([1]),
      payloadIv: new Uint8Array([2]),
      payloadTag: new Uint8Array([3]),
    });

    const response = await POST(
      new Request("http://localhost/api/admin/ai-traces/trace-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "DEBUGGING",
          reason: "Investigate provider failure",
          caseId: "INC-123",
        }),
      }),
      { params: Promise.resolve({ traceId: "trace-1" }) },
    );

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: "Trace expired" });
    expect(mocks.accessAuditCreate).not.toHaveBeenCalled();
    expect(mocks.decryptAiTurnTrace).not.toHaveBeenCalled();
  });
});
