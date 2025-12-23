/**
 * Benchmark Types
 *
 * TypeScript types for the AI model benchmark system.
 */

// Local type for BenchmarkCategory (matches Prisma enum)
export type BenchmarkCategory = "TOOL_USAGE" | "WRITING_QUALITY";

// -----------------------------------------------------
// TEST CASE TYPES
// -----------------------------------------------------

export interface TestCase {
  id: string;
  category: "tool_usage" | "writing_quality";
  name: string;
  description: string;
  setup: TestCaseSetup;
  userMessage: string;
  expectedBehavior: ToolUsageExpected | WritingQualityExpected;
}

export interface TestCaseSetup {
  session: Array<{ role: "user" | "assistant"; content: string }>;
  memories: Array<{ key: string; value: string; category?: string }>;
  userContext: {
    profile?: {
      name?: string;
      sport?: string;
      goal?: string;
      experience?: string;
    } | null;
    preferences?: {
      tone?: string;
      mode?: string;
      language?: string;
    } | null;
  };
}

export interface ToolUsageExpected {
  shouldUseTool: boolean;
  expectedTools?: string[];
  forbiddenTools?: string[];
  expectedFields?: Record<string, unknown>;
}

export interface WritingQualityExpected {
  shouldBeShort?: boolean;
  maxLength?: number;
  minLength?: number;
  shouldMentionName?: boolean;
  expectedTone?: string;
  mustContain?: string[];
  mustNotContain?: string[];
}

// Type guard functions
export function isToolUsageExpected(
  expected: ToolUsageExpected | WritingQualityExpected,
): expected is ToolUsageExpected {
  return "shouldUseTool" in expected;
}

export function isWritingQualityExpected(
  expected: ToolUsageExpected | WritingQualityExpected,
): expected is WritingQualityExpected {
  return !("shouldUseTool" in expected);
}

// -----------------------------------------------------
// BENCHMARK RESULT TYPES
// -----------------------------------------------------

export interface BenchmarkResultInput {
  testCaseId: string;
  category: BenchmarkCategory;
  modelId: string;

  // Collected metrics
  inferenceTimeMs: number;
  ttftMs: number | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number | null;
  costUsd: number;
  responseText: string;
  toolCalls: Array<{ name: string; args: unknown; result?: unknown }> | null;
  sessionUsed: { messageCount: number; sessions: number };
  memoriesUsed: string[];
}

// Critique types for Chain of Thought evaluation
export interface ToolUsageCritique {
  toolsAnalysis: string;
  parametersCheck: string;
  missingElements: string;
  unexpectedBehaviors: string;
}

export interface WritingQualityCritique {
  contentAnalysis: string;
  toneAnalysis: string;
  structureAnalysis: string;
  complianceCheck: string;
}

export interface JudgeScores {
  toolUsage?: {
    score: number;
    reasoning: string;
    critique?: ToolUsageCritique;
  };
  writingQuality?: {
    score: number;
    reasoning: string;
    critique?: WritingQualityCritique;
  };
  overall: number;
}

// Multi-judge consensus result
export interface ConsensusResult {
  judge1: JudgeScores;
  judge2: JudgeScores;
  consensusScore: number;
  judgeDisagreement: number;
  flaggedForReview: boolean;
}

// -----------------------------------------------------
// DATASET TYPES
// -----------------------------------------------------

export interface BenchmarkDataset {
  metadata: {
    version: string;
    createdAt: string;
    categories: string[];
    description?: string;
  };
  testCases: TestCase[];
}

// -----------------------------------------------------
// RUNNER OPTIONS
// -----------------------------------------------------

export interface BenchmarkRunnerOptions {
  models?: string[];
  testCaseIds?: string[];
  categories?: ("tool_usage" | "writing_quality")[];
  runName?: string;
  description?: string;
  iterations?: number;
  concurrency?: number;
}

// -----------------------------------------------------
// AGGREGATED RESULTS
// -----------------------------------------------------

export interface ModelAggregatedScores {
  modelId: string;
  testCount: number;
  avgInferenceTimeMs: number;
  avgTtftMs: number | null;
  avgCostUsd: number;
  avgToolUsageScore: number | null;
  avgWritingQualityScore: number | null;
  avgOverallScore: number;
  reliability: number; // % of successful runs (score > 0)
  variance: number; // standard deviation of scores
  reasoningEfficiency: number | null; // reasoning tokens / output tokens
  tokenEfficiencyIndex: number | null; // score based on token usage
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}

export interface BenchmarkSummary {
  runId: string;
  runName: string;
  status: string;
  models: ModelAggregatedScores[];
  testCaseCount: number;
  startedAt: Date | null;
  endedAt: Date | null;
  durationMs: number | null;
}
