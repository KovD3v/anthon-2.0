import { invalidateMemoriesForPromptCache } from "./tools/memory";
import { invalidateUserContextPromptCache } from "./tools/user-context";

export function invalidateCoachingContextPromptCaches(userId: string) {
  invalidateMemoriesForPromptCache(userId);
  invalidateUserContextPromptCache(userId);
}
