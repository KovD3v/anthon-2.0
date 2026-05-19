import "dotenv/config";
import { searchDocuments, shouldUseRag } from "../src/lib/ai/rag";

async function testRagSearch() {
  const testQueries = [
    "business plan",
    "gioielli green",
    "qual è la forma giuridica dell'azienda?",
    "chi sono i soci?",
    "sostenibilità",
    "Roma",
    "cosa sai del business plan?",
  ];

  console.log("=== Testing RAG Search ===\n");

  for (const query of testQueries) {
    console.log(`\n🔍 Query: "${query}"`);

    // Test shouldUseRag
    const needsRag = await shouldUseRag(query);
    console.log(`  shouldUseRag: ${needsRag}`);

    // Test search regardless
    const results = await searchDocuments(query);
    console.log(`  Results: ${results.length}`);

    if (results.length > 0) {
      for (const r of results) {
        console.log(
          `  - ${r.title} (similarity: ${(r.similarity * 100).toFixed(1)}%)`,
        );
        console.log(`    "${r.content.substring(0, 100)}..."`);
      }
    }
  }
}

testRagSearch().catch(console.error);
