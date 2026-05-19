const MAX_STRING_LENGTH = 400;
const MAX_DEPTH = 6;
const NON_SENSITIVE_TOKEN_KEYS = new Set([
  "inputtokens",
  "outputtokens",
  "totaltokens",
  "prompttokens",
  "completiontokens",
  "maxinputtokensperday",
  "maxoutputtokensperday",
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);

  if (NON_SENSITIVE_TOKEN_KEYS.has(normalized)) {
    return false;
  }

  if (normalized === "email" || normalized.endsWith("email")) {
    return true;
  }
  if (normalized === "token" || normalized.endsWith("token")) {
    return true;
  }
  if (normalized.includes("secret")) {
    return true;
  }
  if (normalized === "authorization" || normalized.endsWith("authorization")) {
    return true;
  }
  if (normalized === "cookie" || normalized.endsWith("cookie")) {
    return true;
  }
  if (normalized === "clerkid" || normalized.endsWith("clerkid")) {
    return true;
  }
  if (normalized === "externalid" || normalized.endsWith("externalid")) {
    return true;
  }

  return false;
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]`;
}

function maskValue(value: unknown): string {
  if (typeof value !== "string") {
    return "[REDACTED]";
  }
  if (value.length <= 4) {
    return "***";
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function normalizeError(error: Error) {
  return {
    name: error.name,
    message: truncateString(error.message),
    stack: error.stack ? truncateString(error.stack) : undefined,
  };
}

function redactInternal(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (depth > MAX_DEPTH) {
    return "[MaxDepthExceeded]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return truncateString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Error) {
    return normalizeError(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactInternal(item, depth + 1, seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);

    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(input)) {
      if (isSensitiveKey(key)) {
        output[key] = maskValue(nestedValue);
        continue;
      }
      output[key] = redactInternal(nestedValue, depth + 1, seen);
    }

    return output;
  }

  return String(value);
}

export function redactForLogs(value: unknown): unknown {
  return redactInternal(value, 0, new WeakSet<object>());
}
