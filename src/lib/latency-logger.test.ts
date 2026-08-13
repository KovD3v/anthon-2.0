import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    info: mocks.info,
  }),
}));

describe("LatencyLogger", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.info.mockReset();
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.ENABLE_LATENCY_LOGS;
  });

  it("does not emit measurements in development by default", async () => {
    const { LatencyLogger } = await import("./latency-logger");

    await LatencyLogger.measure("Chat setup", async () => undefined);

    expect(mocks.info).not.toHaveBeenCalled();
  });

  it("does not emit measurements even when explicitly enabled", async () => {
    vi.stubEnv("ENABLE_LATENCY_LOGS", "true");
    const { LatencyLogger } = await import("./latency-logger");

    await LatencyLogger.measure("Chat setup", async () => undefined);

    expect(mocks.info).not.toHaveBeenCalled();
  });
});
