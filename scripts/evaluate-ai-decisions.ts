// @ts-expect-error Bun supplies module mocks at runtime; the app uses Node types.
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";
import type { reviewMemoryCandidates } from "../src/lib/ai/memory-decisions";
import type {
  RetrievalDecisionOptions,
  refineRecallPlan,
} from "../src/lib/ai/retrieval-decisions";
import type { scheduleTypedDecisionUsage } from "../src/lib/ai/usage-meter";
import type {
  AnswerCheckChoice,
  AnswerCheckId,
  SavedAnswerTurn,
} from "../src/lib/benchmark/answer-checks";

export type DecisionFixtures = {
  split: string;
  memoryCases: Array<{
    id: string;
    expiryTimeZone?: string;
    input: Parameters<typeof reviewMemoryCandidates>[0];
    expected: Array<{
      reject: boolean;
      requiresApproval: boolean;
      match?: { kind: "equivalent" | "correction"; factId: string };
    }>;
  }>;
  planningCases: Array<{
    id: string;
    input: Parameters<typeof refineRecallPlan>[0];
    expected: {
      conversationsEnabled: boolean;
      allowCrossChannel: boolean;
      rawChoice: "recall" | "self_contained" | "uncertain";
    };
  }>;
  rankingCases: Array<{
    id: string;
    input: RetrievalDecisionOptions & {
      query: string;
      source: "memory" | "document";
      items: Array<{
        id: string;
        text: string;
        subject?: "ACCOUNT_HOLDER" | "REFERENCED_PERSON";
      }>;
    };
    expected: {
      retainedIds: string[];
      rawChoices: Record<string, "relevant" | "irrelevant" | "uncertain">;
    };
  }>;
  answerFixtures: Array<{
    turn: SavedAnswerTurn;
    expected: Record<AnswerCheckId, AnswerCheckChoice>;
    targetCheck: AnswerCheckId;
    pairId: string;
  }>;
};

const { values } = parseArgs({
  options: {
    live: { type: "boolean" },
    output: { type: "string" },
    corpus: { type: "string", default: "fresh" },
  },
});
assert(
  ["fresh", "ready", "followup", "documents"].includes(values.corpus),
  "--corpus must be fresh, ready, followup or documents",
);
const root = fileURLToPath(new URL("../", import.meta.url));
const corpusText = readFileSync(
  new URL(
    `fixtures/ai-decisions-${values.corpus}-2026-09-20.json`,
    import.meta.url,
  ),
  "utf8",
);
// Fixed, synthetic repository fixtures; their application schemas are checked
// by ai-decisions-fresh.test.ts. This command accepts no external conversation.
const corpus: DecisionFixtures = JSON.parse(corpusText, (key, value) =>
  ["observedAt", "updatedAt", "expiresAt"].includes(key) &&
  typeof value === "string"
    ? new Date(value)
    : value,
);
const ids = [
  ...corpus.memoryCases.map((item) => item.id),
  ...corpus.planningCases.map((item) => item.id),
  ...corpus.rankingCases.map((item) => item.id),
  ...corpus.answerFixtures.map((item) => item.turn.scenarioId),
];
assert.equal(new Set(ids).size, ids.length, "Fixture IDs must be unique");
assert(ids.length > 0 && ids.length <= 80, "Expected 1–80 synthetic cases");
if (!values.live) {
  console.log(
    `${ids.length} synthetic cases. No model calls. Use --live --output NEW.jsonl to run.`,
  );
  process.exit(0);
}
assert(values.output, "--output must name a new JSONL file");
assert(process.env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY is required");
const output = values.output;
const hash = (text: string | Buffer) =>
  createHash("sha256").update(text).digest("hex");
const log = (record: unknown) =>
  appendFileSync(output, `${JSON.stringify(record)}\n`);
writeFileSync(
  output,
  `${JSON.stringify({
    type: "run",
    startedAt: new Date().toISOString(),
    split: corpus.split,
    syntheticOnly: true,
    maxRequests: ids.length,
    corpusSHA256: hash(corpusText),
    runnerSHA256: hash(readFileSync(fileURLToPath(import.meta.url))),
    sourceHashes: Object.fromEntries(
      [
        "ai/typed-decisions.ts",
        "ai/memory-decisions.ts",
        "ai/retrieval-decisions.ts",
        "benchmark/answer-checks.ts",
      ].map((file) => [file, hash(readFileSync(`${root}src/lib/${file}`))]),
    ),
    metering: "Mocked; raw provider usage journaled. Database access blocked.",
  })}\n`,
  { flag: "wx" },
);

process.env.AI_JEV_ALLOWED_USER_IDS = "synthetic-jev-live-eval";
process.env.AI_MEMORY_REVIEW_MODE = "active";
process.env.AI_RETRIEVAL_DECISIONS_MODE = "active";
const metered: Array<Parameters<typeof scheduleTypedDecisionUsage>[0]> = [];
mock.module(`${root}src/lib/ai/usage-meter.ts`, () => ({
  scheduleTypedDecisionUsage: (result: (typeof metered)[number]) =>
    metered.push(result),
}));
mock.module(`${root}src/lib/db.ts`, () => ({
  prisma: new Proxy(
    {},
    {
      get: () => {
        throw new Error("Database access forbidden in synthetic evaluation");
      },
    },
  ),
}));
mock.module(`${root}src/lib/logger/index.ts`, () => ({
  createLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
}));
let activeCase = "";
let calls = 0;
let knownCostUsd = 0;
let unknownCostCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  assert.equal(url.origin, "https://openrouter.ai");
  assert.equal(url.pathname, "/api/alpha/decisions");
  assert.equal(init?.method, "POST");
  assert(++calls <= ids.length, "Evaluation request cap reached");
  assert(typeof init?.body === "string", "Expected JSON request body");
  const call = calls;
  const started = performance.now();
  log({ type: "request", id: activeCase, call, body: JSON.parse(init.body) });
  try {
    const response = await originalFetch(input, { ...init, redirect: "error" });
    const raw = await response
      .clone()
      .json()
      .catch(() => null);
    const cost = raw?.usage?.cost;
    if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0)
      knownCostUsd += cost;
    else unknownCostCalls += 1;
    log({
      type: "response",
      id: activeCase,
      call,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      raw,
    });
    return response;
  } catch (error) {
    unknownCostCalls += 1;
    log({
      type: "request_error",
      id: activeCase,
      call,
      durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }
};
const memory = await import("../src/lib/ai/memory-decisions");
const retrieval = await import("../src/lib/ai/retrieval-decisions");
const answers = await import("../src/lib/benchmark/answer-checks");
async function run(
  id: string,
  kind: string,
  expected: unknown,
  execute: () => Promise<unknown>,
) {
  activeCase = id;
  const start = metered.length;
  const actual = await execute();
  const outcomeMatches = isDeepStrictEqual(actual, expected);
  log({
    type: "case",
    id,
    kind,
    expected,
    actual,
    outcomeMatches,
    transports: metered.slice(start),
  });
  console.log(JSON.stringify({ id, kind, outcomeMatches }));
}
for (const item of corpus.memoryCases)
  await run(item.id, "memory", item.expected, async () =>
    (
      await memory.reviewMemoryCandidates({
        ...item.input,
        userId: "synthetic-jev-live-eval",
      })
    ).map((result) => ({
      reject: result.reject,
      requiresApproval: result.requiresApproval,
      ...(result.match
        ? { match: { kind: result.match.kind, factId: result.match.fact.id } }
        : {}),
    })),
  );
for (const item of corpus.planningCases)
  await run(
    item.id,
    "planning",
    {
      conversationsEnabled: item.expected.conversationsEnabled,
      allowCrossChannel: item.expected.allowCrossChannel,
    },
    async () => {
      const result = await retrieval.refineRecallPlan({
        ...item.input,
        userId: "synthetic-jev-live-eval",
      });
      return {
        conversationsEnabled: result.conversations.enabled,
        allowCrossChannel: result.conversations.allowCrossChannel,
      };
    },
  );
for (const item of corpus.rankingCases)
  await run(item.id, "ranking", item.expected.retainedIds, async () =>
    (
      await retrieval.rankRetrievedItems({
        ...item.input,
        userId: "synthetic-jev-live-eval",
        describe: (item) => item.text,
        memorySubject: (item) => item.subject,
      })
    ).map((item) => item.id),
  );
for (const fixture of corpus.answerFixtures) {
  activeCase = fixture.turn.scenarioId;
  const report = await answers.evaluateAnswerChecks([fixture.turn]);
  const comparison = answers.compareAnswerCheckLabels(report, [fixture]);
  log({
    type: "case",
    id: activeCase,
    kind: "answer",
    targetCheck: fixture.targetCheck,
    expected: fixture.expected,
    report,
    comparison,
  });
  console.log(
    JSON.stringify({
      id: activeCase,
      kind: "answer",
      primary: report.results[0].checks[fixture.targetCheck].status,
      expected: fixture.expected[fixture.targetCheck],
    }),
  );
}
log({
  type: "complete",
  finishedAt: new Date().toISOString(),
  calls,
  knownCostUsd,
  unknownCostCalls,
});
console.log(JSON.stringify({ output, calls, knownCostUsd, unknownCostCalls }));
