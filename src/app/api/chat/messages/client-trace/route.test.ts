import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveAuthenticatedClerkId: vi.fn(),
  userFindUnique: vi.fn(),
  persistClientTrace: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/auth-identity", () => ({
  resolveAuthenticatedClerkId: mocks.resolveAuthenticatedClerkId,
}));

vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: mocks.userFindUnique } },
}));

vi.mock("@/lib/response-profiler/client-trace-persistence", () => ({
  persistClientTrace: mocks.persistClientTrace,
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: mocks.error }),
}));

import { MAX_TRACE_BYTES } from "@/lib/response-profiler/contracts";
import { PUT } from "./route";

const trace = {
  version: 1,
  status: "completed",
  milestones: {
    requestStartedMs: 0,
    streamOpenedMs: 10,
    firstChunkReceivedMs: 20,
    firstTextDeltaReceivedMs: 30,
    firstDomTextMs: 40,
    firstVisibleFrameMs: 50,
    streamCompletedMs: 60,
    persistedMessageResolvedMs: 70,
  },
};

function request(body: unknown, headers?: HeadersInit) {
  return new Request("http://localhost/api/chat/messages/client-trace", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const validBody = {
  chatId: "chat-1",
  clientMessageId: "client-user-1",
  trace,
};

describe("PUT /api/chat/messages/client-trace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuthenticatedClerkId.mockResolvedValue("clerk-1");
    mocks.userFindUnique.mockResolvedValue({ id: "user-1" });
    mocks.persistClientTrace.mockResolvedValue({ status: "stored" });
  });

  it("returns 401 before reading an unauthenticated trace", async () => {
    mocks.resolveAuthenticatedClerkId.mockResolvedValue(null);
    const response = await PUT(request(validBody));
    expect(response.status).toBe(401);
    expect(mocks.persistClientTrace).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{"],
    ["unknown top-level key", { ...validBody, assistantMessageId: "nope" }],
    [
      "invalid milestone ordering",
      {
        ...validBody,
        trace: {
          version: 1,
          status: "partial",
          milestones: { requestStartedMs: 0, firstDomTextMs: 20 },
        },
      },
    ],
  ])("returns 400 for %s", async (_label, body) => {
    const response = await PUT(request(body));
    expect(response.status).toBe(400);
    expect(mocks.persistClientTrace).not.toHaveBeenCalled();
  });

  it("rejects declared oversized bodies before reading them", async () => {
    const response = await PUT(
      request(validBody, { "Content-Length": String(MAX_TRACE_BYTES + 1) }),
    );
    expect(response.status).toBe(400);
    expect(mocks.persistClientTrace).not.toHaveBeenCalled();
  });

  it("rejects an oversized UTF-8 body", async () => {
    const response = await PUT(
      request(`{"padding":"${"è".repeat(MAX_TRACE_BYTES)}"}`),
    );
    expect(response.status).toBe(400);
  });

  it("uses the internal owner id and returns 204 for stored or unchanged", async () => {
    for (const status of ["stored", "unchanged"]) {
      mocks.persistClientTrace.mockResolvedValueOnce({ status });
      const response = await PUT(request(validBody));
      expect(response.status).toBe(204);
    }
    expect(mocks.persistClientTrace).toHaveBeenCalledWith({
      userId: "user-1",
      ...validBody,
    });
  });

  it.each([
    ["forbidden", 403, undefined],
    ["not_found", 404, undefined],
    ["pending", 409, true],
    ["conflict", 409, false],
  ] as const)("maps %s precisely", async (status, expectedCode, retryable) => {
    mocks.persistClientTrace.mockResolvedValue({ status });
    const response = await PUT(request(validBody));
    expect(response.status).toBe(expectedCode);
    if (retryable !== undefined) {
      await expect(response.json()).resolves.toMatchObject({ retryable });
    }
  });
});
