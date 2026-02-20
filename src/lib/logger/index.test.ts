import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLogger,
  getLogContext,
  withLogContext,
  withRequestLogContext,
} from "./index";

const ORIGINAL_ENV = { ...process.env };

function stripAnsi(input: string): string {
  let output = "";
  let index = 0;

  while (index < input.length) {
    if (input[index] === "\u001B" && input[index + 1] === "[") {
      index += 2;
      while (index < input.length && input[index] !== "m") {
        index += 1;
      }
      if (index < input.length) {
        index += 1;
      }
      continue;
    }

    output += input[index];
    index += 1;
  }

  return output;
}

describe("logger/index", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      NODE_ENV: "development",
      APP_LOG_FORMAT: "json",
    };
    delete process.env.APP_LOG_LEVEL;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...ORIGINAL_ENV };
  });

  it("emits structured info logs in development", () => {
    const logger = createLogger("ai");
    logger.info("ai.stream.started", "AI streaming started", {
      chatId: "chat-1",
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(logSpy.mock.calls[0][0])) as {
      level: string;
      domain: string;
      event: string;
      message: string;
      data: { chatId: string };
    };
    expect(payload.level).toBe("info");
    expect(payload.domain).toBe("ai");
    expect(payload.event).toBe("ai.stream.started");
    expect(payload.message).toBe("AI streaming started");
    expect(payload.data.chatId).toBe("chat-1");
  });

  it("only emits error logs in production by default", () => {
    vi.stubEnv("NODE_ENV", "production");
    const logger = createLogger("usage");
    logger.info("usage.fetched", "Fetched usage");
    logger.error("usage.failed", "Failed to fetch usage");

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("adds request context and propagates it inside callback", async () => {
    const logger = createLogger("auth");
    const request = new Request("http://localhost/api/usage", {
      method: "GET",
      headers: {
        "x-request-id": "req-123",
      },
    });

    await withRequestLogContext(
      request,
      { route: "/api/usage", channel: "WEB" },
      async () => {
        logger.info("auth.authenticated", "User authenticated");
        await Promise.resolve();
        logger.warn("auth.warning", "Auth warning");
      },
    );

    const firstPayload = JSON.parse(String(logSpy.mock.calls[0][0])) as {
      context: {
        requestId: string;
        route: string;
        method: string;
        channel: string;
      };
    };
    const secondPayload = JSON.parse(String(warnSpy.mock.calls[0][0])) as {
      context: {
        requestId: string;
      };
    };

    expect(firstPayload.context.requestId).toBe("req-123");
    expect(firstPayload.context.route).toBe("/api/usage");
    expect(firstPayload.context.method).toBe("GET");
    expect(firstPayload.context.channel).toBe("WEB");
    expect(secondPayload.context.requestId).toBe("req-123");
  });

  it("supports withLogContext for nested operations", () => {
    const logger = createLogger("organizations");

    withLogContext({ requestId: "nested-req", route: "/org" }, () => {
      logger.info("org.updated", "Organization updated", {
        email: "owner@example.com",
      });
      const context = getLogContext();
      expect(context.requestId).toBe("nested-req");
      expect(context.route).toBe("/org");
    });

    const payload = JSON.parse(String(logSpy.mock.calls[0][0])) as {
      data: {
        email: string;
      };
    };
    expect(payload.data.email).toBe("ow***om");
  });

  it("prints pretty format in development by default", () => {
    delete process.env.APP_LOG_FORMAT;
    const logger = createLogger("usage");

    logger.info("usage.snapshot", "Fetched usage snapshot", {
      inputTokens: 123,
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = stripAnsi(String(logSpy.mock.calls[0][0]));
    expect(line).toContain("INFO");
    expect(line).toContain("usage:usage.snapshot");
    expect(line).toContain("Fetched usage snapshot");
    expect(line).toContain("inputTokens=123");
  });
});
