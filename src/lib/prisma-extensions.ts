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
				// findUnique doesn't support arbitrary where clauses,
				// so we can't add deletedAt filter here.
				// Consider using findFirst for soft-deleted models if needed.
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
