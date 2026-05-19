import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getConfiguredLogLevel,
  getConfiguredLogOutputFormat,
  getDefaultLogLevel,
  getDefaultLogOutputFormat,
  shouldLog,
  shouldLogEvent,
} from "./config";

describe("logger/config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to info in development/local", () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.APP_LOG_LEVEL;
    delete process.env.APP_LOG_FORMAT;

    expect(getDefaultLogLevel()).toBe("info");
    expect(getConfiguredLogLevel()).toBe("info");
    expect(getDefaultLogOutputFormat()).toBe("pretty");
    expect(getConfiguredLogOutputFormat()).toBe("pretty");
    expect(shouldLog("info")).toBe(true);
    expect(shouldLog("debug")).toBe(false);
  });

  it("defaults to silent in test", () => {
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.APP_LOG_LEVEL;
    delete process.env.APP_LOG_FORMAT;

    expect(getDefaultLogLevel()).toBe("silent");
    expect(getConfiguredLogLevel()).toBe("silent");
    expect(getConfiguredLogOutputFormat()).toBe("json");
    expect(shouldLog("error")).toBe(false);
  });

  it("defaults to error in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.APP_LOG_LEVEL;
    delete process.env.APP_LOG_FORMAT;

    expect(getDefaultLogLevel()).toBe("error");
    expect(getConfiguredLogLevel()).toBe("error");
    expect(getConfiguredLogOutputFormat()).toBe("json");
    expect(shouldLog("warn")).toBe(false);
    expect(shouldLog("error")).toBe(true);
  });

  it("supports APP_LOG_LEVEL override", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_LOG_LEVEL", "debug");

    expect(getConfiguredLogLevel()).toBe("debug");
    expect(shouldLog("debug")).toBe(true);
    expect(shouldLog("info")).toBe(true);
  });

  it("supports APP_LOG_FORMAT override", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_LOG_FORMAT", "pretty");

    expect(getConfiguredLogOutputFormat()).toBe("pretty");
  });

  it("supports APP_LOG_DOMAIN_LEVELS override", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_LOG_LEVEL", "info");
    vi.stubEnv("APP_LOG_DOMAIN_LEVELS", "auth:warn,usage:debug");

    expect(getConfiguredLogLevel("auth")).toBe("warn");
    expect(getConfiguredLogLevel("usage")).toBe("debug");
    expect(shouldLog("info", "auth")).toBe(false);
    expect(shouldLog("debug", "usage")).toBe(true);
  });

  it("supports APP_LOG_EXCLUDE_EVENTS patterns", () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.APP_LOG_LEVEL;
    vi.stubEnv("APP_LOG_EXCLUDE_EVENTS", "auth.authenticated,latency.*");

    expect(shouldLogEvent("info", "auth", "auth.authenticated")).toBe(false);
    expect(shouldLogEvent("info", "latency", "latency.measure")).toBe(false);
    expect(shouldLogEvent("info", "usage", "usage.snapshot")).toBe(true);
  });

  it("keeps latency compatibility when ENABLE_LATENCY_LOGS is true", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.APP_LOG_LEVEL;
    vi.stubEnv("ENABLE_LATENCY_LOGS", "true");

    expect(getConfiguredLogLevel("latency")).toBe("info");
    expect(shouldLog("info", "latency")).toBe(true);
  });
});
