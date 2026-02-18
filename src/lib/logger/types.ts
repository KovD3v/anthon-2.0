export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export type LogDomain =
  | "ai"
  | "voice"
  | "auth"
  | "usage"
  | "organizations"
  | "webhook"
  | "latency";

export interface LogContext {
  requestId?: string;
  route?: string;
  method?: string;
  channel?: string;
}

export interface StructuredLogEvent {
  timestamp: string;
  level: Exclude<LogLevel, "silent">;
  domain: LogDomain;
  event: string;
  message: string;
  context?: LogContext;
  data?: unknown;
}
