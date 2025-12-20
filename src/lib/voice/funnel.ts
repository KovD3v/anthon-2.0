/**
 * Voice Generation Funnel Pipeline
 *
 * 4-level filtering system to determine if a message should be sent as voice:
 * L1: User Preference (Quiet Mode)
 * L2: Structural Analysis (length, format)
 * L3: Semantic Classification + User Intent (LLM-based)
 * L4: Business Logic (caps, system load, probability)
 */

import { generateObject } from "ai";
import { z } from "zod";
import { openrouter } from "@/lib/ai/providers/openrouter";
import { prisma } from "@/lib/db";
import { LatencyLogger } from "@/lib/latency-logger";
import type { VoicePlanConfig } from "./config";

export type FunnelBlockedAt =
  | "L1_PREFERENCE"
  | "L2_STRUCTURE"
  | "L3_SEMANTIC"
  | "L4_BUSINESS";

export interface FunnelResult {
  shouldGenerateVoice: boolean;
  blockedAt?: FunnelBlockedAt;
  reason?: string;
}

export interface FunnelParams {
  userId: string;
  userMessage: string;
  assistantText: string;
  conversationContext?: Array<{ role: string; content: string }>;
  userPreferences: { voiceEnabled?: boolean | null };
  planConfig: VoicePlanConfig;
  systemLoad: number | Promise<number> | (() => Promise<number>);
  planId?: string | null;
}

// Structural patterns that indicate text-only content
const CODE_BLOCK_REGEX = /```[\s\S]*?```/;
const TABLE_REGEX = /\|[-:]+\|/;
const URL_REGEX = /https?:\/\/[^\s]+/;

/**
 * Main funnel function - runs all 4 levels sequentially.
 */
export async function shouldGenerateVoice(
  params: FunnelParams,
): Promise<FunnelResult> {
  return await LatencyLogger.measure("Voice: Full Funnel", async () => {
    const {
      userId,
      userMessage,
      assistantText,
      conversationContext,
      userPreferences,
      planConfig,
      systemLoad,
      planId,
    } = params;

    // Check if voice is enabled for this plan
    if (!planConfig.enabled) {
      return {
        shouldGenerateVoice: false,
        blockedAt: "L1_PREFERENCE",
        reason: "Voice not enabled for plan",
      };
    }

    // L1: User Preference (Quiet Mode)
    const l1Result = checkLevel1Preference(userPreferences);
    if (!l1Result.pass) {
      console.log(`[VoiceFunnel] Blocked at L1: ${l1Result.reason}`);
      return {
        shouldGenerateVoice: false,
        blockedAt: "L1_PREFERENCE",
        reason: l1Result.reason,
      };
    }

    // L2: Structural Analysis
    const l2Result = checkLevel2Structure(assistantText);
    if (!l2Result.pass) {
      console.log(`[VoiceFunnel] Blocked at L2: ${l2Result.reason}`);
      return {
        shouldGenerateVoice: false,
        blockedAt: "L2_STRUCTURE",
        reason: l2Result.reason,
      };
    }

    // L3: Semantic Classification + User Intent
    const l3Result = await checkLevel3Semantic(
      userMessage,
      assistantText,
      conversationContext,
    );
    if (!l3Result.pass) {
      console.log(`[VoiceFunnel] Blocked at L3: ${l3Result.reason}`);
      return {
        shouldGenerateVoice: false,
        blockedAt: "L3_SEMANTIC",
        reason: l3Result.reason,
      };
    }

    // L4: Business Logic (always runs, even with voice requests)
    const loadValue =
      typeof systemLoad === "function"
        ? await systemLoad()
        : typeof systemLoad === "number"
          ? systemLoad
          : await systemLoad;

    const l4Result = await checkLevel4Business(
      userId,
      planConfig,
      loadValue,
      planId,
    );
    if (!l4Result.pass) {
      console.log(`[VoiceFunnel] Blocked at L4: ${l4Result.reason}`);
      return {
        shouldGenerateVoice: false,
        blockedAt: "L4_BUSINESS",
        reason: l4Result.reason,
      };
    }

    console.log("[VoiceFunnel] Passed all checks!");
    return { shouldGenerateVoice: true };
  });
}

// -----------------------------------------------------
// L1: User Preference
// -----------------------------------------------------

function checkLevel1Preference(preferences: {
  voiceEnabled?: boolean | null;
}): { pass: boolean; reason?: string } {
  if (preferences.voiceEnabled === false) {
    return { pass: false, reason: "Quiet mode enabled" };
  }
  return { pass: true };
}

// -----------------------------------------------------
// L2: Structural Analysis
// -----------------------------------------------------

function checkLevel2Structure(text: string): {
  pass: boolean;
  reason?: string;
} {
  // Length checks
  if (text.length < 15) {
    return { pass: false, reason: "Text too short" };
  }
  if (text.length > 2000) {
    return { pass: false, reason: "Text too long" };
  }

  // Format checks
  if (CODE_BLOCK_REGEX.test(text)) {
    return { pass: false, reason: "Contains code blocks" };
  }
  if (TABLE_REGEX.test(text)) {
    return { pass: false, reason: "Contains tables" };
  }
  if (URL_REGEX.test(text)) {
    return { pass: false, reason: "Contains URLs" };
  }

  return { pass: true };
}

// -----------------------------------------------------
// L3: Semantic Classification + User Intent
// -----------------------------------------------------

const semanticSchema = z.object({
  decision: z.enum(["VOICE", "TEXT"]),
  reason: z.enum([
    "user_requested_voice",
    "user_requested_text",
    "conversational",
    "emotional_support",
    "storytelling",
    "technical_list",
    "code_or_data",
    "step_instructions",
  ]),
  confidence: z.number().min(0).max(1),
});

async function checkLevel3Semantic(
  userMessage: string,
  assistantText: string,
  conversationContext?: Array<{ role: string; content: string }>,
): Promise<{ pass: boolean; reason?: string }> {
  return await LatencyLogger.measure(
    "Voice: L3 Semantic",
    async () => {
      try {
        // Build context string from last 3 messages
        const contextStr =
          conversationContext
            ?.slice(-3)
            .map((m) => `${m.role}: ${m.content.slice(0, 100)}`)
            .join("\n") || "";

        const result = await generateObject({
          model: openrouter("google/gemini-2.0-flash-001"),
          schema: semanticSchema,
          prompt: `Decidi se questa risposta dovrebbe essere inviata come AUDIO vocale o come TESTO scritto.

## Regole di priorità:
1. Se l'utente chiede esplicitamente testo ("scrivimi", "lista", "testo"): → TEXT
2. Se l'utente chiede esplicitamente audio ("vocale", "audio"): → VOICE
3. Altrimenti valuta il contenuto:
   - VOICE: spiegazioni discorsive, storytelling, supporto emotivo, sintesi
   - TEXT: liste dense, dati tabellari, codice, istruzioni tecniche step-by-step

## Contesto conversazione:
${contextStr}

## Messaggio utente:
"${userMessage}"

## Risposta da valutare:
"${assistantText.slice(0, 500)}"`,
        });

        const { decision, reason, confidence } = result.object;

        // TEXT decision blocks voice
        if (decision === "TEXT") {
          return { pass: false, reason: `Semantic: ${reason}` };
        }

        // Low confidence defaults to text
        if (confidence < 0.6) {
          return {
            pass: false,
            reason: "Low confidence, defaulting to text",
          };
        }

        return { pass: true };
      } catch (error) {
        console.error(
          "[VoiceFunnel] L3 semantic classification failed:",
          error,
        );
        // On error, default to text (conservative)
        return { pass: false, reason: "Semantic classification error" };
      }
    },
    "Voice: Full Funnel",
  );
}

// -----------------------------------------------------
// L4: Business Logic
// -----------------------------------------------------

async function checkLevel4Business(
  userId: string,
  config: VoicePlanConfig,
  systemLoad: number,
  planId?: string | null,
): Promise<{ pass: boolean; reason?: string }> {
  // Circuit breaker: if system load is critical, only pro users can use voice
  const isPro = planId?.toLowerCase().includes("pro") || false;
  if (systemLoad < 0.3 && !isPro) {
    return { pass: false, reason: "System load critical, pro users only" };
  }

  // Hard cap check: count voice messages in the window
  const windowStart = new Date(Date.now() - config.capWindowMs);
  const voiceCount = await prisma.voiceUsage.count({
    where: {
      userId,
      generatedAt: { gte: windowStart },
    },
  });

  if (voiceCount >= config.maxPerWindow) {
    return { pass: false, reason: "Voice cap reached for window" };
  }

  // Probability calculation with decay
  // P_final = P_base × (D^N) × L
  const pFinal =
    config.baseProbability * config.decayFactor ** voiceCount * systemLoad;

  // Entropy check for natural distribution
  const random = Math.random();

  console.log("[VoiceFunnel] L4 Probabilities:", {
    base: config.baseProbability,
    decay: config.decayFactor,
    count: voiceCount,
    load: systemLoad,
    final: pFinal,
    roll: random,
  });

  if (random >= pFinal) {
    return {
      pass: false,
      reason: `Probability check failed (${(pFinal * 100).toFixed(
        1,
      )}% vs roll ${(random * 100).toFixed(1)}%)`,
    };
  }

  return { pass: true };
}

/**
 * Track voice usage after successful generation.
 */
export async function trackVoiceUsage(
  userId: string,
  characterCount: number,
  channel: "WEB" | "TELEGRAM" | "WHATSAPP" = "TELEGRAM",
  costUsd?: number,
): Promise<void> {
  await prisma.voiceUsage.create({
    data: {
      userId,
      characterCount,
      costUsd,
      channel,
    },
  });
}
