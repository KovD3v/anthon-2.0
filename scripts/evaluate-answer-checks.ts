import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  ANSWER_CHECK_IDS,
  assertAnswerCheckComparisonInputs,
  compareAnswerCheckLabels,
  compareAnswerCheckReports,
  evaluateAnswerChecks,
  formatAnswerCheckReport,
  readSavedAnswerTurns,
} from "../src/lib/benchmark/answer-checks";
import { CONVERSATIONAL_REALITY_SCENARIOS } from "../src/lib/benchmark/conversation-scenarios";
import { ANSWER_CHECK_FIXTURES } from "../src/lib/benchmark/fixtures/answer-checks";
import { PRELAUNCH_REALITY_SCENARIOS } from "../src/lib/benchmark/reality";

const usage = `Usage: bun run scripts/evaluate-answer-checks.ts [options]

No arguments: validate and list the synthetic evaluation plan without model calls.
--live                         Opt in to sending selected answers to OpenRouter.
--input PATH                   Saved Reality results or conversation run/answers.
--candidate PATH               Optional candidate run, compared to --input.
--model ID                     Select one answer model in --input.
--candidate-model ID           Select one answer model in --candidate.
--input-scope synthetic|approved-review  Required for supplied files.
--review-project ID            Required for approved real-user quality-review input.
--max-calls N                  Maximum planned evaluator calls, default 60.
--output PATH                  Write metadata-only JSON report; file must not exist.
--help                         Show this help.

Each available answer uses one request containing four typed checks. No database is
read or written. Use only authorized files. Real-user content requires an approved,
unexpired ADR-0025 quality-review project; a CLI label does not grant access.
Reports exclude answer text. Synthetic labels test report logic, not model accuracy.
`;

async function main() {
  const { values } = parseArgs({
    options: {
      live: { type: "boolean" },
      help: { type: "boolean" },
      input: { type: "string" },
      candidate: { type: "string" },
      model: { type: "string" },
      "candidate-model": { type: "string" },
      "input-scope": { type: "string" },
      "review-project": { type: "string" },
      "max-calls": { type: "string", default: "60" },
      output: { type: "string" },
    },
    strict: true,
  });
  if (values.help) {
    console.info(usage);
    return;
  }
  if (values.candidate && !values.input)
    throw new Error("--candidate requires --input.");
  const scope = values.input ? values["input-scope"] : "synthetic";
  if (scope !== "synthetic" && scope !== "approved-review")
    throw new Error(
      "Supplied files require --input-scope synthetic or approved-review.",
    );
  if (scope === "approved-review" && !values["review-project"]?.trim())
    throw new Error("Approved review input requires --review-project.");
  const maxCalls = Number(values["max-calls"]);
  if (!Number.isSafeInteger(maxCalls) || maxCalls < 1)
    throw new Error("--max-calls must be a positive integer.");
  const scenarios =
    scope === "synthetic"
      ? [...PRELAUNCH_REALITY_SCENARIOS, ...CONVERSATIONAL_REALITY_SCENARIOS]
      : [];
  const load = async (file: string, modelId?: string) => {
    let value: unknown;
    try {
      value = JSON.parse(await readFile(file, "utf8"));
    } catch {
      throw new Error("Could not read input as a JSON benchmark artifact.");
    }
    return readSavedAnswerTurns(value, { scenarios, modelId });
  };
  const baselineTurns = values.input
    ? await load(values.input, values.model)
    : ANSWER_CHECK_FIXTURES.map((fixture) => fixture.turn);
  const candidateTurns = values.candidate
    ? await load(values.candidate, values["candidate-model"])
    : null;
  if (candidateTurns)
    assertAnswerCheckComparisonInputs(baselineTurns, candidateTurns);
  const turns = [...baselineTurns, ...(candidateTurns ?? [])];
  const plannedCalls = turns.filter((turn) => turn.answerAvailable).length;
  if (plannedCalls > maxCalls)
    throw new Error(
      `Planned calls (${plannedCalls}) exceed --max-calls (${maxCalls}). Select a model or set an explicit larger budget.`,
    );
  const plan = {
    mode: "dry-run",
    sourceScope: scope,
    turns: turns.length,
    plannedCalls,
    checkIds: ANSWER_CHECK_IDS,
    incompleteHistoryTurns: turns.filter((turn) => !turn.historyComplete)
      .length,
    incompletePersonalContextTurns: turns.filter(
      (turn) => !turn.personalContextComplete,
    ).length,
    unavailableAnswers: turns.filter((turn) => !turn.answerAvailable).length,
    limitations: "No evaluator calls made. No model-quality result exists.",
  };
  if (!values.live) {
    console.info(JSON.stringify(plan, null, 2));
    return;
  }
  if (!process.env.OPENROUTER_API_KEY)
    throw new Error("OPENROUTER_API_KEY is required for --live.");
  const baseline = await evaluateAnswerChecks(baselineTurns);
  const candidate = candidateTurns
    ? await evaluateAnswerChecks(candidateTurns)
    : null;
  const report = {
    sourceScope: scope,
    reviewProject: values["review-project"] ?? null,
    baseline,
    candidate,
    comparison: candidate
      ? compareAnswerCheckReports(baseline, candidate)
      : null,
    labels: values.input
      ? null
      : compareAnswerCheckLabels(baseline, ANSWER_CHECK_FIXTURES),
  };
  if (values.output)
    await writeFile(values.output, `${JSON.stringify(report, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
  console.info(formatAnswerCheckReport(baseline));
  if (report.labels) console.info(JSON.stringify(report.labels, null, 2));
  if (candidate) {
    console.info("Candidate:");
    console.info(formatAnswerCheckReport(candidate));
    console.info(JSON.stringify(report.comparison, null, 2));
  }
  if (baseline.summary.failedTurns || candidate?.summary.failedTurns)
    process.exitCode = 1;
}

main().catch((error: unknown) => {
  // Zod issues and unknown exceptions can contain supplied content. Print only
  // explicit CLI errors; never include provider bodies, file content or secrets.
  console.error(
    error instanceof Error && error.constructor === Error
      ? error.message
      : "Invalid answer-check input or arguments.",
  );
  process.exitCode = 1;
});
