/**
 * Prisma seed script for initial data.
 * Run with: npx prisma db seed
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

/**
 * Model pricing data - updated December 2024
 * Prices are in USD per 1 million tokens
 *
 * Sources:
 * - OpenRouter: https://openrouter.ai/models
 * - Check pricing updates regularly as they change
 */
const modelPricing = [
  {
    modelId: "x-ai/grok-4.1-fast:free",
    displayName: "Grok 4.1 Fast (Free)",
    inputPricePerMillion: 0,
    outputPricePerMillion: 0,
    reasoningPricePerMillion: null,
  },
  {
    modelId: "x-ai/grok-4.1-fast",
    displayName: "Grok 4.1 Fast",
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    reasoningPricePerMillion: null,
  },
  {
    modelId: "google/gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.6,
    reasoningPricePerMillion: 3.5, // thinking tokens
  },
  {
    modelId: "google/gemini-2.5-flash-preview-05-20",
    displayName: "Gemini 2.5 Flash Preview",
    inputPricePerMillion: 0.15,
    outputPricePerMillion: 0.6,
    reasoningPricePerMillion: 3.5,
  },
  {
    modelId: "qwen/qwen3-embedding-8b",
    displayName: "Qwen3 Embedding 8B",
    inputPricePerMillion: 0.02,
    outputPricePerMillion: 0, // embeddings don't have output tokens
    reasoningPricePerMillion: null,
  },
  {
    modelId: "openai/gpt-4.1-mini",
    displayName: "GPT-4.1 Mini",
    inputPricePerMillion: 0.4,
    outputPricePerMillion: 1.6,
    reasoningPricePerMillion: null,
  },
  {
    modelId: "openai/gpt-4.1",
    displayName: "GPT-4.1",
    inputPricePerMillion: 2.0,
    outputPricePerMillion: 8.0,
    reasoningPricePerMillion: null,
  },
  {
    modelId: "anthropic/claude-sonnet-4",
    displayName: "Claude Sonnet 4",
    inputPricePerMillion: 3.0,
    outputPricePerMillion: 15.0,
    reasoningPricePerMillion: null,
  },
];

async function main() {
  console.log("🌱 Starting seed...");

  // Upsert model pricing
  console.log("📊 Seeding model pricing...");

  for (const model of modelPricing) {
    await prisma.modelPricing.upsert({
      where: { modelId: model.modelId },
      update: {
        displayName: model.displayName,
        inputPricePerMillion: model.inputPricePerMillion,
        outputPricePerMillion: model.outputPricePerMillion,
        reasoningPricePerMillion: model.reasoningPricePerMillion,
        updatedAt: new Date(),
      },
      create: {
        modelId: model.modelId,
        displayName: model.displayName,
        inputPricePerMillion: model.inputPricePerMillion,
        outputPricePerMillion: model.outputPricePerMillion,
        reasoningPricePerMillion: model.reasoningPricePerMillion,
      },
    });
    console.log(`  ✓ ${model.displayName}`);
  }

  console.log("\n✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
