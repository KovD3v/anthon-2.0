export const MAX_DEVELOPER_DIAGNOSTICS_BYTES = 128 * 1024;
export const MAX_DEVELOPER_VALUE_BYTES = 32 * 1024;
export const MAX_DEVELOPER_STRING_CHARS = 24_000;
export const MAX_DEVELOPER_COLLECTION_ITEMS = 100;
export const MAX_DEVELOPER_VALUE_DEPTH = 8;

export type DeveloperSerializedValue =
  | null
  | boolean
  | number
  | string
  | DeveloperSerializedValue[]
  | { [key: string]: DeveloperSerializedValue };

export interface DeveloperDiagnosticRagChunk {
  sequence: number;
  documentId?: string;
  documentTitle?: string;
  chunkId?: string;
  score?: number;
  text: string;
}

export interface DeveloperDiagnosticToolCall {
  sequence: number;
  name: string;
  input: DeveloperSerializedValue;
  output?: DeveloperSerializedValue;
  status: "completed" | "failed" | "cancelled" | "not_allowed";
  error?: DeveloperSerializedValue;
  startOffsetMs?: number;
  durationMs?: number;
}

export interface DeveloperDiagnosticsV1 {
  version: 1;
  rag?: {
    decision: "not_attempted" | "attempted_empty" | "used" | "failed";
    query?: string;
    chunks: DeveloperDiagnosticRagChunk[];
    error?: DeveloperSerializedValue;
  };
  tools: DeveloperDiagnosticToolCall[];
  truncated: boolean;
}

export interface DeveloperRagChunkInput {
  documentId?: string;
  documentTitle?: string;
  chunkId?: string;
  score?: number;
  text: string;
}

export interface DeveloperToolDiagnosticHandle {
  complete(output: unknown): void;
  fail(error: unknown): void;
  cancel(error?: unknown): void;
  notAllowed(): void;
}

export interface DeveloperDiagnosticsCollector {
  recordRagDecision(input: { needed: boolean; query?: string }): void;
  recordRagResult(input: {
    query: string;
    chunks: DeveloperRagChunkInput[];
  }): void;
  recordRagFailure(input: { query: string; error: unknown }): void;
  startTool(name: string, input: unknown): DeveloperToolDiagnosticHandle;
  snapshot(): DeveloperDiagnosticsV1;
}

interface SerializeResult {
  value: DeveloperSerializedValue;
  truncated: boolean;
}

const byteLength = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

const marker = (reason: string): DeveloperSerializedValue => ({
  $type: "truncated",
  reason,
});

function serializeDeveloperValue(value: unknown): SerializeResult {
  let truncated = false;
  const ancestors = new WeakSet<object>();

  const visit = (current: unknown, depth: number): DeveloperSerializedValue => {
    if (depth > MAX_DEVELOPER_VALUE_DEPTH) {
      truncated = true;
      return marker("max_depth");
    }
    if (current === undefined) return { $type: "undefined" };
    if (
      current === null ||
      typeof current === "boolean" ||
      typeof current === "string"
    ) {
      if (
        typeof current === "string" &&
        current.length > MAX_DEVELOPER_STRING_CHARS
      ) {
        truncated = true;
        return `${current.slice(0, MAX_DEVELOPER_STRING_CHARS)}… [truncated]`;
      }
      return current;
    }
    if (typeof current === "number") {
      return Number.isFinite(current)
        ? current
        : { $type: "number", value: String(current) };
    }
    if (typeof current === "bigint")
      return { $type: "bigint", value: current.toString() };
    if (typeof current === "symbol" || typeof current === "function") {
      return { $type: typeof current, value: String(current) };
    }
    if (current instanceof Date) {
      return {
        $type: "date",
        value: Number.isNaN(current.getTime())
          ? "Invalid Date"
          : current.toISOString(),
      };
    }
    if (current instanceof Error) {
      const serialized: Record<string, DeveloperSerializedValue> = {
        $type: "error",
        name: current.name,
        message: current.message,
      };
      if (current.cause !== undefined)
        serialized.cause = visit(current.cause, depth + 1);
      return serialized;
    }
    if (ArrayBuffer.isView(current)) {
      const bytes = new Uint8Array(
        current.buffer,
        current.byteOffset,
        current.byteLength,
      );
      const preview = bytes.slice(0, 256);
      if (bytes.byteLength > preview.byteLength) truncated = true;
      return {
        $type: "binary",
        byteLength: bytes.byteLength,
        previewBase64: Buffer.from(preview).toString("base64"),
        ...(bytes.byteLength > preview.byteLength ? { truncated: true } : {}),
      };
    }
    if (current instanceof ArrayBuffer) {
      return visit(new Uint8Array(current), depth);
    }
    if (typeof current !== "object") return String(current);
    if (ancestors.has(current)) return { $type: "circular" };

    ancestors.add(current);
    let result: DeveloperSerializedValue;
    if (Array.isArray(current)) {
      if (current.length > MAX_DEVELOPER_COLLECTION_ITEMS) truncated = true;
      result = current
        .slice(0, MAX_DEVELOPER_COLLECTION_ITEMS)
        .map((item) => visit(item, depth + 1));
    } else {
      const entries = Object.entries(current);
      if (entries.length > MAX_DEVELOPER_COLLECTION_ITEMS) truncated = true;
      result = Object.fromEntries(
        entries
          .slice(0, MAX_DEVELOPER_COLLECTION_ITEMS)
          .map(([key, item]) => [key.slice(0, 500), visit(item, depth + 1)]),
      );
    }
    ancestors.delete(current);
    return result;
  };

  let serialized = visit(value, 0);
  if (byteLength(serialized) > MAX_DEVELOPER_VALUE_BYTES) {
    truncated = true;
    serialized = marker("max_value_bytes");
  }
  return { value: serialized, truncated };
}

function compactSnapshot(
  snapshot: DeveloperDiagnosticsV1,
): DeveloperDiagnosticsV1 {
  if (byteLength(snapshot) <= MAX_DEVELOPER_DIAGNOSTICS_BYTES) return snapshot;
  snapshot.truncated = true;

  const candidates: Array<() => void> = [];
  for (let index = snapshot.tools.length - 1; index >= 0; index -= 1) {
    const tool = snapshot.tools[index];
    if (!tool) continue;
    if (tool.output !== undefined)
      candidates.push(() => {
        tool.output = marker("max_total_bytes");
      });
    candidates.push(() => {
      tool.input = marker("max_total_bytes");
    });
    if (tool.error !== undefined)
      candidates.push(() => {
        tool.error = marker("max_total_bytes");
      });
  }
  for (
    let index = (snapshot.rag?.chunks.length ?? 0) - 1;
    index >= 0;
    index -= 1
  ) {
    const chunk = snapshot.rag?.chunks[index];
    if (chunk)
      candidates.push(() => {
        chunk.text = "[truncated: max_total_bytes]";
      });
  }

  for (const compact of candidates) {
    compact();
    if (byteLength(snapshot) <= MAX_DEVELOPER_DIAGNOSTICS_BYTES)
      return snapshot;
  }

  while (
    snapshot.tools.length > 0 &&
    byteLength(snapshot) > MAX_DEVELOPER_DIAGNOSTICS_BYTES
  ) {
    snapshot.tools.pop();
  }
  while (
    snapshot.rag &&
    snapshot.rag.chunks.length > 0 &&
    byteLength(snapshot) > MAX_DEVELOPER_DIAGNOSTICS_BYTES
  ) {
    snapshot.rag.chunks.pop();
  }
  return snapshot;
}

export function isDeveloperDiagnosticsEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

export function createDeveloperDiagnosticsCollector(options?: {
  enabled?: boolean;
  now?: () => number;
}): DeveloperDiagnosticsCollector | undefined {
  if (!(options?.enabled ?? isDeveloperDiagnosticsEnabled())) return undefined;

  const now = options?.now ?? Date.now;
  const requestStartedAt = now();
  const tools: DeveloperDiagnosticToolCall[] = [];
  let rag: DeveloperDiagnosticsV1["rag"];
  let truncated = false;

  const serialize = (value: unknown): DeveloperSerializedValue => {
    const result = serializeDeveloperValue(value);
    truncated ||= result.truncated;
    return result.value;
  };

  return {
    recordRagDecision(input) {
      rag = {
        decision: input.needed ? "attempted_empty" : "not_attempted",
        ...(input.query
          ? { query: input.query.slice(0, MAX_DEVELOPER_STRING_CHARS) }
          : {}),
        chunks: [],
      };
      truncated ||= Boolean(
        input.query && input.query.length > MAX_DEVELOPER_STRING_CHARS,
      );
    },
    recordRagResult(input) {
      const chunks = input.chunks
        .slice(0, MAX_DEVELOPER_COLLECTION_ITEMS)
        .map((chunk, index) => ({
          sequence: index + 1,
          ...(chunk.documentId ? { documentId: chunk.documentId } : {}),
          ...(chunk.documentTitle
            ? { documentTitle: chunk.documentTitle }
            : {}),
          ...(chunk.chunkId ? { chunkId: chunk.chunkId } : {}),
          ...(typeof chunk.score === "number" && Number.isFinite(chunk.score)
            ? { score: chunk.score }
            : {}),
          text:
            chunk.text.length > MAX_DEVELOPER_STRING_CHARS
              ? `${chunk.text.slice(0, MAX_DEVELOPER_STRING_CHARS)}… [truncated]`
              : chunk.text,
        }));
      truncated ||=
        input.chunks.length > MAX_DEVELOPER_COLLECTION_ITEMS ||
        input.chunks.some(
          (chunk) => chunk.text.length > MAX_DEVELOPER_STRING_CHARS,
        );
      rag = {
        decision: chunks.length > 0 ? "used" : "attempted_empty",
        query: input.query.slice(0, MAX_DEVELOPER_STRING_CHARS),
        chunks,
      };
      truncated ||= input.query.length > MAX_DEVELOPER_STRING_CHARS;
    },
    recordRagFailure(input) {
      rag = {
        decision: "failed",
        query: input.query.slice(0, MAX_DEVELOPER_STRING_CHARS),
        chunks: [],
        error: serialize(input.error),
      };
      truncated ||= input.query.length > MAX_DEVELOPER_STRING_CHARS;
    },
    startTool(name, input) {
      const startedAt = now();
      const tool: DeveloperDiagnosticToolCall = {
        sequence: tools.length + 1,
        name: name.slice(0, 500),
        input: serialize(input),
        status: "cancelled",
        startOffsetMs: Math.max(0, startedAt - requestStartedAt),
      };
      tools.push(tool);
      let finished = false;
      const finish = (
        status: DeveloperDiagnosticToolCall["status"],
        output?: unknown,
        error?: unknown,
      ) => {
        if (finished) return;
        finished = true;
        tool.status = status;
        tool.durationMs = Math.max(0, now() - startedAt);
        if (output !== undefined) tool.output = serialize(output);
        if (status === "completed" && output === undefined)
          tool.output = serialize(undefined);
        if (error !== undefined) tool.error = serialize(error);
      };
      return {
        complete: (output) => finish("completed", output),
        fail: (error) => finish("failed", undefined, error),
        cancel: (error) => finish("cancelled", undefined, error),
        notAllowed: () => finish("not_allowed"),
      };
    },
    snapshot() {
      return compactSnapshot({
        version: 1,
        ...(rag ? { rag: structuredClone(rag) } : {}),
        tools: structuredClone(tools),
        truncated,
      });
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSerializedValue(
  value: unknown,
  depth = 0,
): value is DeveloperSerializedValue {
  if (depth > MAX_DEVELOPER_VALUE_DEPTH + 3) return false;
  if (value === null || ["boolean", "number", "string"].includes(typeof value))
    return true;
  if (Array.isArray(value)) {
    return (
      value.length <= MAX_DEVELOPER_COLLECTION_ITEMS &&
      value.every((item) => isSerializedValue(item, depth + 1))
    );
  }
  if (
    !isRecord(value) ||
    Object.keys(value).length > MAX_DEVELOPER_COLLECTION_ITEMS
  )
    return false;
  return Object.values(value).every((item) =>
    isSerializedValue(item, depth + 1),
  );
}

const nonNegativeNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export function parseDeveloperDiagnostics(
  value: unknown,
): DeveloperDiagnosticsV1 | undefined {
  try {
    if (byteLength(value) > MAX_DEVELOPER_DIAGNOSTICS_BYTES || !isRecord(value))
      return undefined;
    if (
      value.version !== 1 ||
      typeof value.truncated !== "boolean" ||
      !Array.isArray(value.tools)
    ) {
      return undefined;
    }
    if (value.tools.length > MAX_DEVELOPER_COLLECTION_ITEMS) return undefined;
    const statuses = new Set([
      "completed",
      "failed",
      "cancelled",
      "not_allowed",
    ]);
    for (const tool of value.tools) {
      if (
        !isRecord(tool) ||
        !Number.isInteger(tool.sequence) ||
        (tool.sequence as number) < 1 ||
        typeof tool.name !== "string" ||
        !statuses.has(String(tool.status)) ||
        !isSerializedValue(tool.input) ||
        (tool.output !== undefined && !isSerializedValue(tool.output)) ||
        (tool.error !== undefined && !isSerializedValue(tool.error)) ||
        (tool.startOffsetMs !== undefined &&
          !nonNegativeNumber(tool.startOffsetMs)) ||
        (tool.durationMs !== undefined && !nonNegativeNumber(tool.durationMs))
      ) {
        return undefined;
      }
    }
    if (value.rag !== undefined) {
      if (!isRecord(value.rag) || !Array.isArray(value.rag.chunks))
        return undefined;
      if (
        !new Set(["not_attempted", "attempted_empty", "used", "failed"]).has(
          String(value.rag.decision),
        )
      ) {
        return undefined;
      }
      if (value.rag.query !== undefined && typeof value.rag.query !== "string")
        return undefined;
      if (value.rag.error !== undefined && !isSerializedValue(value.rag.error))
        return undefined;
      if (value.rag.chunks.length > MAX_DEVELOPER_COLLECTION_ITEMS)
        return undefined;
      for (const chunk of value.rag.chunks) {
        if (
          !isRecord(chunk) ||
          !Number.isInteger(chunk.sequence) ||
          (chunk.sequence as number) < 1 ||
          typeof chunk.text !== "string" ||
          (chunk.documentId !== undefined &&
            typeof chunk.documentId !== "string") ||
          (chunk.documentTitle !== undefined &&
            typeof chunk.documentTitle !== "string") ||
          (chunk.chunkId !== undefined && typeof chunk.chunkId !== "string") ||
          (chunk.score !== undefined && typeof chunk.score !== "number")
        ) {
          return undefined;
        }
      }
    }
    return value as unknown as DeveloperDiagnosticsV1;
  } catch {
    return undefined;
  }
}
