import { generateText } from "ai";
import type { Message } from "@/generated/prisma/client";
import { SESSION } from "@/lib/ai/constants"; // GAP_MS
import { maintenanceModel } from "@/lib/ai/providers/openrouter";
import { prisma } from "@/lib/db";

// Reusing session grouping logic structure
interface SessionGroup {
  messages: Message[];
  startTime: Date;
  endTime: Date;
}

function groupMessages(messages: Message[]): SessionGroup[] {
  if (messages.length === 0) return [];
  const sessions: SessionGroup[] = [];
  let currentSession: Message[] = [messages[0]];

  for (let i = 1; i < messages.length; i++) {
    const prevTime = new Date(messages[i - 1].createdAt).getTime();
    const currTime = new Date(messages[i].createdAt).getTime();

    if (currTime - prevTime > SESSION.GAP_MS) {
      sessions.push({
        messages: currentSession,
        startTime: new Date(currentSession[0].createdAt),
        endTime: new Date(currentSession[currentSession.length - 1].createdAt),
      });
      currentSession = [messages[i]];
    } else {
      currentSession.push(messages[i]);
    }
  }
  if (currentSession.length > 0) {
    sessions.push({
      messages: currentSession,
      startTime: new Date(currentSession[0].createdAt),
      endTime: new Date(currentSession[currentSession.length - 1].createdAt),
    });
  }
  return sessions;
}

export async function archiveOldSessions(
  userId: string,
  retentionDays: number,
): Promise<void> {
  // 1. Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  // 2. Fetch messages older than cutoff
  // CRITICAL: We also need to check that the session isn't "live" (updated in last 24h).
  // But wait, "messages older than retention days" means the messages themselves are old.
  // If a session spans from 31 days ago to today, we shouldn't archive it yet.
  // So we fetch ALL messages for the user, group them, and then check the session END time.
  // Optimization: Fetch messages only where createdAt < (Now - 24h) to avoid live stuff,
  // then apply strict retention check on the session group.

  // Safe buffer: ensure we don't touch anything from the last 24 hours
  const safeBufferDate = new Date();
  safeBufferDate.setHours(safeBufferDate.getHours() - 24);

  const messages = await prisma.message.findMany({
    where: {
      userId,
      createdAt: { lt: safeBufferDate }, // only look at messages older than 24h
      deletedAt: null, // skip already soft-deleted
    },
    orderBy: { createdAt: "asc" },
  });

  if (messages.length === 0) return;

  const sessions = groupMessages(messages);

  for (const session of sessions) {
    // 3. Check if session is fully outside retention window
    // session.endTime must be BEFORE cutoffDate
    if (session.endTime > cutoffDate) {
      continue; // Session is too recent to archive (part of it might be old, but keep it whole)
    }

    console.log(
      `[Archiver] Archiving session ${session.startTime.toISOString()} for user ${userId} (${
        session.messages.length
      } msgs)`,
    );

    // 4. Summarize for Archive
    const transcript = session.messages
      .map((m) => `${m.role === "USER" ? "U" : "A"}: ${m.content}`)
      .join("\n");

    const { text: summary } = await generateText({
      model: maintenanceModel,
      system: `Sei un archivista. Riassumi questa vecchia conversazione per conservare il contesto a lungo termine.
Includi: argomenti trattati, decisioni prese, fatti importanti.
Ignora: saluti, chiacchiere inutili.
Sii conciso ma completo.`,
      prompt: transcript,
    });

    // 5. Transaction: Save Archive + Delete Messages
    await prisma.$transaction(async (tx) => {
      // Create Archive Record
      await tx.archivedSession.create({
        data: {
          userId,
          startDate: session.startTime,
          endDate: session.endTime,
          summary,
          messageCount: session.messages.length,
        },
      });

      // PERMANENT DELETE (Hard delete as per policy)
      // Or Soft delete? Policy said "permanently deleting old raw message content".
      // Let's hard delete to save space.
      await tx.message.deleteMany({
        where: {
          id: { in: session.messages.map((m) => m.id) },
        },
      });
    });
  }
}
