import { indexConversationWindow } from "@/lib/ai/conversation-index";
import { prisma } from "@/lib/db";

export type BackfillOptions = {
  mode: "dry-run" | "apply";
  batchSize: number;
  afterThreadId?: string;
};

type BackfillThread = {
  id: string;
  userId: string;
  messages: Array<{ id: string }>;
};

export function parseBackfillArgs(args: string[]): BackfillOptions {
  const dryRun = args.includes("--dry-run");
  const apply = args.includes("--apply");
  if (dryRun === apply)
    throw new Error("Pass exactly one of --dry-run or --apply");
  const valueAfter = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const rawBatch = valueAfter("--batch-size");
  const batchSize = rawBatch ? Number(rawBatch) : 50;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 200) {
    throw new Error("--batch-size must be an integer from 1 to 200");
  }
  return {
    mode: apply ? "apply" : "dry-run",
    batchSize,
    afterThreadId: valueAfter("--after-thread-id"),
  };
}

async function listThreads(input: {
  afterThreadId?: string;
  batchSize: number;
}): Promise<BackfillThread[]> {
  return prisma.conversationThread.findMany({
    where: input.afterThreadId
      ? { id: { gt: input.afterThreadId } }
      : undefined,
    select: {
      id: true,
      userId: true,
      messages: {
        where: { deletedAt: null, role: "ASSISTANT" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      },
    },
    orderBy: { id: "asc" },
    take: input.batchSize,
  });
}

export async function runConversationRecallBackfill(
  options: BackfillOptions,
  dependencies: {
    listThreads: typeof listThreads;
    indexWindow: typeof indexConversationWindow;
  } = { listThreads, indexWindow: indexConversationWindow },
) {
  const threads = await dependencies.listThreads({
    afterThreadId: options.afterThreadId,
    batchSize: options.batchSize,
  });
  let windows = 0;
  let failures = 0;
  let checkpoint = options.afterThreadId;
  for (const thread of threads) {
    checkpoint = thread.id;
    windows += thread.messages.length;
    if (options.mode === "dry-run") continue;
    try {
      for (const message of thread.messages) {
        await dependencies.indexWindow({
          userId: thread.userId,
          conversationThreadId: thread.id,
          throughMessageId: message.id,
        });
      }
    } catch {
      failures++;
    }
  }
  return { threads: threads.length, windows, failures, checkpoint };
}

if (import.meta.main) {
  try {
    const options = parseBackfillArgs(process.argv.slice(2));
    const result = await runConversationRecallBackfill(options);
    console.info(JSON.stringify(result));
    if (result.failures > 0) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Backfill failed");
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
