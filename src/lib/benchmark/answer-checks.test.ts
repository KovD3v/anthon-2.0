import { describe, expect, it, vi } from "vitest";
import type { TypedDecisionsResult } from "@/lib/ai/typed-decisions";
import {
  ANSWER_CHECK_IDS,
  ANSWER_CHECK_QUESTIONS,
  type AnswerCheckChoice,
  type AnswerCheckId,
  assertAnswerCheckComparisonInputs,
  compareAnswerCheckLabels,
  compareAnswerCheckReports,
  evaluateAnswerChecks,
  formatAnswerCheckReport,
  readSavedAnswerTurns,
} from "./answer-checks";
import { ANSWER_CHECK_FIXTURES } from "./fixtures/answer-checks";
import type { RealityScenario } from "./reality";

const turn = ANSWER_CHECK_FIXTURES[0].turn;
const choices = (
  choice: AnswerCheckChoice,
): Record<AnswerCheckId, AnswerCheckChoice> =>
  Object.fromEntries(ANSWER_CHECK_IDS.map((id) => [id, choice])) as Record<
    AnswerCheckId,
    AnswerCheckChoice
  >;
const success = (
  labels = choices("clear"),
  confidence = 0.95,
): TypedDecisionsResult => ({
  ok: true,
  modelId: "typesafe/served-snapshot",
  attempted: true,
  durationMs: 120,
  usage: { input_tokens: 350, output_tokens: 35, cost: 0.000012 },
  answers: Object.fromEntries(
    ANSWER_CHECK_IDS.map((id) => [id, { choice: labels[id], confidence }]),
  ),
});

const scenario: RealityScenario = {
  id: "known",
  title: "Synthetic",
  persona: "Fictional person",
  tags: [],
  setup: { profile: { sport: "tennis" } },
  turns: [
    { userMessage: "Gioco a tennis.", requiredSignals: [] },
    { userMessage: "Mi agito sul servizio.", requiredSignals: [] },
  ],
};
const row = (index: number, modelId = "model-a") => ({
  scenarioId: scenario.id,
  modelId,
  turnIndex: index,
  userMessage: scenario.turns[index].userMessage,
  assistantText: `${modelId} answer ${index}`,
});

describe("offline answer checks", () => {
  it("batches four narrow checks once per turn and blinds the model to IDs and labels", async () => {
    const request = vi.fn().mockResolvedValue(success());
    await evaluateAnswerChecks([turn], { request });
    expect(request).toHaveBeenCalledTimes(1);
    const input = request.mock.calls[0][0];
    expect(Object.keys(input.questions)).toEqual(ANSWER_CHECK_IDS);
    expect(input.questions).toEqual(ANSWER_CHECK_QUESTIONS);
    expect(input.state).toEqual({
      previousMessages: turn.transcript,
      userMessage: turn.userMessage,
      candidateAnswer: turn.assistantText,
      personalContext: turn.personalContext,
      historyComplete: true,
      personalContextComplete: true,
    });
    expect(input.state).not.toHaveProperty("expected");
    expect(input.state).not.toHaveProperty("modelId");
    expect(input.state).not.toHaveProperty("scenarioId");
    expect(ANSWER_CHECK_QUESTIONS.repeated_question.instructions).toContain(
      "no one-question limit",
    );
    expect(
      ANSWER_CHECK_QUESTIONS.unsupported_personal_fact.instructions,
    ).toContain("earlier assistant claims do not establish personal facts");
  });

  it("replays synthetic fixture labels to verify report arithmetic, not model accuracy", async () => {
    const request = vi.fn();
    for (const fixture of ANSWER_CHECK_FIXTURES)
      request.mockResolvedValueOnce(success(fixture.expected));
    const report = await evaluateAnswerChecks(
      ANSWER_CHECK_FIXTURES.map((fixture) => fixture.turn),
      { request },
    );
    expect(request).toHaveBeenCalledTimes(11);
    expect(report.summary).toMatchObject({
      turns: 11,
      flaggedTurns: 4,
      uncertainTurns: 1,
      failedTurns: 0,
      attemptedCalls: 11,
      knownCostCalls: 11,
      unknownCostCalls: 0,
    });
    expect(report.summary.checks.repeated_question).toEqual({
      total: 11,
      decidedApplicable: 4,
      flagged: 1,
      clear: 3,
      not_applicable: 7,
      uncertain: 0,
      failed: 0,
    });
    expect(report.summary.checks.unsupported_personal_fact).toEqual({
      total: 11,
      decidedApplicable: 3,
      flagged: 2,
      clear: 1,
      not_applicable: 7,
      uncertain: 1,
      failed: 0,
    });
    expect(report.summary.checks.unaddressed_request).toMatchObject({
      flagged: 1,
      clear: 2,
      decidedApplicable: 3,
    });
    expect(report.summary.providerReportedCostUsd).toBeCloseTo(0.000132, 10);
    expect(report.summary.latencyMs).toEqual({
      p50: 120,
      p95: 120,
      total: 1320,
    });
    expect(formatAnswerCheckReport(report)).toContain(
      "flagged 1/4 decided applicable",
    );
    expect(JSON.stringify(report)).not.toContain(turn.assistantText);
    expect(report.results[0].evaluator.modelId).toBe(
      "typesafe/served-snapshot",
    );
  });

  it("retains low-confidence raw choices but reports uncertainty, including low-confidence N/A", async () => {
    const report = await evaluateAnswerChecks([turn], {
      request: async () => success(choices("not_applicable"), 0.6),
    });
    expect(report.results[0].checks.repeated_question).toEqual({
      status: "uncertain",
      choice: "not_applicable",
      confidence: 0.6,
    });
    expect(report.summary.checks.repeated_question).toMatchObject({
      decidedApplicable: 0,
      not_applicable: 0,
      uncertain: 1,
    });
  });

  it("compares fixture labels with decided denominators and distinct abstention/failure counts", async () => {
    const fixtures = ANSWER_CHECK_FIXTURES.slice(0, 4);
    const request = vi
      .fn()
      .mockResolvedValueOnce(success(fixtures[0].expected))
      .mockResolvedValueOnce(success(choices("flagged")))
      .mockResolvedValueOnce(success(choices("uncertain")))
      .mockResolvedValueOnce({
        ok: false,
        failureCode: "timeout",
        attempted: true,
        durationMs: 1000,
        modelId: "jev",
      });
    const report = await evaluateAnswerChecks(
      fixtures.map((fixture) => fixture.turn),
      { request },
    );
    const labels = compareAnswerCheckLabels(report, fixtures);
    expect(labels.checks.repeated_question).toEqual({
      labeled: 4,
      decided: 2,
      matched: 1,
      mismatched: 1,
      uncertain: 1,
      failed: 1,
      expectedUncertain: 0,
      expectedUncertainReturned: 0,
    });
    expect(labels.disagreements).toContainEqual({
      scenarioId: fixtures[1].turn.scenarioId,
      turnIndex: 0,
      sampleId: "sample-1",
      check: "repeated_question",
      expected: "clear",
      actual: "flagged",
    });
    expect(
      labels.disagreements.some((result) =>
        ["uncertain", "failed"].includes(result.actual),
      ),
    ).toBe(false);
  });

  it("keeps failed calls and unknown costs out of clear/N/A denominators", async () => {
    const noCost = success();
    delete noCost.usage;
    const free = success();
    free.usage = { cost: 0 };
    const responses: TypedDecisionsResult[] = [
      noCost,
      free,
      {
        ok: false,
        failureCode: "provider_error",
        attempted: true,
        modelId: "jev",
        durationMs: 180,
        usage: { cost: 0.00002 },
      },
      {
        ok: false,
        failureCode: "timeout",
        attempted: true,
        modelId: "jev",
        durationMs: 1000,
      },
      {
        ok: false,
        failureCode: "configuration_error",
        attempted: false,
        modelId: "jev",
        durationMs: 0,
      },
    ];
    const request = vi.fn();
    for (const response of responses) request.mockResolvedValueOnce(response);
    const report = await evaluateAnswerChecks(
      responses.map((_, index) => ({ ...turn, turnIndex: index })),
      { request },
    );
    expect(report.summary).toMatchObject({
      turns: 5,
      failedTurns: 3,
      attemptedCalls: 4,
      notAttemptedCalls: 1,
      knownCostCalls: 2,
      unknownCostCalls: 2,
      providerReportedCostUsd: 0.00002,
    });
    expect(report.summary.checks.repeated_question).toMatchObject({
      total: 5,
      clear: 2,
      failed: 3,
      decidedApplicable: 2,
      uncertain: 0,
      not_applicable: 0,
    });
    expect(report.summary.latencyMs).toEqual({
      p50: 120,
      p95: 1000,
      total: 1420,
    });
    expect(report.results[0].evaluator).toMatchObject({
      costSource: "unknown",
      costUsd: null,
    });
    expect(report.results[1].evaluator).toMatchObject({
      costSource: "provider_reported",
      costUsd: 0,
    });
    expect(report.results[4].evaluator).toMatchObject({
      costSource: "not_attempted",
      costUsd: null,
    });
  });

  it("preserves observed cost on invalid typed output and never generates explanations", async () => {
    const response = success();
    if (!response.ok) throw new Error("Test setup");
    delete response.answers.ignored_correction;
    const report = await evaluateAnswerChecks([turn], {
      request: async () => response,
    });
    expect(report.results[0].failureCode).toBe("invalid_output");
    expect(report.summary.knownCostCalls).toBe(1);
    expect(
      Object.values(report.results[0].checks).every(
        (check) => check.status === "failed",
      ),
    ).toBe(true);
    expect(report.results[0]).not.toHaveProperty("reasoning");
  });

  it("contains boundary exceptions without copying their message into the report", async () => {
    const report = await evaluateAnswerChecks([turn], {
      request: async () => {
        throw new Error("secret provider body");
      },
    });
    expect(report.results[0].failureCode).toBe("request_failed");
    expect(report.summary.unknownCostCalls).toBe(1);
    expect(JSON.stringify(report)).not.toContain("secret provider body");
  });

  it("does not call the judge for a failed saved generation or aborted input", async () => {
    const request = vi.fn();
    const report = await evaluateAnswerChecks(
      [{ ...turn, answerAvailable: false }, turn],
      { request, abortSignal: AbortSignal.abort() },
    );
    expect(request).not.toHaveBeenCalled();
    expect(report.results.map((result) => result.failureCode)).toEqual([
      "answer_unavailable",
      "aborted",
    ]);
    expect(report.summary).toMatchObject({
      turns: 2,
      failedTurns: 2,
      attemptedCalls: 0,
      notAttemptedCalls: 2,
      unknownCostCalls: 0,
    });
    expect(report.summary.latencyMs).toEqual({
      p50: null,
      p95: null,
      total: 0,
    });
  });
});

describe("saved benchmark input", () => {
  it("reconstructs the same model/scenario transcript in turn order, without arbitrary metadata", () => {
    const turns = readSavedAnswerTurns(
      {
        results: [
          row(1),
          row(0, "other-model"),
          { ...row(0), metadata: { tracePayload: "not evidence" } },
        ],
      },
      { scenarios: [scenario], modelId: "model-a" },
    );
    expect(turns).toHaveLength(2);
    expect(turns[0].transcript).toEqual([
      { role: "user", content: "Gioco a tennis." },
      { role: "assistant", content: "model-a answer 0" },
    ]);
    expect(turns[0]).toMatchObject({
      historyComplete: true,
      personalContextComplete: true,
      personalContext: scenario.setup,
    });
    expect(JSON.stringify(turns)).not.toContain("tracePayload");
    expect(JSON.stringify(turns)).not.toContain("other-model");
  });

  it("keeps independent conversation samples apart and consumes summaries only once", () => {
    const turns = readSavedAnswerTurns(
      {
        modelId: "model-a",
        summaries: [
          { results: [row(0), row(1)] },
          { results: [{ ...row(0), assistantText: "second sample" }, row(1)] },
        ],
        replicas: [{ ...row(0), assistantText: "duplicate replica" }],
      },
      { scenarios: [scenario] },
    );
    expect(turns).toHaveLength(4);
    expect(turns[3].sampleId).toBe("sample-2");
    expect(turns[3].transcript[1].content).toBe("second sample");
    expect(turns[1].transcript[1].content).toBe("model-a answer 0");
  });

  it("accepts answer-only replicas but marks missing history as incomplete", () => {
    const turns = readSavedAnswerTurns(
      {
        replicas: [
          {
            scenarioId: "known",
            turnIndex: 1,
            assistantText: "Che sport pratichi?",
          },
        ],
      },
      { scenarios: [scenario] },
    );
    expect(turns[0]).toMatchObject({
      userMessage: scenario.turns[1].userMessage,
      transcript: [],
      historyComplete: false,
      personalContextComplete: false,
    });
  });

  it("keeps absent personal context uncertain and rejects scenario drift", () => {
    const [unknown] = readSavedAnswerTurns({ results: [row(0)] });
    expect(unknown).toMatchObject({
      personalContext: {},
      personalContextComplete: false,
      historyComplete: true,
    });
    const [changed] = readSavedAnswerTurns(
      { results: [{ ...row(0), userMessage: "A changed task" }] },
      { scenarios: [scenario] },
    );
    expect(changed).toMatchObject({
      personalContext: {},
      personalContextComplete: false,
    });
    const changedHistory = readSavedAnswerTurns(
      { results: [{ ...row(0), userMessage: "Gioco a calcio." }, row(1)] },
      { scenarios: [scenario] },
    );
    expect(changedHistory[1].personalContextComplete).toBe(false);
  });

  it("preserves supplied transcripts and excludes failed prior answers", () => {
    const transcript = [{ role: "user", content: "User evidence" }];
    const [explicit] = readSavedAnswerTurns(
      { results: [{ ...row(1), transcript }] },
      { scenarios: [scenario] },
    );
    expect(explicit.transcript).toEqual(transcript);
    expect(explicit).toMatchObject({
      historyComplete: false,
      personalContextComplete: false,
    });
    const [empty] = readSavedAnswerTurns(
      { results: [{ ...row(1), transcript: [] }] },
      { scenarios: [scenario] },
    );
    expect(empty.historyComplete).toBe(false);
    const [complete] = readSavedAnswerTurns(
      {
        results: [
          {
            ...row(1),
            transcript: [
              { role: "user", content: scenario.turns[0].userMessage },
              { role: "assistant", content: "A prior answer" },
            ],
          },
        ],
      },
      { scenarios: [scenario] },
    );
    expect(complete).toMatchObject({
      historyComplete: true,
      personalContextComplete: true,
    });
    const [failed, next] = readSavedAnswerTurns({
      results: [{ ...row(0), metadata: { benchmarkError: true } }, row(1)],
    });
    expect(failed.answerAvailable).toBe(false);
    expect(next.historyComplete).toBe(false);
    expect(next.transcript).toEqual([
      { role: "user", content: scenario.turns[0].userMessage },
    ]);
  });

  it("rejects missing messages, empty selections and ambiguous duplicate results", () => {
    expect(() =>
      readSavedAnswerTurns({
        replicas: [
          { scenarioId: "missing", turnIndex: 0, assistantText: "answer" },
        ],
      }),
    ).toThrow("missing its user message");
    expect(() =>
      readSavedAnswerTurns({ results: [row(0)] }, { modelId: "absent" }),
    ).toThrow("No saved answers");
    expect(() => readSavedAnswerTurns({ results: [row(0), row(0)] })).toThrow(
      "Ambiguous duplicate",
    );
  });
});

describe("answer-check comparison", () => {
  it("validates the matched user task and history before any evaluator calls", () => {
    expect(() =>
      assertAnswerCheckComparisonInputs(
        [turn],
        [{ ...turn, userMessage: "A different request" }],
      ),
    ).toThrow("different user messages");
    expect(() =>
      assertAnswerCheckComparisonInputs([turn], [{ ...turn, transcript: [] }]),
    ).toThrow("different user messages");
    expect(() =>
      assertAnswerCheckComparisonInputs(
        [turn],
        [{ ...turn, modelId: "candidate" }],
      ),
    ).not.toThrow();
    expect(() =>
      assertAnswerCheckComparisonInputs(
        [{ ...turn, sampleId: "unpaired-1" }],
        [],
      ),
    ).toThrow("explicit replica IDs");
  });

  it("pairs unique answer artifacts by scenario and turn regardless of array order", () => {
    const input = { replicas: [row(0), row(1)] };
    const baseline = readSavedAnswerTurns(input);
    const candidate = readSavedAnswerTurns({
      replicas: [...input.replicas].reverse(),
    });
    expect(baseline.every((value) => value.sampleId === "sample-1")).toBe(true);
    expect(() =>
      assertAnswerCheckComparisonInputs(baseline, candidate),
    ).not.toThrow();
  });

  it("matches scenario/turn/sample, counts unmatched rows, and never compares uncertainty as clear", async () => {
    const leftRequest = vi
      .fn()
      .mockResolvedValueOnce(success(choices("flagged")))
      .mockResolvedValueOnce(success(choices("clear")));
    const baseline = await evaluateAnswerChecks(
      [turn, { ...turn, turnIndex: 3 }],
      { request: leftRequest },
    );
    const rightRequest = vi
      .fn()
      .mockResolvedValueOnce(success(choices("uncertain")))
      .mockResolvedValueOnce(success(choices("clear")));
    const candidate = await evaluateAnswerChecks(
      [
        { ...turn, turnIndex: 4 },
        { ...turn, modelId: "candidate" },
      ],
      { request: rightRequest },
    );
    const comparison = compareAnswerCheckReports(baseline, candidate);
    expect(comparison).toMatchObject({
      matchedTurns: 1,
      baselineOnlyTurns: 1,
      candidateOnlyTurns: 1,
    });
    expect(comparison.checks.repeated_question).toEqual({
      comparablePairs: 1,
      notComparablePairs: 0,
      introducedFlags: 0,
      resolvedFlags: 1,
    });
    const uncertain = await evaluateAnswerChecks([turn], {
      request: async () => success(choices("uncertain")),
    });
    expect(
      compareAnswerCheckReports(baseline, uncertain).checks.repeated_question,
    ).toMatchObject({
      comparablePairs: 0,
      notComparablePairs: 1,
      resolvedFlags: 0,
    });
  });

  it("counts a new repeated question after an N/A answer as an introduced flag", async () => {
    const baseline = await evaluateAnswerChecks([turn], {
      request: async () => success(choices("not_applicable")),
    });
    const candidate = await evaluateAnswerChecks([turn], {
      request: async () => success(choices("flagged")),
    });
    expect(
      compareAnswerCheckReports(baseline, candidate).checks.repeated_question,
    ).toMatchObject({ comparablePairs: 1, introducedFlags: 1 });
  });

  it("rejects ambiguous model pairs", async () => {
    const report = await evaluateAnswerChecks(
      [turn, { ...turn, modelId: "other-model" }],
      { request: async () => success() },
    );
    expect(() => compareAnswerCheckReports(report, report)).toThrow(
      "one model",
    );
  });
});
