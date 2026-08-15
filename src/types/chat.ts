/**
 * Shared Types
 *
 * Centralized types used across the application.
 * Import from here instead of defining inline.
 */

import type { ChatIcon } from "@/lib/chat-icons";
import type { RoutineCardData } from "@/lib/coaching/routine";
import type { RoutineChatMode } from "@/lib/coaching/routine-chat";
import type {
  ClientTraceV1,
  ServerTraceV1,
} from "@/lib/response-profiler/contracts";
import type { DeveloperDiagnosticsV1 } from "@/lib/response-profiler/developer-diagnostics";

// -----------------------------------------------------
// Attachments
// -----------------------------------------------------

export interface AttachmentData {
  id: string;
  name: string;
  contentType: string;
  size: number;
  url: string;
  base64Data?: string; // Base64-encoded data for audio files sent to AI
}

export interface StoredAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  blobUrl: string;
}

// -----------------------------------------------------
// Usage & Rate Limits
// -----------------------------------------------------

export interface DailyUsage {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
}

export interface RateLimits {
  maxRequests: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostUsd: number;
}

export interface EntitlementSource {
  type: "personal" | "organization";
  sourceId: string;
  sourceLabel: string;
}

export interface UsageEntitlements {
  modelTier: string;
  sources: EntitlementSource[];
}

export type UsageTier =
  | "GUEST"
  | "TRIAL"
  | "BASIC"
  | "BASIC_PLUS"
  | "PRO"
  | "ADMIN";

// -----------------------------------------------------
// Full Usage and Limits (for layout/sidebar)
// -----------------------------------------------------

export interface UsageData {
  usage: DailyUsage;
  limits: RateLimits;
  tier: UsageTier;
  subscriptionStatus:
    | "TRIAL"
    | "ACTIVE"
    | "CANCELED"
    | "EXPIRED"
    | "PAST_DUE"
    | null;
  entitlements?: UsageEntitlements;
}

// -----------------------------------------------------
// Usage Metrics (for messages)
// -----------------------------------------------------

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cost: number;
  /** Durable message ID exposed only in admin technical details. */
  messageId?: string;
  generationTimeMs?: number;
  reasoningTimeMs?: number;
  serverTrace?: ServerTraceV1;
  clientTrace?: ClientTraceV1;
  developerDiagnostics?: DeveloperDiagnosticsV1;
  model?: string;
  provider?: string;
  executedProfile?: "light" | "standard";
  reasoningTokens?: number;
  toolCallCount?: number;
  toolResultChars?: number;
  toolTiming?: {
    firstModelStepMs?: number;
    toolExecutionMs?: number;
    finalModelStepMs?: number;
  };
  ragAttempted?: boolean;
  ragUsed?: boolean;
  ragChunksCount?: number;
  memoryRecall?: {
    mode: "off" | "shadow" | "active";
    reason: string;
    factCount: number;
    evidenceCount: number;
    factRecallMs: number;
    conversationRecallMs: number;
    degraded: boolean;
  };
  executionRoute?: {
    routingMode: "off" | "shadow" | "active";
    eligibleProfile: "light" | "standard";
    plannedProfile: "light" | "standard";
    executedProfile: "light" | "standard";
    taskKind: string;
    decisionSource: "classifier" | "rule" | "mixed" | "fallback";
    confidenceBucket: "low" | "medium" | "high";
    reasonCodes: string[];
    classificationLatencyMs: number;
    classifierModel?: string;
    classifierProvider?: string;
    routingOverheadMs: number;
    totalRequestTimeToFirstTokenMs?: number;
    attempts: Array<{
      sequence: 1 | 2;
      profile: "light" | "standard";
      outcome:
        | "completed"
        | "failed_before_stream"
        | "failed_during_stream"
        | "cancelled";
      timeToFirstTokenMs?: number;
      generationTimeMs: number;
      inputTokens?: number;
      outputTokens?: number;
      reasoningTokens?: number;
      costUsd?: number;
    }>;
    escalation?: {
      from: "light";
      to: "standard";
      reason: "provider_error" | "empty_response" | "runtime_invariant";
    };
  };
}

// -----------------------------------------------------
// Chat Message
// -----------------------------------------------------

export type MessageFeedbackReason =
  | "linguistic_error"
  | "wrong_fact"
  | "context_missed"
  | "too_generic"
  | "tool_search_problem"
  | "other";

export interface ChatMessage {
  id: string;
  /** Stable browser-generated turn id used to preserve UI identity after persistence. */
  clientMessageId?: string;
  /** Browser turn id of the user message that produced this assistant response. */
  sourceClientMessageId?: string;
  role: "user" | "assistant";
  content: string | null;
  parts: unknown;
  createdAt: string;
  model?: string;
  usage?: Usage;
  ragUsed?: boolean;
  toolCalls?: unknown;
  attachments?: StoredAttachment[];
  voice?: {
    status?: "PENDING" | "PROCESSING" | "READY" | "FAILED" | "CANCELLED";
    errorCode?: string;
    reasonCode?: string;
    /** True only when the user explicitly asked for an audio reply. */
    isExplicitRequest?: boolean;
  };
  feedback?: -1 | 0 | 1 | null;
  feedbackReason?: MessageFeedbackReason;
}

// -----------------------------------------------------
// Chat Data (Full chat with messages)
// -----------------------------------------------------

export interface ChatData {
  id: string;
  title: string;
  icon: ChatIcon;
  visibility: string;
  isOwner: boolean;
  createdAt?: string;
  updatedAt?: string;
  messages: ChatMessage[];
  routines: RoutineCardData[];
  /** Existing routine invoked by this chat, when created from the collection. */
  routineContext?: {
    mode: RoutineChatMode;
    routine: RoutineCardData;
  };
  pagination?: {
    hasMore: boolean;
    nextCursor: string | null;
  };
  /** User preference for voice messages (false = Quiet Mode) */
  voiceEnabled?: boolean;
  /** Whether user's plan includes voice feature */
  voicePlanEnabled?: boolean;
}

// -----------------------------------------------------
// Chat List Item (Summary for sidebar)
// -----------------------------------------------------

export interface Chat {
  id: string;
  title: string;
  icon: ChatIcon;
  visibility: "PRIVATE" | "PUBLIC";
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}
