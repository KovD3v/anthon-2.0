import { describe, expect, it } from "vitest";
import { redactForLogs } from "./redact";

describe("logger/redact", () => {
  it("redacts sensitive fields", () => {
    const output = redactForLogs({
      email: "hello@example.com",
      ownerEmail: "owner@example.com",
      token: "abcdef123456",
      nested: {
        secret: "super-secret",
      },
      ok: "safe",
    }) as Record<string, unknown>;

    expect(output.email).toBe("he***om");
    expect(output.ownerEmail).toBe("ow***om");
    expect(output.token).toBe("ab***56");
    expect(output.nested).toEqual({ secret: "su***et" });
    expect(output.ok).toBe("safe");
  });

  it("does not redact token counters", () => {
    const output = redactForLogs({
      inputTokens: 123,
      outputTokens: 456,
      maxInputTokensPerDay: 1000,
    }) as Record<string, unknown>;

    expect(output.inputTokens).toBe(123);
    expect(output.outputTokens).toBe(456);
    expect(output.maxInputTokensPerDay).toBe(1000);
  });

  it("truncates very long strings", () => {
    const long = "x".repeat(1000);
    const output = redactForLogs({ message: long }) as Record<string, string>;
    expect(output.message.length).toBeLessThan(long.length);
    expect(output.message.includes("[truncated]")).toBe(true);
  });

  it("handles circular references safely", () => {
    const input: { name: string; self?: unknown } = { name: "loop" };
    input.self = input;

    const output = redactForLogs(input) as Record<string, unknown>;
    expect(output.name).toBe("loop");
    expect(output.self).toBe("[Circular]");
  });
});
