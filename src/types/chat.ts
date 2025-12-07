/**
 * Shared Chat Types
 *
 * These types are used across the chat UI, API routes, and components
 * to ensure type consistency throughout the application.
 */

// -----------------------------------------------------
// Usage Metrics
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
  attachments?: Array<{
    id: string;
    name: string;
    contentType: string;
    size: number;
    blobUrl: string;
  }>;
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
