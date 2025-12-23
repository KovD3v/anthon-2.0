import { prisma } from "../src/lib/db";
import dataset from "../src/lib/benchmark/dataset.json";

async function main() {
  console.log("🌱 Seeding benchmark test cases...");

  const testCases = dataset.testCases;
  let created = 0;
  let updated = 0;

  for (const tc of testCases) {
    const data = {
      externalId: tc.id,
      category: tc.category.toUpperCase() as "TOOL_USAGE" | "WRITING_QUALITY",
      name: tc.name,
      description: tc.description,
      setup: tc.setup as any,
      userMessage: tc.userMessage,
      expectedBehavior: tc.expectedBehavior as any,
      tags: [],
      isActive: true,
    };

    const existing = await prisma.benchmarkTestCase.findUnique({
      where: { externalId: tc.id },
    });

    if (existing) {
      await prisma.benchmarkTestCase.update({
        where: { id: existing.id },
        data,
      });
      updated++;
    } else {
      await prisma.benchmarkTestCase.create({ data });
      created++;
    }
  }

  console.log(`✅ Seeding complete: ${created} created, ${updated} updated`);
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
