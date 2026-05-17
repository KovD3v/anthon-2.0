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

type ModelDelegate = {
  findFirst: (args: unknown) => Promise<unknown>;
  findFirstOrThrow: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  updateMany: (args: unknown) => Promise<unknown>;
};

function modelDelegate(client: unknown, model: string): ModelDelegate {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  return (client as Record<string, ModelDelegate>)[key];
}

function objectArgs(args: unknown): Record<string, unknown> {
  return args && typeof args === "object"
    ? (args as Record<string, unknown>)
    : {};
}

function withDeletedAtFilter(where: unknown) {
  const whereRecord = objectArgs(where);
  if ("deletedAt" in whereRecord) {
    return where;
  }
  return { ...whereRecord, deletedAt: null };
}

function softDeleteData() {
  return { deletedAt: new Date() };
}

function filteredWhere(where: unknown): never {
  return withDeletedAtFilter(where) as never;
}

/**
 * Soft Delete Extension
 *
 * Automatically filters out soft-deleted records (where deletedAt is not null)
 * from reads and turns delete/deleteMany into timestamp updates for models that
 * expose deletedAt. This prevents accidentally returning or hard-deleting
 * recoverable records.
 *
 * Usage: Apply to Prisma client via $extends()
 */
export const softDeleteExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: "softDelete",
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (hasSoftDelete(model)) {
            args.where = filteredWhere(args.where);
          }
          return query(args);
        },
        async findFirst({ model, args, query }) {
          if (hasSoftDelete(model)) {
            args.where = filteredWhere(args.where);
          }
          return query(args);
        },
        async findUnique({ model, args, query }) {
          if (hasSoftDelete(model)) {
            const nextArgs = objectArgs(args);
            return modelDelegate(client, model).findFirst({
              ...nextArgs,
              where: withDeletedAtFilter(nextArgs.where),
            });
          }
          return query(args);
        },
        async findUniqueOrThrow({ model, args, query }) {
          if (hasSoftDelete(model)) {
            const nextArgs = objectArgs(args);
            return modelDelegate(client, model).findFirstOrThrow({
              ...nextArgs,
              where: withDeletedAtFilter(nextArgs.where),
            });
          }
          return query(args);
        },
        async count({ model, args, query }) {
          if (hasSoftDelete(model)) {
            args.where = filteredWhere(args.where);
          }
          return query(args);
        },
        async aggregate({ model, args, query }) {
          if (hasSoftDelete(model)) {
            args.where = filteredWhere(args.where);
          }
          return query(args);
        },
        async groupBy({ model, args, query }) {
          if (hasSoftDelete(model)) {
            args.where = filteredWhere(args.where);
          }
          return query(args);
        },
        async delete({ model, args, query }) {
          if (hasSoftDelete(model)) {
            const nextArgs = objectArgs(args);
            return modelDelegate(client, model).update({
              ...nextArgs,
              data: softDeleteData(),
            });
          }
          return query(args);
        },
        async deleteMany({ model, args, query }) {
          if (hasSoftDelete(model)) {
            const nextArgs = objectArgs(args);
            return modelDelegate(client, model).updateMany({
              ...nextArgs,
              where: withDeletedAtFilter(nextArgs.where),
              data: softDeleteData(),
            });
          }
          return query(args);
        },
      },
    },
  }),
);
