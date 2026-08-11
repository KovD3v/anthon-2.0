import { MEMORY } from "@/lib/ai/constants";
import { createMemoryApproval } from "@/lib/ai/memory-approval";
import { canonicalizeKnowledgeCandidate } from "@/lib/ai/memory-canonicalization";
import {
  extractMemoryCandidates,
  type MemoryCandidate,
} from "@/lib/ai/memory-extractor";
import { rememberFact } from "@/lib/ai/memory-facts";
import {
  type CanonicalPreferencesPatch,
  type CanonicalProfilePatch,
  updateCanonicalPreferences,
  updateCanonicalProfile,
} from "@/lib/ai/user-knowledge";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const consolidatorLogger = createLogger("ai");
const sensitiveCategories = new Set([
  "health",
  "diagnosis",
  "trauma",
  "intimate",
]);

export type MemoryConsolidationReport = {
  considered: number;
  persisted: number;
  approvalsCreated: number;
  rejected: number;
};

function normalizeEvidence(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it-IT")
    .replace(/\s+/g, " ")
    .trim();
}

function hasUserEvidence(userText: string, evidence: string) {
  const normalizedEvidence = normalizeEvidence(evidence);
  return (
    normalizedEvidence.length >= 4 &&
    normalizeEvidence(userText).includes(normalizedEvidence)
  );
}

function isEligibleCandidate(candidate: MemoryCandidate, userText: string) {
  return (
    candidate.confidence >= MEMORY.MIN_CONFIDENCE &&
    candidate.durability === "DURABLE" &&
    hasUserEvidence(userText, candidate.evidence)
  );
}

export async function consolidateTurnMemory(input: {
  userId: string;
  inboundMessageId: string;
  conversationThreadId?: string;
  userText: string;
  assistantText: string;
}): Promise<MemoryConsolidationReport> {
  const emptyReport: MemoryConsolidationReport = {
    considered: 0,
    persisted: 0,
    approvalsCreated: 0,
    rejected: 0,
  };
  const sourceMessage = await prisma.message.findFirst({
    where: {
      id: input.inboundMessageId,
      userId: input.userId,
      direction: "INBOUND",
      role: "USER",
      deletedAt: null,
      ...(input.conversationThreadId
        ? { conversationThreadId: input.conversationThreadId }
        : {}),
    },
    select: { id: true },
  });
  if (!sourceMessage) return emptyReport;

  const candidates = await extractMemoryCandidates({
    userId: input.userId,
    userText: input.userText,
    assistantText: input.assistantText,
  });
  const report: MemoryConsolidationReport = {
    considered: candidates.length,
    persisted: 0,
    approvalsCreated: 0,
    rejected: 0,
  };

  for (const candidate of candidates) {
    if (!isEligibleCandidate(candidate, input.userText)) {
      report.rejected += 1;
      continue;
    }
    const canonical = canonicalizeKnowledgeCandidate(candidate);
    if (
      !canonical ||
      (canonical.destination === "preferences" && !candidate.explicitSetting)
    ) {
      report.rejected += 1;
      continue;
    }

    try {
      if (
        candidate.sensitivity === "HIGH" ||
        sensitiveCategories.has(candidate.category)
      ) {
        await createMemoryApproval({
          userId: input.userId,
          sourceInboundMessageId: input.inboundMessageId,
          key: canonical.key,
          value: canonical.value,
          category: canonical.category,
          confidence: candidate.confidence,
        });
        report.approvalsCreated += 1;
        continue;
      }

      if (canonical.destination === "profile") {
        await updateCanonicalProfile(input.userId, {
          [canonical.field]: canonical.value,
        } as CanonicalProfilePatch);
        report.persisted += 1;
        continue;
      }
      if (canonical.destination === "preferences") {
        await updateCanonicalPreferences(input.userId, {
          [canonical.field]: canonical.value,
        } as CanonicalPreferencesPatch);
        report.persisted += 1;
        continue;
      }

      const result = await rememberFact({
        userId: input.userId,
        key: canonical.key,
        value: canonical.value,
        category: canonical.category,
        confidence: candidate.confidence,
        sensitivity: candidate.sensitivity,
        origin: candidate.origin,
        sourceMessageId: input.inboundMessageId,
        sourceThreadId: input.conversationThreadId,
        dedupeKey: `memory:${input.inboundMessageId}:${canonical.key}`,
      });
      if (result.status === "saved") report.persisted += 1;
      else if (result.status !== "duplicate") report.rejected += 1;
    } catch (error) {
      report.rejected += 1;
      consolidatorLogger.warn(
        "ai.memory.candidate_persistence_failed",
        "A memory candidate could not be consolidated",
        {
          errorName: error instanceof Error ? error.name : "unknown",
          userId: input.userId,
        },
      );
    }
  }

  return report;
}
