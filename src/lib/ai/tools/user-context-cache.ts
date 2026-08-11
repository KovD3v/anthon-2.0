type UserContextPromptCacheEntry = {
  value: string;
  expiresAt: number;
};

const userContextPromptCache = new Map<string, UserContextPromptCacheEntry>();
const tinyUserSnapshotCache = new Map<string, UserContextPromptCacheEntry>();

export function getUserContextPromptCache(userId: string) {
  return userContextPromptCache.get(userId);
}

export function setUserContextPromptCache(
  userId: string,
  entry: UserContextPromptCacheEntry,
) {
  userContextPromptCache.set(userId, entry);
}

export function getTinyUserSnapshotCache(userId: string) {
  return tinyUserSnapshotCache.get(userId);
}

export function setTinyUserSnapshotCache(
  userId: string,
  entry: UserContextPromptCacheEntry,
) {
  tinyUserSnapshotCache.set(userId, entry);
}

export function invalidateUserContextPromptCache(userId: string) {
  userContextPromptCache.delete(userId);
  tinyUserSnapshotCache.delete(userId);
}
