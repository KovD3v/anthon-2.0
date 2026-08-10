import "dotenv/config";

import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  assertConversationDbMutationAllowed,
  CONVERSATION_BENCHMARK_USAGE,
  parseConversationBenchmarkArgs,
} from "../src/lib/benchmark/conversation-benchmark-cli";
import { judgeConversationPair } from "../src/lib/benchmark/conversation-benchmark-judge";
import {
  formatConversationComparisonReport,
  parseConversationRun,
  serializeConversationComparison,
  serializeConversationRun,
} from "../src/lib/benchmark/conversation-benchmark-report";
import {
  buildConversationComparison,
  runConversationVariant,
} from "../src/lib/benchmark/conversation-benchmark-runner";
import { CONVERSATIONAL_REALITY_SCENARIOS } from "../src/lib/benchmark/conversation-scenarios";
import { createDatabaseBackedRealityExecutor } from "../src/lib/benchmark/reality";
import {
  describeDatabaseTargets,
  sanitizeFileSegment,
} from "../src/lib/benchmark/reality-cli";

const execFile = promisify(execFileCallback);

async function main() {
  const config = parseConversationBenchmarkArgs(process.argv.slice(2));
  if (config.command === "help") {
    console.log(CONVERSATION_BENCHMARK_USAGE);
    return;
  }
  assertConversationDbMutationAllowed(config);
  const outputDir = path.resolve(config.outputDir);
  await mkdir(outputDir, { recursive: true });

  if (config.command === "compare") {
    const baseline = parseConversationRun(
      await readFile(path.resolve(config.baselinePath as string), "utf8"),
    );
    const candidate = parseConversationRun(
      await readFile(path.resolve(config.candidatePath as string), "utf8"),
    );
    const judges = config.judgeModels.map(
      (judgeModelId) =>
        async (input: {
          scenarioId: string;
          turnIndex: number;
          replicaId: string;
          answerA: string;
          answerB: string;
        }) => {
          const scenario = CONVERSATIONAL_REALITY_SCENARIOS.find(
            (item) => item.id === input.scenarioId,
          );
          if (!scenario)
            throw new Error(
              `Unknown conversation scenario ${input.scenarioId}`,
            );
          return judgeConversationPair({
            judgeModelId,
            scenario,
            turnIndex: input.turnIndex,
            transcript: scenario.turns
              .slice(0, input.turnIndex)
              .map((turn) => ({
                role: "user" as const,
                content: turn.userMessage,
              })),
            answerA: input.answerA,
            answerB: input.answerB,
          });
        },
    ) as Parameters<typeof buildConversationComparison>[0]["judges"];
    const comparison = await buildConversationComparison({
      baseline,
      candidate,
      judges,
    });
    const label = sanitizeFileSegment(
      config.label ?? `${baseline.label}-vs-${candidate.label}`,
    );
    const base = `conversation-${dateSegment()}-${label}-comparison`;
    const jsonPath = path.join(outputDir, `${base}.json`);
    const markdownPath = path.join(outputDir, `${base}.md`);
    await assertAbsent(jsonPath);
    await assertAbsent(markdownPath);
    await writeFile(
      jsonPath,
      serializeConversationComparison(comparison),
      "utf8",
    );
    await writeFile(
      markdownPath,
      `${formatConversationComparisonReport(comparison)}\n`,
      "utf8",
    );
    console.log(`Comparison JSON: ${jsonPath}`);
    console.log(`Comparison Markdown: ${markdownPath}`);
    console.log(`Judge cost: $${comparison.totalJudgeCostUsd.toFixed(6)}`);
    return;
  }

  if (process.env.VERCEL_ENV === "production") {
    throw new Error(
      "Conversational benchmark generation is forbidden in a Production runtime",
    );
  }
  const targets = describeDatabaseTargets();
  console.log(`Database target: ${JSON.stringify(targets.databaseUrl)}`);
  const baseline = config.baselinePath
    ? parseConversationRun(
        await readFile(path.resolve(config.baselinePath), "utf8"),
      )
    : null;
  const label = sanitizeFileSegment(
    config.label ?? `${baseline?.label ?? "run"}-candidate`,
  );
  const commit = (await execFile("git", ["rev-parse", "HEAD"])).stdout.trim();
  const configurationFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        scenarioVersion: "conversation-v1",
        model: "openai/gpt-5.6-luna",
        turnPlanner: process.env.AI_TURN_PLANNER_MODE ?? "v2",
        capabilityPlanner: process.env.AI_CAPABILITY_PLANNER_MODE ?? "default",
      }),
    )
    .digest("hex");
  const artifact = await runConversationVariant({
    variant: config.command,
    label,
    commit,
    samples: config.samples,
    configurationFingerprint,
    executorFactory: (replicaId) =>
      createDatabaseBackedRealityExecutor({
        runLabel: `${label}-${replicaId}`,
        isGuest: false,
        memoryEnabled: true,
        responseMode: "text",
      }),
  });
  if (baseline) {
    const { assertCompatibleConversationRuns } = await import(
      "../src/lib/benchmark/conversation-benchmark"
    );
    assertCompatibleConversationRuns(baseline, artifact);
  }
  const filePath = path.join(
    outputDir,
    `conversation-${dateSegment()}-${label}-${config.command}.json`,
  );
  await assertAbsent(filePath);
  await writeFile(filePath, serializeConversationRun(artifact), "utf8");
  const totalCost = artifact.replicas.reduce(
    (sum, replica) => sum + replica.metrics.costUsd,
    0,
  );
  console.log(`${config.command} artifact: ${filePath}`);
  console.log(`Candidate cost: $${totalCost.toFixed(6)}`);
}

function dateSegment() {
  return new Date().toISOString().slice(0, 10);
}

async function assertAbsent(filePath: string) {
  try {
    await access(filePath);
    throw new Error(`Refusing to overwrite existing artifact: ${filePath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

await main();
