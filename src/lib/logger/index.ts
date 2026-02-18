import { randomUUID } from "node:crypto";
import { getConfiguredLogOutputFormat, shouldLogEvent } from "./config";
import { getLogContext, withLogContext } from "./context";
import { redactForLogs } from "./redact";
import type {
  LogContext,
  LogDomain,
  LogLevel,
  StructuredLogEvent,
} from "./types";

type LogMethod = (event: string, message: string, data?: unknown) => void;

export interface DomainLogger {
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
}

const MAX_PRETTY_PAIRS = 28;
const MAX_PRETTY_DEPTH = 2;
const MAX_PRETTY_STRING_LENGTH = 48;
const PRETTY_WRAP_WIDTH = 130;
const ANSI_RESET = "\x1b[0m";
const ANSI_DIM = "\x1b[2m";
const ANSI_BLUE = "\x1b[34m";
const ANSI_GREEN = "\x1b[32m";
const ANSI_YELLOW = "\x1b[33m";
const ANSI_RED = "\x1b[31m";
const ANSI_CYAN = "\x1b[36m";

function isColorEnabled(): boolean {
  if (process.env.APP_LOG_COLORS === "false") return false;
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR === "0") return false;
  return Boolean(process.stdout?.isTTY);
}

function colorize(text: string, ansiCode: string, enabled: boolean): string {
  if (!enabled) return text;
  return `${ansiCode}${text}${ANSI_RESET}`;
}

function formatPrettyTimestamp(isoTimestamp: string): string {
  return isoTimestamp.slice(11, 23);
}

function wrapText(
  text: string,
  width: number,
  firstPrefix: string,
  restPrefix = firstPrefix,
): string {
  if (!text) return firstPrefix.trimEnd();
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return firstPrefix.trimEnd();

  const lines: string[] = [];
  let current = "";
  let currentWidth = width;

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    const candidate = `${current} ${word}`;
    if (candidate.length <= currentWidth) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = word;
    currentWidth = width;
  }

  if (current) {
    lines.push(current);
  }

  return lines
    .map((line, index) => `${index === 0 ? firstPrefix : restPrefix}${line}`)
    .join("\n");
}

function formatPrettyContext(context?: LogContext): string {
  if (!context) return "";

  const parts: string[] = [];
  if (context.requestId) {
    parts.push(`req=${context.requestId.slice(0, 8)}`);
  }
  if (context.method || context.route) {
    const methodRoute = [context.method, context.route]
      .filter(Boolean)
      .join(" ");
    if (methodRoute) {
      parts.push(methodRoute);
    }
  }
  if (context.channel) {
    parts.push(`ch=${context.channel}`);
  }

  return parts.join(" ");
}

function formatNumber(value: number): string {
  if (Number.isNaN(value)) return "NaN";
  if (!Number.isFinite(value)) return value > 0 ? "Infinity" : "-Infinity";
  if (Number.isInteger(value)) return String(value);

  const abs = Math.abs(value);
  if (abs >= 1) return value.toFixed(3).replace(/\.?0+$/, "");
  if (abs === 0) return "0";
  if (abs < 0.001) return value.toExponential(2);
  return value.toFixed(6).replace(/\.?0+$/, "");
}

function formatPrimitive(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "bigint") return `${value}n`;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    if (value.length <= MAX_PRETTY_STRING_LENGTH) return value;
    return `${value.slice(0, MAX_PRETTY_STRING_LENGTH)}…`;
  }
  return String(value);
}

function flattenPrettyData(
  value: unknown,
  prefix: string,
  depth: number,
  pairs: string[],
): void {
  if (pairs.length >= MAX_PRETTY_PAIRS) return;

  const label = prefix || "data";
  const primitive =
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    value instanceof Date;

  if (primitive) {
    pairs.push(`${label}=${formatPrimitive(value)}`);
    return;
  }

  if (Array.isArray(value)) {
    const isSimple = value.every(
      (item) =>
        item === null ||
        item === undefined ||
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean" ||
        typeof item === "bigint",
    );

    if (isSimple && value.length <= 4) {
      pairs.push(
        `${label}=[${value.map((item) => formatPrimitive(item)).join(", ")}]`,
      );
      return;
    }

    pairs.push(`${label}=[${value.length} items]`);
    return;
  }

  if (typeof value !== "object") {
    pairs.push(`${label}=${String(value)}`);
    return;
  }

  if (depth >= MAX_PRETTY_DEPTH) {
    pairs.push(`${label}={…}`);
    return;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    pairs.push(`${label}={}`);
    return;
  }

  for (const [key, nestedValue] of entries) {
    if (pairs.length >= MAX_PRETTY_PAIRS) {
      break;
    }
    const nestedPrefix = prefix ? `${prefix}.${key}` : key;
    flattenPrettyData(nestedValue, nestedPrefix, depth + 1, pairs);
  }
}

function formatPrettyData(data: unknown): string {
  const pairs: string[] = [];
  flattenPrettyData(data, "", 0, pairs);

  if (pairs.length >= MAX_PRETTY_PAIRS) {
    pairs.push("…");
  }

  return pairs.join(" ");
}

function formatPrettyLine(payload: StructuredLogEvent): string {
  const colorEnabled = isColorEnabled();
  const level = payload.level.toUpperCase().padEnd(5, " ");
  const context = formatPrettyContext(payload.context);

  const levelColor =
    payload.level === "error"
      ? ANSI_RED
      : payload.level === "warn"
        ? ANSI_YELLOW
        : payload.level === "debug"
          ? ANSI_BLUE
          : ANSI_GREEN;

  const header = [
    colorize(
      `[${formatPrettyTimestamp(payload.timestamp)}]`,
      ANSI_DIM,
      colorEnabled,
    ),
    colorize(level, levelColor, colorEnabled),
    colorize(`${payload.domain}:${payload.event}`, ANSI_CYAN, colorEnabled),
    context ? colorize(context, ANSI_DIM, colorEnabled) : "",
  ]
    .filter(Boolean)
    .join(" ");

  const messageLine = wrapText(payload.message, PRETTY_WRAP_WIDTH, "  ");
  const dataLine =
    payload.data === undefined
      ? ""
      : wrapText(
          formatPrettyData(payload.data),
          PRETTY_WRAP_WIDTH,
          `  ${colorize("data", ANSI_DIM, colorEnabled)} `,
          "       ",
        );

  return [header, messageLine, dataLine].filter(Boolean).join("\n");
}

function emitStructuredLog(
  level: Exclude<LogLevel, "silent">,
  domain: LogDomain,
  event: string,
  message: string,
  data?: unknown,
) {
  if (!shouldLogEvent(level, domain, event)) return;

  const context = getLogContext();
  const payload: StructuredLogEvent = {
    timestamp: new Date().toISOString(),
    level,
    domain,
    event,
    message,
    ...(Object.keys(context).length > 0 ? { context } : {}),
    ...(data !== undefined ? { data: redactForLogs(data) } : {}),
  };

  const line =
    getConfiguredLogOutputFormat() === "pretty"
      ? formatPrettyLine(payload)
      : JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  if (level === "debug") {
    console.debug(line);
    return;
  }
  console.log(line);
}

export function createLogger(domain: LogDomain): DomainLogger {
  return {
    debug: (event, message, data) =>
      emitStructuredLog("debug", domain, event, message, data),
    info: (event, message, data) =>
      emitStructuredLog("info", domain, event, message, data),
    warn: (event, message, data) =>
      emitStructuredLog("warn", domain, event, message, data),
    error: (event, message, data) =>
      emitStructuredLog("error", domain, event, message, data),
  };
}

export function withRequestLogContext<T>(
  request: Request | null | undefined,
  meta: Omit<LogContext, "requestId" | "method"> & {
    method?: string;
  },
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const requestWithOptionalHeaders = (request ?? {}) as Request & {
    headers?: {
      get?: (name: string) => string | null;
    };
    method?: string;
  };
  const requestId =
    requestWithOptionalHeaders.headers?.get?.("x-request-id")?.trim() ||
    randomUUID();

  return withLogContext(
    {
      requestId,
      method: meta.method ?? requestWithOptionalHeaders.method ?? "UNKNOWN",
      route: meta.route,
      channel: meta.channel,
    },
    fn,
  );
}

export { getLogContext, withLogContext };
export type { LogContext, LogDomain, LogLevel, StructuredLogEvent };
