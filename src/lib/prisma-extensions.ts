/**
 * Prisma Client Extensions
 *
 * Extensions that modify Prisma behavior globally.
 */

import { Prisma } from "@/generated/prisma";

/**
 * Models that have soft delete (deletedAt field).
 */
const SOFT_DELETE_MODELS = ["User", "Chat", "Message"] as const;

/**
 * Check if a model supports soft delete.
 */
function hasSoftDelete(model: string): boolean {
  return (SOFT_DELETE_MODELS as readonly string[]).includes(model);
}

/**
 * Soft Delete Extension
 *
 * Automatically filters out soft-deleted records (where deletedAt is not null)
 * from all queries. This prevents accidentally returning "deleted" records.
 *
 * Usage: Apply to Prisma client via $extends()
 */
export const softDeleteExtension = Prisma.defineExtension({
  name: "softDelete",
  query: {
    $allModels: {
      async findMany({ model, args, query }) {
        if (hasSoftDelete(model)) {
          args.where = { ...args.where, deletedAt: null };
        }
        return query(args);
      },
      async findFirst({ model, args, query }) {
        if (hasSoftDelete(model)) {
          args.where = { ...args.where, deletedAt: null };
        }
        return query(args);
      },
      async findUnique({ model, args, query }) {
        if (hasSoftDelete(model)) {
          // Prisma limitation: findUnique only accepts unique field constraints in where clause,
          // so we cannot add deletedAt: null filter. We must fetch then filter post-query.
          // For better performance on soft-delete models, prefer findFirst with explicit deletedAt filter.
          const result = await query(args);
          if (result && (result as { deletedAt?: Date | null }).deletedAt) {
            return null;
          }
          return result;
        }
        return query(args);
      },
      async count({ model, args, query }) {
        if (hasSoftDelete(model)) {
          args.where = { ...args.where, deletedAt: null };
        }
        return query(args);
      },
      async aggregate({ model, args, query }) {
        if (hasSoftDelete(model)) {
          args.where = { ...args.where, deletedAt: null };
        }
        return query(args);
      },
      async groupBy({ model, args, query }) {
        if (hasSoftDelete(model)) {
          args.where = { ...args.where, deletedAt: null };
        }
        return query(args);
      },
    },
  },
});
