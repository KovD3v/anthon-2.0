import { mkdir, writeFile } from "node:fs/promises";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import {
  deterministicMemoryGate,
  MEMORY_GATE_CRITERIA,
  MEMORY_GATE_INSTRUCTIONS,
  memoryGateAllowsExtraction,
} from "../src/lib/ai/memory-candidate-gate-policy";
import { getOpenRouterProviderOptionsForClassifier } from "../src/lib/ai/providers/openrouter-routing";
import {
  JEV_MODEL_ID,
  requestTypedDecision,
} from "../src/lib/ai/typed-decisions";
import {
  buildVoiceSuitabilityPrompt,
  VOICE_DECISION_CRITERIA,
  VOICE_DECISION_INSTRUCTIONS,
  voiceSuitabilitySchema,
} from "../src/lib/voice/suitability-prompt";
import { memoryGateCases, voiceDecisionCases } from "./fixtures/decision-gates";

if (!process.argv.includes("--live"))
  throw new Error(
    "Pass --live to authorize this bounded synthetic evaluation.",
  );
if (!process.env.OPENROUTER_API_KEY)
  throw new Error("OPENROUTER_API_KEY is required.");
// This script imports no database or usage meter. Fictional fixtures and usage
// remain in its report; production quota/telemetry stores are never touched.
delete process.env.OPENROUTER_BASE_URL;
const baselineModel = "google/gemini-2.5-flash-lite";
const provider = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
const memory = [];
const voice = [];
let requests = 0;
const maxRequests = 52;
const reserveRequest = () => {
  if (++requests > maxRequests)
    throw new Error("Synthetic request budget exceeded");
};

for (const fixture of memoryGateCases) {
  const deterministic = deterministicMemoryGate(fixture);
  if (deterministic !== null) {
    memory.push({
      id: fixture.id,
      expected: fixture.expected,
      extract: deterministic,
      source: "deterministic",
      durationMs: 0,
    });
    continue;
  }
  reserveRequest();
  const result = await requestTypedDecision({
    criteria: MEMORY_GATE_CRITERIA,
    instructions: MEMORY_GATE_INSTRUCTIONS,
    state: {
      userMessage: fixture.userText,
      assistantContext: fixture.assistantText,
    },
  });
  memory.push({
    id: fixture.id,
    expected: fixture.expected,
    extract:
      !result.ok ||
      memoryGateAllowsExtraction(result.choice, result.confidence),
    source: "jev",
    ...result,
  });
}
for (const fixture of voiceDecisionCases) {
  reserveRequest();
  const result = await requestTypedDecision({
    criteria: VOICE_DECISION_CRITERIA,
    instructions: VOICE_DECISION_INSTRUCTIONS,
    state: {
      userMessage: fixture.userMessage,
      assistantText: fixture.assistantText,
      recentConversation: "No recent context.",
    },
  });
  const category = result.ok ? result.choice : "TEXT_PREFERRED";
  voice.push({
    id: fixture.id,
    expected: fixture.expected,
    category,
    matched: fixture.expected.includes(category),
    source: "jev",
    ...result,
  });

  reserveRequest();
  const startedAt = performance.now();
  try {
    const baseline = await generateText({
      model: provider(baselineModel),
      output: Output.object({ schema: voiceSuitabilitySchema }),
      temperature: 0,
      maxOutputTokens: 80,
      maxRetries: 0,
      timeout: { totalMs: 1500 },
      providerOptions: {
        openrouter: getOpenRouterProviderOptionsForClassifier(baselineModel),
      },
      prompt: buildVoiceSuitabilityPrompt(
        { ...fixture, recentConversation: "No recent context." },
        "baseline",
      ),
    });
    const providerUsage = (
      baseline.providerMetadata?.openrouter as
        | { usage?: { cost?: number } }
        | undefined
    )?.usage;
    voice.push({
      id: fixture.id,
      expected: fixture.expected,
      category: baseline.output.category,
      matched: fixture.expected.includes(baseline.output.category),
      source: "baseline",
      ok: true,
      durationMs: Math.round(performance.now() - startedAt),
      usage: {
        input_tokens: baseline.usage.inputTokens,
        output_tokens: baseline.usage.outputTokens,
        cost: providerUsage?.cost,
      },
    });
  } catch (error) {
    voice.push({
      id: fixture.id,
      expected: fixture.expected,
      category: "TEXT_PREFERRED",
      matched: fixture.expected.includes("TEXT_PREFERRED"),
      source: "baseline",
      ok: false,
      durationMs: Math.round(performance.now() - startedAt),
      errorName: error instanceof Error ? error.name : "unknown",
    });
  }
}
function summary(
  rows: Array<{ durationMs: number; usage?: { cost?: number }; ok?: boolean }>,
) {
  const sorted = rows.map((row) => row.durationMs).sort((a, b) => a - b);
  return {
    calls: rows.length,
    successes: rows.filter((row) => row.ok).length,
    p50Ms: sorted[Math.floor((sorted.length - 1) * 0.5)],
    p95Ms: sorted[Math.ceil((sorted.length - 1) * 0.95)],
    reportedCostUsd: rows.reduce(
      (total, row) => total + (row.usage?.cost ?? 0),
      0,
    ),
    unknownCostCalls: rows.filter((row) => row.usage?.cost === undefined)
      .length,
  };
}
const report = {
  generatedAt: new Date().toISOString(),
  model: JEV_MODEL_ID,
  baselineModel,
  requests,
  caveat:
    "Small fictional offline sample. No real-user quality or production latency claim. Baseline failures with absent usage are unknown-cost, not free.",
  summary: {
    memoryFalseNegatives: memory.filter((row) => row.expected && !row.extract)
      .length,
    memoryExpectedCandidates: memory.filter((row) => row.expected).length,
    memorySkipped: memory.filter((row) => !row.extract).length,
    memoryCases: memory.length,
    memoryJev: summary(memory.filter((row) => row.source === "jev")),
    voiceJev: {
      ...summary(voice.filter((row) => row.source === "jev")),
      matched: voice.filter((row) => row.source === "jev" && row.matched)
        .length,
    },
    voiceBaseline: {
      ...summary(voice.filter((row) => row.source === "baseline")),
      matched: voice.filter((row) => row.source === "baseline" && row.matched)
        .length,
    },
  },
  memory,
  voice,
};
const output = "docs/benchmarks/runs/decision-gates-2026-09-19.json";
await mkdir("docs/benchmarks/runs", { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify({ output, requests, summary: report.summary }, null, 2),
);
