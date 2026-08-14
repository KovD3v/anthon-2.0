type UserContextPromptCacheEntry = {
  value: string;
  expiresAt: number;
};

const userContextPromptCache = new Map<string, UserContextPromptCacheEntry>();
const tinyUserSnapshotCache = new Map<string, UserContextPromptCacheEntry>();
const userContextPromptInFlight = new Map<string, Promise<string>>();
const tinyUserSnapshotInFlight = new Map<string, Promise<string>>();
const userContextPromptGenerations = new Map<string, number>();
const tinyUserSnapshotGenerations = new Map<string, number>();

export function getUserContextPromptCache(userId: string) {
  return userContextPromptCache.get(userId);
}

export function setUserContextPromptCache(
  userId: string,
  entry: UserContextPromptCacheEntry,
) {
  userContextPromptCache.set(userId, entry);
}

export function getUserContextPromptInFlight(userId: string) {
  return userContextPromptInFlight.get(userId);
}

export function setUserContextPromptInFlight(
  userId: string,
  promise: Promise<string>,
) {
  userContextPromptInFlight.set(userId, promise);
}

export function clearUserContextPromptInFlight(
  userId: string,
  promise: Promise<string>,
) {
  if (userContextPromptInFlight.get(userId) === promise) {
    userContextPromptInFlight.delete(userId);
  }
}

export function getUserContextPromptGeneration(userId: string) {
  return userContextPromptGenerations.get(userId) ?? 0;
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

export function getTinyUserSnapshotInFlight(userId: string) {
  return tinyUserSnapshotInFlight.get(userId);
}

export function setTinyUserSnapshotInFlight(
  userId: string,
  promise: Promise<string>,
) {
  tinyUserSnapshotInFlight.set(userId, promise);
}

export function clearTinyUserSnapshotInFlight(
  userId: string,
  promise: Promise<string>,
) {
  if (tinyUserSnapshotInFlight.get(userId) === promise) {
    tinyUserSnapshotInFlight.delete(userId);
  }
}

export function getTinyUserSnapshotGeneration(userId: string) {
  return tinyUserSnapshotGenerations.get(userId) ?? 0;
}

export function invalidateUserContextPromptCache(userId: string) {
  userContextPromptCache.delete(userId);
  tinyUserSnapshotCache.delete(userId);
  userContextPromptInFlight.delete(userId);
  tinyUserSnapshotInFlight.delete(userId);
  userContextPromptGenerations.set(
    userId,
    getUserContextPromptGeneration(userId) + 1,
  );
  tinyUserSnapshotGenerations.set(
    userId,
    getTinyUserSnapshotGeneration(userId) + 1,
  );
}
