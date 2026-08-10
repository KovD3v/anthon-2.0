import { DEFAULT_REALITY_JUDGE_MODELS } from "./reality-judge";

export type ConversationBenchmarkCliConfig = {
  command: "baseline" | "candidate" | "compare" | "help";
  label: string | null;
  samples: number;
  baselinePath: string | null;
  candidatePath: string | null;
  outputDir: string;
  judge: boolean;
  judgeModels: string[];
  pairConcurrency: number;
  allowDbMutation: boolean;
};

export function parseConversationBenchmarkArgs(
  argv: string[],
): ConversationBenchmarkCliConfig {
  if (argv[0] === "--help" || argv[0] === "-h") return defaults("help");
  const command = argv[0];
  if (!command || !["baseline", "candidate", "compare"].includes(command)) {
    throw new Error("A baseline, candidate, or compare command is required");
  }
  const config = defaults(command as ConversationBenchmarkCliConfig["command"]);
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for ${arg}`);
      return value;
    };
    if (arg === "--label") config.label = next();
    else if (arg === "--samples") config.samples = Number(next());
    else if (arg === "--baseline") config.baselinePath = next();
    else if (arg === "--candidate") config.candidatePath = next();
    else if (arg === "--output-dir") config.outputDir = next();
    else if (arg === "--concurrency") config.pairConcurrency = Number(next());
    else if (arg === "--judge-models")
      config.judgeModels = next()
        .split(",")
        .map((v) => v.trim());
    else if (arg === "--judge") config.judge = true;
    else if (arg === "--allow-db-mutation") config.allowDbMutation = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(config.samples) || config.samples < 1)
    throw new Error("samples must be a positive integer");
  if (!Number.isInteger(config.pairConcurrency) || config.pairConcurrency < 1)
    throw new Error("concurrency must be a positive integer");
  if (config.command === "baseline" && !config.label)
    throw new Error("baseline requires --label");
  if (config.command === "candidate" && !config.baselinePath)
    throw new Error("candidate requires --baseline");
  if (
    config.command === "compare" &&
    (!config.baselinePath || !config.candidatePath)
  )
    throw new Error("compare requires --baseline and --candidate");
  if (config.command === "compare" && !config.judge)
    throw new Error("compare requires --judge");
  if (config.judgeModels.length !== 2 || new Set(config.judgeModels).size !== 2)
    throw new Error("exactly two distinct judge models are required");
  return config;
}

function defaults(
  command: ConversationBenchmarkCliConfig["command"],
): ConversationBenchmarkCliConfig {
  return {
    command,
    label: null,
    samples: 3,
    baselinePath: null,
    candidatePath: null,
    outputDir: "docs/benchmarks/runs",
    judge: false,
    judgeModels: [...DEFAULT_REALITY_JUDGE_MODELS],
    pairConcurrency: 4,
    allowDbMutation: false,
  };
}

export function assertConversationDbMutationAllowed(
  config: ConversationBenchmarkCliConfig,
  env: Record<string, string | undefined> = process.env,
) {
  if (config.command === "compare" || config.command === "help") return;
  if (
    !config.allowDbMutation &&
    env.REALITY_BENCHMARK_ALLOW_DB_MUTATION !== "1"
  ) {
    throw new Error("Database mutation approval is required");
  }
}

export const CONVERSATION_BENCHMARK_USAGE = `Usage:
  bun run benchmark:conversation baseline --label NAME [--samples 3] --allow-db-mutation
  bun run benchmark:conversation candidate --baseline PATH [--label NAME] [--samples 3] --allow-db-mutation
  bun run benchmark:conversation compare --baseline PATH --candidate PATH --judge [--concurrency 4]

The evaluated model is fixed at openai/gpt-5.6-luna. Run generation only on development or an ephemeral database.`;
