import { writeFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import type { MemoryRecallBenchmarkObservation } from "./memory-recall";
import { scoreMemoryRecallBenchmark } from "./memory-recall";

type FixtureFact = {
  id: string;
  userId: string;
  key: string;
  value: { content: string };
  category: string;
  origin: string;
  confidence: number;
  status: string;
  sensitivity: string;
  sourceMessageId: string | null;
  sourceThreadId: string | null;
  lastConfirmedAt: Date | null;
  observedAt: Date;
  updatedAt: Date;
  createdAt: Date;
  expiresAt: Date | null;
};

// Only the Prisma boundary is simulated. Canonicalization, writes, revision
// checks, cache invalidation and retrieval all run through production functions.
const database = vi.hoisted(() => {
  const rows = new Map<string, FixtureFact>();
  const revisions = new Map<string, { memoryId: string }>();
  const memory = {
    async findFirst({ where }: { where: Partial<FixtureFact> }) {
      return (
        [...rows.values()].find((row) =>
          Object.entries(where).every(
            ([key, value]) => row[key as keyof FixtureFact] === value,
          ),
        ) ?? null
      );
    },
    async findMany({
      where,
      take,
    }: {
      where: {
        userId?: string;
        status?: string;
        OR?: Array<{ expiresAt: null | { gt: Date } }>;
      };
      take: number;
    }) {
      return [...rows.values()]
        .filter(
          (row) =>
            (where.userId === undefined || row.userId === where.userId) &&
            (where.status === undefined || row.status === where.status) &&
            (!where.OR ||
              where.OR.some(({ expiresAt }) =>
                expiresAt === null
                  ? row.expiresAt === null
                  : row.expiresAt !== null && row.expiresAt > expiresAt.gt,
              )),
        )
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, take);
    },
    async upsert({
      where,
      create,
      update,
    }: {
      where: { userId_key: { userId: string; key: string } };
      create: Partial<FixtureFact> &
        Pick<
          FixtureFact,
          | "userId"
          | "key"
          | "value"
          | "category"
          | "origin"
          | "confidence"
          | "observedAt"
        >;
      update: Partial<FixtureFact>;
    }) {
      const old = await memory.findFirst({ where: where.userId_key });
      const row = old
        ? { ...old, ...update, updatedAt: new Date() }
        : {
            ...create,
            id: `fixture-${rows.size + 1}`,
            status: "ACTIVE",
            updatedAt: new Date(),
            createdAt: new Date(),
            expiresAt: create.expiresAt ?? null,
            sensitivity: create.sensitivity ?? "LOW",
            sourceMessageId: create.sourceMessageId ?? null,
            sourceThreadId: create.sourceThreadId ?? null,
            lastConfirmedAt: create.lastConfirmedAt ?? null,
          };
      rows.set(row.id, row);
      return { id: row.id };
    },
    async update({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FixtureFact>;
    }) {
      const old = rows.get(where.id);
      if (!old) throw new Error("Missing synthetic fact");
      const defined = Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined),
      );
      rows.set(where.id, { ...old, ...defined, updatedAt: new Date() });
      return { id: where.id };
    },
  };
  const memoryRevision = {
    async findUnique({ where }: { where: { dedupeKey: string } }) {
      return revisions.get(where.dedupeKey) ?? null;
    },
    async create({ data }: { data: { dedupeKey: string; memoryId: string } }) {
      revisions.set(data.dedupeKey, data);
      return data;
    },
  };
  return {
    rows,
    revisions,
    prisma: {
      memory,
      async $transaction(
        operation: (transaction: {
          memory: typeof memory;
          memoryRevision: typeof memoryRevision;
        }) => Promise<unknown>,
      ) {
        return operation({ memory, memoryRevision });
      },
    },
  };
});

vi.mock("@/lib/db", () => ({ prisma: database.prisma }));

import {
  forgetFact,
  getActiveFactById,
  invalidateFactCache,
  recallFacts,
  rememberFact,
  reviseFact,
} from "@/lib/ai/memory-facts";
import { planRecall } from "@/lib/ai/recall-planner";

afterEach(() => {
  vi.useRealTimers();
  invalidateFactCache("synthetic-owner");
  invalidateFactCache("synthetic-other");
  database.rows.clear();
  database.revisions.clear();
});

it("observes save, retrieval, correction, expiry, deletion and owner isolation", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const now = new Date("2026-09-19T10:00:00Z");
  vi.setSystemTime(now);
  const observations: MemoryRecallBenchmarkObservation[] = [];
  const input = {
    userId: "synthetic-owner",
    key: "exam_review_time",
    value: "Ripasso l'esame alle 18",
    category: "schedule",
    confidence: 1,
    sensitivity: "LOW" as const,
    origin: "EXPLICIT" as const,
    dedupeKey: "synthetic-save",
    expiresAt: new Date("2026-09-19T10:10:00Z"),
  };
  const saved = await rememberFact(input);
  expect(saved.status).toBe("saved");
  expect(saved.factId).toBeTruthy();
  const factId = saved.factId as string;
  const replay = await rememberFact(input);
  expect(replay.status).toBe("duplicate");
  expect(database.rows.size).toBe(1);
  expect(database.revisions.size).toBe(1);

  await rememberFact({
    ...input,
    userId: "synthetic-other",
    value: "Segreto di un altro account",
    dedupeKey: "synthetic-other-save",
  });
  await rememberFact({
    ...input,
    key: "presentation_focus",
    value: "Presentazione: iniziare dal risultato",
    category: "other",
    dedupeKey: "synthetic-work",
  });
  await rememberFact({
    ...input,
    key: "serve_focus",
    value: "Servizio: guardare il bersaglio",
    category: "other",
    dedupeKey: "synthetic-sport",
  });

  async function observe(
    query: string,
    expectedFacts: string[],
    options: { conflict?: boolean; userId?: string } = {},
  ) {
    const started = performance.now();
    const result = await recallFacts({
      userId: options.userId ?? input.userId,
      query,
      limit: 1,
    });
    const returnedFacts = result.facts.map((fact) => fact.content);
    const correct =
      JSON.stringify(returnedFacts) === JSON.stringify(expectedFacts);
    observations.push({
      expectedRecall: expectedFacts.length > 0,
      recalled: returnedFacts.length > 0,
      expectedFacts,
      returnedFacts,
      duplicateCount: returnedFacts.length - new Set(returnedFacts).size,
      conflictCorrect: options.conflict ? correct : null,
      evidenceRelevant: null,
      unsupportedClaim: null,
      latencyMs: performance.now() - started,
      costUsd: 0,
    });
    expect(result.degraded).toBe(false);
    expect(returnedFacts).toEqual(expectedFacts);
  }

  await observe("esame ripasso", [input.value]);
  await observe("presentazione", ["Presentazione: iniziare dal risultato"]);
  await observe("servizio bersaglio", ["Servizio: guardare il bersaglio"]);
  await observe("esame", [], { userId: "synthetic-empty" });
  expect(
    await getActiveFactById({ userId: "synthetic-other", factId }),
  ).toBeNull();
  const wrongOwner = await reviseFact({
    ...input,
    userId: "synthetic-other",
    factId,
    value: "Non deve cambiare",
    dedupeKey: "synthetic-forbidden",
  });
  expect(wrongOwner.status).toBe("not_found");

  const correctedValue = "Ripasso l'esame alle 20, non più alle 18";
  const corrected = await reviseFact({
    ...input,
    factId,
    value: correctedValue,
    dedupeKey: "synthetic-correction",
  });
  expect(corrected.status).toBe("saved");
  await observe("esame ripasso", [correctedValue], { conflict: true });

  vi.setSystemTime(new Date("2026-09-19T10:11:00Z"));
  await observe("esame ripasso", []);
  expect(await getActiveFactById({ userId: input.userId, factId })).toBeNull();

  const durable = await rememberFact({
    ...input,
    key: "review_evidence",
    value: "Ripetere a voce mi ha aiutato",
    expiresAt: null,
    dedupeKey: "synthetic-evidence",
  });
  expect(durable.status).toBe("saved");
  await observe("ripetere voce", ["Ripetere a voce mi ha aiutato"]);
  const forgotten = await forgetFact({
    userId: input.userId,
    factId: durable.factId as string,
    dedupeKey: "synthetic-forget",
  });
  expect(forgotten.status).toBe("forgotten");
  await observe("ripetere voce", []);

  const decision = { mode: "active" as const, reason: "synthetic" };
  const ordinary = planRecall({
    message: "Riprendiamo il ripasso",
    decision,
    isGuest: false,
  });
  const explicit = planRecall({
    message: "Ricordi cosa avevamo deciso su Telegram?",
    decision,
    isGuest: false,
  });
  expect(ordinary.conversations.allowCrossChannel).toBe(false);
  expect(explicit.conversations.allowCrossChannel).toBe(true);

  const report = {
    mode: "offline-production-memory-functions",
    storage: "synthetic Prisma boundary; no database or provider connection",
    metrics: scoreMemoryRecallBenchmark(observations),
    limitations: [
      "No database transaction, SQL query or generated-answer quality is evaluated.",
      "Expiry is supplied by the fixture; extraction and temporary-memory plumbing are not evaluated.",
      "Cross-channel checks cover recall authorization, not raw-transcript retrieval.",
    ],
  };
  expect(report.metrics.factPrecision).toBe(1);
  expect(report.metrics.factRecall).toBe(1);
  expect(report.metrics.conflictAccuracy).toBe(1);
  expect(report.metrics.unsupportedMemoryClaimRate).toBeNull();
  const reportPath = process.env.ANTHON_MEMORY_BENCHMARK_REPORT;
  if (reportPath) writeFileSync(reportPath, `${JSON.stringify(report)}\n`);
});
