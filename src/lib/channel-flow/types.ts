import type { Prisma } from "@/generated/prisma";
import type { AIMetrics } from "@/lib/ai/cost-calculator";
import type { EffectiveEntitlements } from "@/lib/organizations/types";

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
  };
  execution?: {
    mode?: "stream" | "text";
  };
  persistence?: {
    saveAssistantMessage?: boolean;
    channel: "WEB" | "TELEGRAM" | "WHATSAPP";
    metadata?: Prisma.InputJsonValue;
    updateChatTimestamp?: boolean;
    revalidateTags?: string[];
    waitUntil?: (promise: Promise<unknown>) => void;
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
  persistence?: {
    status: "saved" | "skipped" | "failed";
    messageId?: string;
    error?: unknown;
  };
  rateLimit?: {
    status: "denied";
    upgradeInfo?: unknown;
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
  waitUntil?: (promise: Promise<unknown>) => void;
  /** Create the durable web TTS job in the same transaction as the message. */
  voiceGeneration?: {
    expiresAt: Date;
  };
}
