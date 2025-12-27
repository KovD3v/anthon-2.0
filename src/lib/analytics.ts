/**
 * Centralized analytics helpers for consistent event tracking.
 * Use these helpers instead of calling posthog directly for type safety.
 */

import posthog from "posthog-js";
import { captureEvent as captureServerEvent } from "./posthog";

// ============================================================================
// Client-side Analytics (use in React components)
// ============================================================================

export const analytics = {
  // Chat events
  chatStarted: (chatId: string) => {
    posthog.capture("chat_started", { chatId });
  },

  chatMessageSent: (chatId: string, messageLength: number) => {
    posthog.capture("chat_message_sent", { chatId, messageLength });
  },

  chatFeedback: (
    chatId: string,
    messageId: string,
    rating: "positive" | "negative",
  ) => {
    posthog.capture("chat_feedback", { chatId, messageId, rating });
  },

  // Feature usage
  voiceMessageSent: (chatId: string) => {
    posthog.capture("voice_message_sent", { chatId });
  },

  imageUploaded: (chatId: string) => {
    posthog.capture("image_uploaded", { chatId });
  },

  documentUploaded: (chatId: string, documentType: string) => {
    posthog.capture("document_uploaded", { chatId, documentType });
  },

  // User actions
  themeChanged: (theme: string) => {
    posthog.capture("theme_changed", { theme });
  },

  preferencesUpdated: (preference: string, value: unknown) => {
    posthog.capture("preferences_updated", { preference, value });
  },

  // Subscription events
  subscriptionViewed: () => {
    posthog.capture("subscription_viewed");
  },

  subscriptionStarted: (planId: string) => {
    posthog.capture("subscription_started", { planId });
  },
};

// ============================================================================
// Server-side Analytics (use in API routes and server components)
// ============================================================================

export const serverAnalytics = {
  chatCompleted: (
    userId: string,
    chatId: string,
    metrics: {
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
      model: string;
      latencyMs?: number;
    },
  ) => {
    captureServerEvent(userId, "chat_completed", {
      chatId,
      ...metrics,
    });
  },

  rateLimitHit: (userId: string, reason: string) => {
    captureServerEvent(userId, "rate_limit_hit", { reason });
  },

  ragSearchPerformed: (userId: string, chatId: string, chunksFound: number) => {
    captureServerEvent(userId, "rag_search_performed", {
      chatId,
      chunksFound,
    });
  },

  memoryExtracted: (userId: string, memoryCount: number) => {
    captureServerEvent(userId, "memory_extracted", { memoryCount });
  },

  toolUsed: (userId: string, chatId: string, toolName: string) => {
    captureServerEvent(userId, "tool_used", { chatId, toolName });
  },

  voiceGenerated: (userId: string, chatId: string, durationMs: number) => {
    captureServerEvent(userId, "voice_generated", { chatId, durationMs });
  },
};
