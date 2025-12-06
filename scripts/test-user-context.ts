/**
 * Test script to see how the AI system prompt looks with user context
 */

import { formatUserContextForPrompt } from "../src/lib/ai/tools/user-context";

async function testSystemPrompt() {
  const userId = "cmiry8wdl000dkq57m83rw4d5"; // The user ID from the database

  console.log("=== User Context for System Prompt ===\n");
  const userContext = await formatUserContextForPrompt(userId);
  console.log(userContext);
  console.log("\n=== End of Context ===");
}

testSystemPrompt()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
