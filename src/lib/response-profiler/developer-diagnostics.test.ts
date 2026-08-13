import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDeveloperDiagnosticsCollector,
  isDeveloperDiagnosticsEnabled,
  MAX_DEVELOPER_DIAGNOSTICS_BYTES,
  parseDeveloperDiagnostics,
} from "./developer-diagnostics";

describe("developer diagnostics", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("records exact RAG evidence and ordered tool lifecycles", () => {
    let now = 1_000;
    const collector = createDeveloperDiagnosticsCollector({
      enabled: true,
      now: () => now,
    });

    expect(collector).toBeDefined();
    collector?.recordRagDecision({
      needed: true,
      query: "come dormire meglio?",
    });
    collector?.recordRagResult({
      query: "come dormire meglio?",
      chunks: [
        {
          chunkId: "chunk-1",
          documentId: "document-1",
          documentTitle: "Routine serale",
          score: 0.91,
          text: "Riduci gli stimoli prima di dormire.",
        },
      ],
    });

    now = 1_025;
    const firstTool = collector?.startTool("searchRag", { query: "sonno" });
    now = 1_060;
    firstTool?.complete({ matches: 1 });

    now = 1_070;
    const secondTool = collector?.startTool("calendar", { day: "tomorrow" });
    now = 1_090;
    secondTool?.fail(new Error("calendar unavailable"));

    expect(collector?.snapshot()).toEqual({
      version: 1,
      rag: {
        decision: "used",
        query: "come dormire meglio?",
        chunks: [
          {
            sequence: 1,
            chunkId: "chunk-1",
            documentId: "document-1",
            documentTitle: "Routine serale",
            score: 0.91,
            text: "Riduci gli stimoli prima di dormire.",
          },
        ],
      },
      tools: [
        {
          sequence: 1,
          name: "searchRag",
          input: { query: "sonno" },
          output: { matches: 1 },
          status: "completed",
          startOffsetMs: 25,
          durationMs: 35,
        },
        {
          sequence: 2,
          name: "calendar",
          input: { day: "tomorrow" },
          status: "failed",
          error: {
            $type: "error",
            name: "Error",
            message: "calendar unavailable",
          },
          startOffsetMs: 70,
          durationMs: 20,
        },
      ],
      truncated: false,
    });
  });

  it("serializes special, binary, cyclic and hostile values without executing them", () => {
    const collector = createDeveloperDiagnosticsCollector({ enabled: true });
    const cyclic: Record<string, unknown> = { label: "cycle" };
    cyclic.self = cyclic;
    const hostile = '<img src=x onerror="alert(1)"><script>bad()</script>';
    const tool = collector?.startTool("unsafe-looking", {
      absent: undefined,
      createdAt: new Date("2026-08-12T12:00:00.000Z"),
      bytes: new Uint8Array([1, 2, 3]),
      cyclic,
      hostile,
    });
    tool?.complete(undefined);

    const snapshot = collector?.snapshot();
    expect(snapshot?.tools[0]?.input).toMatchObject({
      absent: { $type: "undefined" },
      createdAt: { $type: "date", value: "2026-08-12T12:00:00.000Z" },
      bytes: { $type: "binary", byteLength: 3, previewBase64: "AQID" },
      cyclic: { label: "cycle", self: { $type: "circular" } },
      hostile,
    });
    expect(snapshot?.tools[0]?.output).toEqual({ $type: "undefined" });
  });

  it("is disabled outside development unless explicitly enabled for a test", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(isDeveloperDiagnosticsEnabled()).toBe(false);
    expect(createDeveloperDiagnosticsCollector()).toBeUndefined();
    expect(
      createDeveloperDiagnosticsCollector({ enabled: true }),
    ).toBeDefined();
  });

  it("marks bounded values and total snapshots as truncated", () => {
    const collector = createDeveloperDiagnosticsCollector({ enabled: true });
    for (let index = 0; index < 100; index += 1) {
      collector?.startTool(`tool-${index}`, {
        value: `${index}:${"x".repeat(24_000)}`,
      });
    }

    const snapshot = collector?.snapshot();
    expect(snapshot?.truncated).toBe(true);
    expect(
      new TextEncoder().encode(JSON.stringify(snapshot)).byteLength,
    ).toBeLessThanOrEqual(MAX_DEVELOPER_DIAGNOSTICS_BYTES);
  });

  it("rejects malformed, unsupported and oversized persisted payloads", () => {
    expect(
      parseDeveloperDiagnostics({ version: 2, tools: [], truncated: false }),
    ).toBeUndefined();
    expect(
      parseDeveloperDiagnostics({
        version: 1,
        tools: [{ sequence: 1, name: "x", input: null, status: "running" }],
        truncated: false,
      }),
    ).toBeUndefined();
    expect(
      parseDeveloperDiagnostics({
        version: 1,
        tools: [
          {
            sequence: 1,
            name: "x",
            input: null,
            status: "completed",
            durationMs: -1,
          },
        ],
        truncated: false,
      }),
    ).toBeUndefined();
    expect(
      parseDeveloperDiagnostics({
        version: 1,
        tools: [],
        truncated: false,
        padding: "x".repeat(MAX_DEVELOPER_DIAGNOSTICS_BYTES),
      }),
    ).toBeUndefined();
  });
});
