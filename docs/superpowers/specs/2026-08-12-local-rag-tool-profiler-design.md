# Local RAG and Tool Profiler Design

## Goal

Extend the response profiler with the complete RAG and tool evidence needed to
explain one assistant response during local development. The profiler must show
what was requested, what was returned, when it happened, and whether it
succeeded. Raw conversational or retrieved content must never be collected,
persisted, returned, or rendered in preview or production.

## Scope

The feature covers authenticated web chat responses inspected through the
existing technical metrics panel. It adds:

- RAG decision and execution details;
- the retrieval query;
- retrieved chunk text, score, and source identity;
- every model tool invocation with full input and output;
- timing, sequence, outcome, and error details;
- a local-only UI that relates these details to the existing response timeline.

The existing aggregate production telemetry remains unchanged. Historical
messages continue to render the fields they already contain and must not imply
that missing detail was observed.

## Environment Boundary

Rich diagnostics are enabled only when the server process is running with
`NODE_ENV === "development"`. This is the collection boundary, not merely a UI
condition.

When the condition is false:

1. orchestration and tool wrappers do not construct raw diagnostic payloads;
2. persistence does not receive or store them;
3. technical-metrics serializers do not return them;
4. client types and UI tolerate their absence;
5. existing aggregate fields such as `ragAttempted`, `ragUsed`,
   `ragChunksCount`, `toolCallCount`, and safe server spans remain available.

Vercel preview and production builds use production mode and therefore follow
the disabled path. The UI must not use the hostname as the security boundary.

## Data Model

Rich local diagnostics live in a separate optional, versioned
`developerDiagnostics` object associated with the assistant response metrics.
They do not expand the bounded `serverTrace` contract, whose spans remain safe
and compact.

Version 1 contains:

```ts
interface DeveloperDiagnosticsV1 {
  version: 1;
  rag?: {
    decision: "not_attempted" | "attempted_empty" | "used" | "failed";
    query?: string;
    chunks: Array<{
      sequence: number;
      documentId?: string;
      documentTitle?: string;
      chunkId?: string;
      score?: number;
      text: string;
    }>;
    error?: SerializedDeveloperError;
  };
  tools: Array<{
    sequence: number;
    name: string;
    input: SerializedDeveloperValue;
    output?: SerializedDeveloperValue;
    status: "completed" | "failed" | "cancelled" | "not_allowed";
    error?: SerializedDeveloperError;
    startOffsetMs?: number;
    durationMs?: number;
  }>;
  truncated: boolean;
}
```

`SerializedDeveloperValue` preserves JSON-compatible values and represents
non-JSON values with an explicit type marker. Serialization must handle cycles,
errors, binary values, dates, `undefined`, and oversized values without causing
the chat request to fail.

Diagnostics are bounded to protect the local app from accidental multi-megabyte
tool results. The implementation will use named limits for total payload size,
individual values, string length, collection length, and object depth. Any
reduction sets `truncated: true` and inserts a visible truncation marker. The
limits constrain storage, not the normal tool execution result passed to the
model.

## Collection Flow

### RAG

The RAG layer already owns embedding and vector search timing. In development,
it additionally returns a diagnostic projection containing the exact effective
query and the filtered chunks actually offered to the prompt or tool result.
Each chunk carries the identifiers and similarity score already available at
retrieval time. The projection must not trigger another database query.

The orchestrator maps the execution into one truthful state:

- `not_attempted`: policy did not invoke retrieval;
- `attempted_empty`: retrieval ran but supplied no chunks;
- `used`: one or more chunks were supplied;
- `failed`: retrieval raised or returned a handled failure.

### Tools

The existing tool lifecycle wrapper is the single collection point. It records
the effective tool name, validated input, returned output, lifecycle status,
error, sequence, start offset, and duration. It records the value at the tool
boundary rather than reconstructing it later from UI message parts.

Disallowed and failed calls remain visible with their attempted input and safe
serialized error. A missing output is distinct from a JSON `null` output.

### Persistence and Readback

The assistant metrics object receives `developerDiagnostics` only in
development. The existing message persistence path stores that optional object
with the response metrics. The technical-metrics reader parses it defensively
and exposes it only while the current server is also in development mode.

Malformed or unsupported versions are omitted without hiding the rest of the
technical metrics. Diagnostic collection, serialization, persistence, and
readback are fail-open for the user response: a profiler failure is logged
through the project logger but cannot fail chat generation.

## User Interface

The current response summary and backend/browser timelines remain the primary
overview. A new `RAG e strumenti` section appears after the timelines and before
consumption details.

### RAG panel

The panel displays:

- outcome badge (`Non tentato`, `Nessun risultato`, `Usato`, `Fallito`);
- effective query;
- total chunks and RAG timing spans already present in the backend timeline;
- one expandable row per chunk with source title/identifier, similarity score,
  sequence, and full retrieved text;
- the serialized error when retrieval failed.

### Tool panel

The panel displays one row per invocation in execution order:

- sequence, tool name, status, and duration;
- absolute interval `start → end` when available;
- expandable `Input`, `Output`, and `Errore` blocks;
- formatted JSON for structured values and pre-wrapped text for strings;
- copy actions for query, chunks, input, output, and errors.

Large content blocks are collapsed by default. Truncation is stated next to the
affected value and at section level. Tool inputs and outputs are treated as
diagnostic text, never injected as HTML.

For legacy messages without `developerDiagnostics`, the existing aggregate
`Contesto e strumenti` section remains. It shows attempted/used/chunk counts and
tool counts without inventing query, content, names, or per-call timing.

## Testing

### Unit and contract tests

- development collection preserves RAG query, chunk evidence, tool input,
  output, timing, status, and errors;
- production-mode collection produces no rich payload;
- serializers handle cycles, special values, depth, size, and truncation;
- parsers reject malformed or unsupported payloads without rejecting the
  remaining usage metrics;
- RAG states distinguish not attempted, empty, used, and failed;
- multiple and failed tool calls retain execution order and outcome.

### Component tests

- rich development diagnostics render query, chunk source/score/text, tool
  input/output, timings, errors, and truncation markers;
- content is rendered as text and cannot become executable markup;
- missing rich diagnostics fall back to the aggregate legacy presentation;
- expandable blocks and copy controls have accessible names and keyboard
  behavior.

### Runtime verification

- create or inspect a local response that uses RAG and a tool;
- verify its diagnostic payload is persisted and returned locally;
- inspect desktop 1440×900 and mobile 390×844 for overflow and readability;
- verify Next.js `get_compilation_issues` and `get_errors` are empty;
- run lint, targeted tests, the full unit suite, and a production build;
- exercise a production-mode serialization test proving raw diagnostics are
  absent.

## Non-goals

- exposing rich diagnostics to end users outside local development;
- changing RAG policy, similarity thresholds, ranking, or prompt composition;
- changing tool authorization or tool behavior;
- adding another classifier or model call;
- storing raw diagnostics in PostHog or application logs;
- retroactively reconstructing raw data for historical messages.

## Acceptance Criteria

The feature is complete when a local developer can explain a RAG/tool-assisted
response from the profiler alone: which query ran, which evidence was supplied,
which tools ran with which values, when each action occurred, and how each action
ended. The same raw fields must be absent by construction in preview and
production paths, while existing aggregate telemetry continues to work.
