/**
 * Shared Types
 *
 * Centralized types used across the application.
 * Import from here instead of defining inline.
 */

// -----------------------------------------------------
// Attachments
// -----------------------------------------------------

export interface AttachmentData {
  id: string;
  name: string;
  contentType: string;
  size: number;
  url: string;
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

// -----------------------------------------------------
// Usage Metrics (for messages)
// -----------------------------------------------------

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cost: number;
  generationTimeMs?: number;
  reasoningTimeMs?: number;
}

// -----------------------------------------------------
// Chat Message
// -----------------------------------------------------

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string | null;
  parts: unknown;
  createdAt: string;
  model?: string;
  usage?: Usage;
  ragUsed?: boolean;
  toolCalls?: unknown;
  attachments?: StoredAttachment[];
}

// -----------------------------------------------------
// Chat Data (Full chat with messages)
// -----------------------------------------------------

export interface ChatData {
  id: string;
  title: string;
  visibility: string;
  isOwner: boolean;
  createdAt?: string;
  updatedAt?: string;
  messages: ChatMessage[];
  pagination?: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

// -----------------------------------------------------
// Chat List Item (Summary for sidebar)
// -----------------------------------------------------

export interface Chat {
  id: string;
  title: string;
  visibility: "PRIVATE" | "PUBLIC";
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}
