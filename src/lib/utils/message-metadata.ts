import type { Prisma } from "@/generated/prisma";

/** Merge only the supplied top-level fields; other background writers retain their state. */
export async function patchMessageMetadata(
  database: Pick<Prisma.TransactionClient, "$executeRaw">,
  messageId: string,
  fields: Prisma.InputJsonObject,
) {
  await database.$executeRaw`
    UPDATE "Message"
    SET "metadata" = (CASE WHEN jsonb_typeof("metadata") = 'object' THEN "metadata" ELSE '{}'::jsonb END) || ${JSON.stringify(fields)}::jsonb
    WHERE "id" = ${messageId}
  `;
}
