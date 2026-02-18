import type { LogDomain, LogLevel } from "./types";

export type LogOutputFormat = "json" | "pretty";

const ORDERED_LEVELS: readonly Exclude<LogLevel, "silent">[] = [
  "debug",
  "info",
  "warn",
  "error",
];

const LEVEL_PRIORITY: Record<Exclude<LogLevel, "silent">, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const VALID_LEVELS = new Set<LogLevel>([
  "debug",
  "info",
  "warn",
  "error",
  "silent",
]);
const VALID_OUTPUT_FORMATS = new Set<LogOutputFormat>(["json", "pretty"]);
const VALID_DOMAINS = new Set<LogDomain>([
  "ai",
  "voice",
  "auth",
  "usage",
  "organizations",
  "webhook",
  "latency",
]);

let domainLevelsCache: {
  raw: string;
  value: Partial<Record<LogDomain, LogLevel>>;
} | null = null;
let excludedEventsCache: { raw: string; value: string[] } | null = null;

function parseLevel(value?: string | null): LogLevel | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!VALID_LEVELS.has(normalized as LogLevel)) {
    return null;
  }
  return normalized as LogLevel;
}

function parseOutputFormat(value?: string | null): LogOutputFormat | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!VALID_OUTPUT_FORMATS.has(normalized as LogOutputFormat)) {
    return null;
  }
  return normalized as LogOutputFormat;
}

export function getDefaultLogLevel(): LogLevel {
  if (process.env.NODE_ENV === "test") return "silent";
  if (process.env.NODE_ENV === "production") return "error";
  return "info";
}

export function getDefaultLogOutputFormat(): LogOutputFormat {
  if (process.env.NODE_ENV === "production") return "json";
  if (process.env.NODE_ENV === "test") return "json";
  return "pretty";
}

function getParsedDomainLevels(): Partial<Record<LogDomain, LogLevel>> {
  const raw = process.env.APP_LOG_DOMAIN_LEVELS?.trim() ?? "";

  if (domainLevelsCache && domainLevelsCache.raw === raw) {
    return domainLevelsCache.value;
  }

  const result: Partial<Record<LogDomain, LogLevel>> = {};

  for (const segment of raw.split(",")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const [domainRaw, levelRaw] = trimmed.split(":").map((value) => value?.trim());
    if (!domainRaw || !levelRaw) continue;
    if (!VALID_DOMAINS.has(domainRaw as LogDomain)) continue;

    const parsedLevel = parseLevel(levelRaw);
    if (!parsedLevel) continue;

    result[domainRaw as LogDomain] = parsedLevel;
  }

  domainLevelsCache = { raw, value: result };
  return result;
}

function getDomainOverrideLevel(domain?: LogDomain): LogLevel | null {
  if (!domain) return null;
  return getParsedDomainLevels()[domain] ?? null;
}

function getExcludedEvents(): string[] {
  const raw = process.env.APP_LOG_EXCLUDE_EVENTS?.trim() ?? "";

  if (excludedEventsCache && excludedEventsCache.raw === raw) {
    return excludedEventsCache.value;
  }

  const value = raw
    .split(",")
    .map((event) => event.trim())
    .filter(Boolean);
  excludedEventsCache = { raw, value };

  return value;
}

function isExcludedByPattern(event: string, pattern: string): boolean {
  if (pattern.endsWith("*")) {
    return event.startsWith(pattern.slice(0, -1));
  }
  return event === pattern;
}

export function isEventExcluded(event: string): boolean {
  return getExcludedEvents().some((pattern) =>
    isExcludedByPattern(event, pattern),
  );
}

function getLatencyCompatibleLevel(baseLevel: LogLevel): LogLevel {
  if (baseLevel !== "error") return baseLevel;
  if (process.env.ENABLE_LATENCY_LOGS === "true") {
    // Keep existing compatibility where latency logs can be explicitly enabled.
    return "info";
  }
  return baseLevel;
}

export function getConfiguredLogLevel(domain?: LogDomain): LogLevel {
  const override = parseLevel(process.env.APP_LOG_LEVEL);
  const base = getDomainOverrideLevel(domain) ?? override ?? getDefaultLogLevel();

  if (domain === "latency") {
    return getLatencyCompatibleLevel(base);
  }

  return base;
}

export function getConfiguredLogOutputFormat(): LogOutputFormat {
  const override = parseOutputFormat(process.env.APP_LOG_FORMAT);
  return override ?? getDefaultLogOutputFormat();
}

export function shouldLog(
  level: Exclude<LogLevel, "silent">,
  domain?: LogDomain,
): boolean {
  const configured = getConfiguredLogLevel(domain);
  if (configured === "silent") return false;

  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[configured];
}

export function shouldLogEvent(
  level: Exclude<LogLevel, "silent">,
  domain: LogDomain,
  event: string,
): boolean {
  if (isEventExcluded(event)) return false;
  return shouldLog(level, domain);
}

export const LOG_LEVEL_ORDER = ORDERED_LEVELS;
