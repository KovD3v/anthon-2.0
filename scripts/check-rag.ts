import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";
import pg from "pg";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL!;

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function check() {
  const docs = await prisma.ragDocument.findMany({
    include: { _count: { select: { chunks: true } } },
  });
  console.log("Documents:", JSON.stringify(docs, null, 2));

  const chunks = await prisma.ragChunk.findMany({
    take: 3,
    select: { id: true, content: true, documentId: true },
  });
  console.log("Sample chunks:", JSON.stringify(chunks, null, 2));

  // Check if embeddings exist
  const embeddingCheck = await prisma.$queryRaw`
    SELECT id, LEFT(content, 100) as content_preview, 
           CASE WHEN embedding IS NULL THEN 'NULL' ELSE 'HAS_EMBEDDING' END as has_embedding
    FROM "RagChunk" 
    LIMIT 5
  `;
  console.log("Embedding status:", JSON.stringify(embeddingCheck, null, 2));
}

check()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
