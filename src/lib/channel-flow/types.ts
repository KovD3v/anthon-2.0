import type { Prisma } from "@/generated/prisma";
import type { CapabilityDecision } from "@/lib/ai/capability-arbitration";
import type { AIMetrics } from "@/lib/ai/cost-calculator";
import type { MemoryRecallDecision } from "@/lib/ai/memory-recall-release";
import type { PreparedTurnContext } from "@/lib/ai/orchestrator";
import type { TurnDecision } from "@/lib/ai/turn-decision";
import type { EffectiveEntitlements } from "@/lib/organizations/types";
import type { ServerTraceCollector } from "@/lib/response-profiler/server-trace";

export type ChannelKind = "WEB" | "WEB_GUEST" | "TELEGRAM" | "WHATSAPP";

export type ChannelMessagePart = {
  type: "text" | "file";
  text?: string;
  data?: string;
  mimeType?: string;
  name?: string;
  size?: number;
  attachmentId?: string;
};

export interface InboundContext {
  channel: ChannelKind;
  userId: string;
  chatId?: string;
  conversationThreadId?: string;
  userMessageId?: string;
  externalMessageId?: string;
  userMessageText: string;
  parts: ChannelMessagePart[];
  rateLimit: {
    allowed: boolean;
    effectiveEntitlements?: EffectiveEntitlements;
    upgradeInfo?: unknown;
  };
  options: {
    allowAttachments: boolean;
    allowMemoryExtraction: boolean;
    allowVoiceOutput: boolean;
  };
  ai?: {
    planId?: string | null;
    userRole?: string;
    subscriptionStatus?: string;
    isGuest?: boolean;
    hasImages?: boolean;
    hasAudio?: boolean;
    inputOrigin?: "text" | "transcribed_voice" | "direct_media";
    transcriptionStatus?: "not_needed" | "success" | "failed";
    responseMode?: "text" | "voice";
    voiceEnabled?: boolean;
    voiceUnavailableReason?: string;
    skipConversationHistory?: boolean;
    routineProposalAllowed?: boolean;
    preparedTurnContext?: PreparedTurnContext;
    memoryRecallDecision?: MemoryRecallDecision;
  };
  execution?: {
    mode?: "stream" | "text";
    /** Controls diagnostic metadata in UI stream/recovery/replay responses. */
    includeTechnicalMetrics?: boolean;
    /** Enables expanded profiler collection for an authorized private owner. */
    includeTechnicalDiagnostics?: boolean;
    /** Request-scoped profiler shared by setup, generation, and persistence. */
    traceCollector?: ServerTraceCollector;
    abortSignal?: AbortSignal;
    waitUntil?: (promise: Promise<unknown>) => void;
  };
  persistence?: {
    saveAssistantMessage?: boolean;
    channel: "WEB" | "TELEGRAM" | "WHATSAPP";
    metadata?: Prisma.InputJsonValue;
    updateChatTimestamp?: boolean;
    revalidateTags?: string[];
    waitUntil?: (promise: Promise<unknown>) => void;
    /** Current external inbound claim. Used to fence stale webhook workers. */
    externalInboundClaimToken?: string;
  };
  hooks?: {
    onFinish?: (result: {
      text: string;
      metrics: AIMetrics;
    }) => Promise<void> | void;
  };
}

export interface RunChannelFlowResult {
  assistantText: string;
  metrics?: AIMetrics;
  capabilityMetadataValid: boolean;
  executionMetadataValid: boolean;
  turnDecision?: TurnDecision;
  capabilityDecision?: CapabilityDecision;
  capabilityPlannerMode?: "legacy" | "agentic";
  memoryRecallDecision?: MemoryRecallDecision;
  usageReservationId?: string;
  usageReservationClaimToken?: string;
  usageAlreadyReconciled?: boolean;
  persistence?: {
    status: "saved" | "skipped" | "failed";
    messageId?: string;
    error?: unknown;
  };
  rateLimit?: {
    status: "denied";
    upgradeInfo?: unknown;
    reason?: string;
    retryable?: boolean;
  };
  streamResult?: {
    toUIMessageStreamResponse: () => Response;
    textStream: AsyncIterable<string>;
  };
}

export interface PersistAssistantOutputInput {
  userId: string;
  chatId?: string;
  conversationThreadId?: string;
  userMessageId?: string;
  channel: "WEB" | "TELEGRAM" | "WHATSAPP";
  text: string;
  userMessageText: string;
  metrics: AIMetrics;
  messageType?: "TEXT" | "AUDIO";
  mediaUrl?: string;
  mediaType?: string;
  metadata?: Prisma.InputJsonValue;
  updateChatTimestamp?: boolean;
  revalidateTags?: string[];
  allowMemoryExtraction?: boolean;
  allowConversationIndexing?: boolean;
  presentedMemoryApprovalId?: string;
  capabilityDecision?: CapabilityDecision;
  capabilityPlannerMode?: "legacy" | "agentic";
  waitUntil?: (promise: Promise<unknown>) => void;
  usageReservationId?: string;
  usageReservationClaimToken?: string;
  usageAlreadyReconciled?: boolean;
  externalInboundClaimToken?: string;
  /** Request-scoped, best-effort technical trace for the generated response. */
  traceCollector?: ServerTraceCollector;
  /** Create the durable web TTS job in the same transaction as the message. */
  voiceGeneration?: {
    expiresAt: Date;
  };
}
