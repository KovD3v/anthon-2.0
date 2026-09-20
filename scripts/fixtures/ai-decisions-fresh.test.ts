import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalizeKnowledgeCandidate } from "../../src/lib/ai/memory-canonicalization";
import { resolveMemoryExpiry } from "../../src/lib/ai/memory-expiry";
import { extractMemoryCandidates } from "../../src/lib/ai/memory-extractor";
import { planRecall } from "../../src/lib/ai/recall-planner";
import {
  rankRetrievedItems,
  refineRecallPlan,
} from "../../src/lib/ai/retrieval-decisions";
import { ANSWER_CHECK_IDS } from "../../src/lib/benchmark/answer-checks";
import type { DecisionFixtures } from "../evaluate-ai-decisions";

const mocks = vi.hoisted(() => ({ generateText: vi.fn(), request: vi.fn() }));
vi.mock("ai", () => ({ generateText: mocks.generateText }));
vi.mock("@/lib/ai/memory-candidate-gate", () => ({
  shouldExtractMemory: async () => true,
}));
vi.mock("@/lib/ai/providers/openrouter", () => ({
  subAgentModel: "mock",
  SUB_AGENT_MODEL_ID: "mock",
}));
vi.mock("@/lib/ai/usage-meter", () => ({
  trackSupportAiUsage: async () => {},
  scheduleTypedDecisionUsage() {},
}));
vi.mock("@/lib/ai/cost-attribution", () => ({
  recordAiOperationFailure: async () => {},
}));
vi.mock("@/lib/db", () => {
  throw new Error("Fixture tests must not import the database");
});
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
}));
vi.mock("@/lib/ai/typed-decisions", async (original) => ({
  ...(await original<typeof import("../../src/lib/ai/typed-decisions")>()),
  requestTypedDecisions: mocks.request,
}));

const corpus: DecisionFixtures = JSON.parse(
  readFileSync(
    new URL("./ai-decisions-fresh-2026-09-20.json", import.meta.url),
    "utf8",
  ),
  (key, value) =>
    ["observedAt", "updatedAt", "expiresAt"].includes(key) &&
    typeof value === "string"
      ? new Date(value)
      : value,
);
const response = (choices: Record<string, string>) => ({
  ok: true,
  modelId: "mock",
  attempted: false,
  durationMs: 0,
  answers: Object.fromEntries(
    Object.entries(choices).map(([key, choice]) => [
      key,
      { choice, confidence: 1, probability: 1 },
    ]),
  ),
});

// These are parser, routing and fixture-integrity checks. They do not measure
// model quality; evaluate-ai-decisions.ts performs the separate paid live run.
describe("fresh synthetic decision fixtures", () => {
  beforeEach(() => {
    vi.stubEnv("AI_JEV_ALLOWED_USER_IDS", "synthetic-jev-live-eval");
    vi.stubEnv("AI_RETRIEVAL_DECISIONS_MODE", "active");
    vi.stubGlobal("fetch", () => {
      throw new Error("Live calls forbidden in unit tests");
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("keeps 66 distinct cases and balanced answer pairs", () => {
    expect(corpus.memoryCases).toHaveLength(16);
    expect(corpus.memoryCases.flatMap((item) => item.expected)).toHaveLength(
      24,
    );
    expect(corpus.planningCases).toHaveLength(12);
    expect(corpus.rankingCases).toHaveLength(6);
    expect(corpus.answerFixtures).toHaveLength(32);
    const ids = [
      ...corpus.memoryCases,
      ...corpus.planningCases,
      ...corpus.rankingCases,
    ]
      .map((item) => item.id)
      .concat(corpus.answerFixtures.map((item) => item.turn.scenarioId));
    expect(new Set(ids).size).toBe(66);
    const pairs = Map.groupBy(
      corpus.answerFixtures,
      (fixture) => fixture.pairId,
    );
    expect(pairs.size).toBe(16);
    for (const pair of pairs.values()) {
      expect(pair).toHaveLength(2);
      expect(pair[0].targetCheck).toBe(pair[1].targetCheck);
      expect(
        pair.filter(
          (fixture) => fixture.expected[fixture.targetCheck] === "flagged",
        ),
      ).toHaveLength(1);
    }
    for (const fixture of corpus.answerFixtures) {
      expect(Object.keys(fixture.expected).sort()).toEqual(
        [...ANSWER_CHECK_IDS].sort(),
      );
      for (const label of Object.values(fixture.expected))
        expect(["flagged", "clear", "not_applicable", "uncertain"]).toContain(
          label,
        );
      expect(fixture.turn.answerAvailable).toBe(true);
      expect(typeof fixture.turn.historyComplete).toBe("boolean");
      expect(typeof fixture.turn.personalContextComplete).toBe("boolean");
      expect(fixture.turn.userMessage.trim()).not.toBe("");
      expect(fixture.turn.assistantText.trim()).not.toBe("");
    }
  });

  it.each(corpus.memoryCases)(
    "$id parses through the actual extractor",
    async ({ input, expected, expiryTimeZone }) => {
      const facts = input.candidates.map((item) => item.candidate);
      expect(facts).toHaveLength(expected.length);
      mocks.generateText.mockResolvedValue({
        text: JSON.stringify({ facts }),
        usage: {},
      });
      expect(
        await extractMemoryCandidates({
          userId: input.userId,
          userText: input.userText,
          assistantText: "",
        }),
      ).toEqual(facts);
      for (const item of input.candidates) {
        const canonical = canonicalizeKnowledgeCandidate(item.candidate);
        expect(canonical).not.toBeNull();
        if (item.candidate.subject === "ACCOUNT_HOLDER")
          expect(item.canonical).toEqual(canonical);
        else {
          expect(item.candidate.key).not.toMatch(/^person_/);
          expect(item.canonical.key).toMatch(
            new RegExp(`^person_.+_${canonical?.key}$`),
          );
          expect(item.canonical.value).toContain(`: ${canonical?.value}`);
          expect(item.canonical.value).toContain(
            item.candidate.subjectName ?? item.candidate.subjectRelationship,
          );
        }
        if (item.candidate.expiry)
          expect(
            resolveMemoryExpiry({
              expiry: item.candidate.expiry,
              sourceText: input.userText,
              observedAt: input.observedAt,
              now: input.observedAt,
              timeZone: expiryTimeZone,
            }),
          ).toEqual(item.expiresAt);
      }
    },
  );

  it.each(corpus.planningCases)(
    "$id reaches the semantic planner with the real deterministic plan",
    async ({ input, expected }) => {
      const plan = planRecall({
        message: input.message,
        decision: input.decision,
        isGuest: false,
      });
      expect(plan).toEqual(input.plan);
      mocks.request.mockResolvedValue(response({ recall: expected.rawChoice }));
      const actual = await refineRecallPlan({ ...input, plan });
      expect(mocks.request).toHaveBeenCalledTimes(1);
      expect(actual.conversations.enabled).toBe(expected.conversationsEnabled);
      expect(actual.conversations.allowCrossChannel).toBe(false);
      const state = mocks.request.mock.calls[0][0].state;
      expect(Object.keys(state).sort()).toEqual(["message", "recentMessages"]);
    },
  );

  it.each(corpus.rankingCases)(
    "$id preserves the labeled retention contract",
    async ({ input, expected }) => {
      expect(Object.keys(expected.rawChoices)).toEqual(
        input.items.map((_, index) => `candidate_${index}`),
      );
      mocks.request.mockResolvedValue(response(expected.rawChoices));
      expect(
        (
          await rankRetrievedItems({ ...input, describe: (item) => item.text })
        ).map((item) => item.id),
      ).toEqual(expected.retainedIds);
      const state = mocks.request.mock.calls[0][0].state;
      expect(Object.keys(state).sort()).toEqual([
        "candidates",
        "query",
        "recentMessages",
        "source",
      ]);
      expect(
        state.candidates.every(
          (item: { text: string }) => item.text.length <= 1200,
        ),
      ).toBe(true);
    },
  );
});
