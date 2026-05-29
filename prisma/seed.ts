/**
 * Prisma seed script for initial data.
 * Run with: npx prisma db seed
 */

import { PrismaPg } from "@prisma/adapter-pg";
import {
  BenchmarkCategory,
  type Prisma,
  PrismaClient,
} from "../src/generated/prisma/client";
import benchmarkDataset from "../src/lib/benchmark/dataset.json";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Starting seed...");

  // Model pricing is now handled by TokenLens which fetches from OpenRouter API
  console.log("📊 Model pricing handled dynamically by TokenLens");

  for (const testCase of benchmarkDataset.testCases) {
    await prisma.benchmarkTestCase.upsert({
      where: { externalId: testCase.id },
      update: {
        category:
          testCase.category === "tool_usage"
            ? BenchmarkCategory.TOOL_USAGE
            : BenchmarkCategory.WRITING_QUALITY,
        name: testCase.name,
        description: testCase.description,
        setup: testCase.setup as Prisma.InputJsonValue,
        userMessage: testCase.userMessage,
        expectedBehavior: testCase.expectedBehavior as Prisma.InputJsonValue,
        tags: [],
        isActive: true,
      },
      create: {
        externalId: testCase.id,
        category:
          testCase.category === "tool_usage"
            ? BenchmarkCategory.TOOL_USAGE
            : BenchmarkCategory.WRITING_QUALITY,
        name: testCase.name,
        description: testCase.description,
        setup: testCase.setup as Prisma.InputJsonValue,
        userMessage: testCase.userMessage,
        expectedBehavior: testCase.expectedBehavior as Prisma.InputJsonValue,
        tags: [],
        isActive: true,
      },
    });
  }
  console.log(
    `🧪 Seeded ${benchmarkDataset.testCases.length} benchmark test cases`,
  );

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
