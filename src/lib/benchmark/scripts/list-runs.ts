import dotenv from "dotenv";
import { prisma } from "@/lib/db";

dotenv.config();

async function main() {
  const runs = await prisma.benchmarkRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, name: true, createdAt: true },
  });

  console.log(JSON.stringify(runs, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
