import type { Prisma } from "@/generated/prisma";

/** Serialize fact snapshots and writes, including creation when no row exists yet. */
export async function lockMemoryMutations(
  transaction: Pick<Prisma.TransactionClient, "$executeRaw">,
  userId: string,
) {
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`memory:${userId}`}, 0))`;
}
