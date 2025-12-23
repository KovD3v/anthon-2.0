/**
 * Adversarial Test Case Generator
 *
 * Uses LLM to analyze existing test cases and generate edge cases
 * designed to challenge the best-performing models.
 */

import { generateObject } from "ai";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma";
import { openrouter } from "@/lib/ai/providers/openrouter";
import { prisma } from "@/lib/db";
import type {
  BenchmarkCategory,
  TestCaseSetup,
  ToolUsageExpected,
  WritingQualityExpected,
} from "./types";

// Model used for adversarial generation
const ADVERSARIAL_MODEL = "google/gemini-2.5-flash";

// Schema for generated test case
const AdversarialTestCaseSchema = z.object({
  category: z.enum(["tool_usage", "writing_quality"]),
  name: z.string().describe("Nome breve del test case"),
  description: z
    .string()
    .describe("Descrizione del comportamento edge case testato"),
  userMessage: z
    .string()
    .describe("Messaggio dell'utente (deve essere sfidante e ambiguo)"),
  setup: z.object({
    session: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        }),
      )
      .describe("Cronologia conversazione (opzionale)"),
    memories: z
      .array(
        z.object({
          key: z.string(),
          value: z.string(),
        }),
      )
      .describe("Memorie utente (opzionale)"),
    userContext: z.object({
      profile: z
        .object({
          name: z.string().optional(),
          sport: z.string().optional(),
          goal: z.string().optional(),
          experience: z.string().optional(),
        })
        .optional(),
      preferences: z
        .object({
          tone: z.string().optional(),
          mode: z.string().optional(),
          language: z.string().optional(),
        })
        .optional(),
    }),
  }),
  expectedBehavior: z
    .union([
      z.object({
        shouldUseTool: z.boolean(),
        expectedTools: z.array(z.string()).optional(),
        forbiddenTools: z.array(z.string()).optional(),
        expectedFields: z.record(z.string(), z.unknown()).optional(),
      }),
      z.object({
        shouldBeShort: z.boolean().optional(),
        maxLength: z.number().optional(),
        minLength: z.number().optional(),
        shouldMentionName: z.boolean().optional(),
        expectedTone: z.string().optional(),
        mustContain: z.array(z.string()).optional(),
        mustNotContain: z.array(z.string()).optional(),
      }),
    ])
    .describe("Aspettative per la valutazione"),
  adversarialRationale: z
    .string()
    .describe("Spiegazione di perché questo test case è sfidante"),
  targetWeakness: z
    .string()
    .describe("Debolezza specifica che questo test case mira a esporre"),
});

export interface AdversarialGenerationOptions {
  targetModel?: string; // Optional: model to specifically target
  count?: number; // Number of cases to generate (default: 3)
  categories?: ("tool_usage" | "writing_quality")[]; // Categories to focus on
  focusOnLowScores?: boolean; // Generate cases similar to low-scoring results
}

export interface GeneratedAdversarialCase {
  testCase: {
    category: BenchmarkCategory;
    name: string;
    description: string;
    setup: TestCaseSetup;
    userMessage: string;
    expectedBehavior: ToolUsageExpected | WritingQualityExpected;
  };
  adversarialRationale: string;
  targetWeakness: string;
}

/**
 * Analyze existing test cases and results to identify patterns and weaknesses.
 */
async function analyzeExistingPatterns(
  options: AdversarialGenerationOptions,
): Promise<{
  existingTestCases: Array<{ name: string; userMessage: string }>;
  weaknessPatterns: string[];
  lowScoringCategories: string[];
}> {
  // Fetch existing test cases
  const dbTestCases = await prisma.benchmarkTestCase.findMany({
    where: { isActive: true },
  });

  const existingTestCases = dbTestCases.map((tc) => ({
    name: tc.name,
    userMessage: tc.userMessage || "",
  }));

  // Fetch recent low-scoring results if requested
  const weaknessPatterns: string[] = [];
  const lowScoringCategories: string[] = [];

  if (options.focusOnLowScores) {
    const lowResults = await prisma.benchmarkResult.findMany({
      where: {
        overallScore: { lt: 5 },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        testCaseId: true,
        category: true,
        toolUsageReasoning: true,
        writingQualityReasoning: true,
        responseText: true,
      },
    });

    for (const result of lowResults) {
      const reasoning =
        result.toolUsageReasoning || result.writingQualityReasoning;
      if (reasoning) {
        weaknessPatterns.push(
          `Test: ${result.testCaseId}, Issue: ${reasoning.slice(0, 200)}`,
        );
      }
      lowScoringCategories.push(result.category);
    }
  }

  return { existingTestCases, weaknessPatterns, lowScoringCategories };
}

/**
 * Generate adversarial test cases using LLM.
 */
export async function generateAdversarialCases(
  options: AdversarialGenerationOptions = {},
): Promise<GeneratedAdversarialCase[]> {
  const count = options.count || 3;
  const categories = options.categories || ["tool_usage", "writing_quality"];

  // Analyze existing patterns
  const { existingTestCases, weaknessPatterns } =
    await analyzeExistingPatterns(options);

  // Build context for generation
  const existingCaseSummary = existingTestCases
    .slice(0, 20)
    .map((tc) => `- ${tc.name}: "${(tc.userMessage || "").slice(0, 100)}..."`)
    .join("\n");

  const weaknessContext =
    weaknessPatterns.length > 0
      ? `\n\nDEBOLEZZE RILEVATE:\n${weaknessPatterns.slice(0, 10).join("\n")}`
      : "";

  const generatedCases: GeneratedAdversarialCase[] = [];

  for (let i = 0; i < count; i++) {
    const targetCategory = categories[i % categories.length];

    const { object } = await generateObject({
      model: openrouter(ADVERSARIAL_MODEL),
      schema: AdversarialTestCaseSchema,
      system: `Sei un esperto di qualità AI e testing adversarial. Il tuo compito è generare test cases "edge case" che possono mettere in difficoltà un modello AI coach sportivo.

Il sistema che stai testando è "Anthon", un coach digitale per atleti che:
- Salva informazioni utente con tool (updateProfile, saveMemory, etc.)
- Risponde con tono professionale ed empatico
- Fornisce consigli pratici per allenamento e performance

OBIETTIVO: Genera test cases che espongono debolezze potenziali, come:
1. Messaggi ambigui che potrebbero confondere il modello
2. Richieste che sembrano richiedere tool ma non lo richiedono (o viceversa)
3. Contesti emotivi complessi che richiedono risposte calibrate
4. Input che potrebbero causare risposte inappropriate
5. Casi limite con informazioni incomplete o contraddittorie

REGOLE IMPORTANTI:
- Ogni test case deve essere realistico (qualcosa che un utente potrebbe davvero dire)
- Non creare test impossibili o irragionevoli
- Specifica chiaramente cosa dovrebbe fare/non fare il modello
- Genera solo per la categoria: ${targetCategory}`,
      prompt: `## Test Cases Esistenti
${existingCaseSummary}
${weaknessContext}

## Task
Genera UN test case adversarial per la categoria: ${targetCategory}

Il test case deve:
1. Essere diverso dai test esistenti
2. Esplorare un "edge case" non coperto
3. Avere aspettative chiare e valutabili

Genera un test case sfidante ma realistico.`,
    });

    generatedCases.push({
      testCase: {
        category:
          object.category === "tool_usage" ? "TOOL_USAGE" : "WRITING_QUALITY",
        name: object.name,
        description: object.description,
        setup: object.setup as unknown as TestCaseSetup,
        userMessage: object.userMessage,
        expectedBehavior: object.expectedBehavior as unknown as
          | ToolUsageExpected
          | WritingQualityExpected,
      },
      adversarialRationale: object.adversarialRationale,
      targetWeakness: object.targetWeakness,
    });
  }

  return generatedCases;
}

/**
 * Save generated adversarial test cases to database.
 */
export async function saveAdversarialCase(
  generatedCase: GeneratedAdversarialCase,
): Promise<string> {
  const tc = generatedCase.testCase;

  const created = await prisma.benchmarkTestCase.create({
    data: {
      externalId: `adv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category: tc.category,
      name: `[ADV] ${tc.name}`,
      description: `${tc.description}\n\n---\nAdversarial Rationale: ${generatedCase.adversarialRationale}\nTarget Weakness: ${generatedCase.targetWeakness}`,
      setup: tc.setup as unknown as Prisma.InputJsonValue,
      userMessage: tc.userMessage,
      expectedBehavior: tc.expectedBehavior as unknown as Prisma.InputJsonValue,
      tags: ["adversarial", "generated"],
      isActive: false, // Requires admin approval
    },
  });

  return created.id;
}

/**
 * Get pending adversarial cases (not yet approved).
 */
export async function getPendingAdversarialCases(): Promise<
  Prisma.BenchmarkTestCaseGetPayload<Record<string, never>>[]
> {
  return prisma.benchmarkTestCase.findMany({
    where: {
      tags: { has: "adversarial" },
      isActive: false,
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Approve an adversarial case (make it active for benchmarks).
 */
export async function approveAdversarialCase(
  testCaseId: string,
): Promise<void> {
  await prisma.benchmarkTestCase.update({
    where: { id: testCaseId },
    data: { isActive: true },
  });
}

/**
 * Reject an adversarial case (delete it).
 */
export async function rejectAdversarialCase(testCaseId: string): Promise<void> {
  await prisma.benchmarkTestCase.delete({
    where: { id: testCaseId },
  });
}
