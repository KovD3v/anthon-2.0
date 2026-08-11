import { waitUntil } from "@vercel/functions";
import type { UIMessage } from "ai";
import type { Prisma } from "@/generated/prisma";
import { generateChatMetadata } from "@/lib/ai/chat-title";
import { loadTrustedRemoteMedia } from "@/lib/ai/multimodal-media";
import { trackInboundUserMessageFunnelProgress } from "@/lib/analytics/funnel";
import { resolveAuthenticatedClerkId } from "@/lib/auth-identity";
import {
  isBillingSyncStale,
  syncPersonalSubscriptionFromClerk,
} from "@/lib/billing/personal-subscription";
import type { ChannelMessagePart } from "@/lib/channel-flow";
import { runChannelFlow } from "@/lib/channel-flow";
import { persistAssistantOutput } from "@/lib/channel-flow/persistence";
import {
  claimWebInboundMessage,
  createWebTextStreamResponse,
  findExistingWebInboundMessage,
  getWebClientPayloadHash,
  isValidWebClientMessageId,
  textFromPersistedAssistant,
  WebInboundConflictError,
} from "@/lib/channel-flow/web-inbound";
import {
  resolveOwnedWebMessageParts,
  WebAttachmentInputError,
} from "@/lib/channels/web/attachment-input";
import { isRoutineFeatureEnabled } from "@/lib/coaching/routine-feature";
import { ensureConversationThread } from "@/lib/conversations/threads";
import { prisma } from "@/lib/db";
import { LatencyLogger } from "@/lib/latency-logger";
import { createLogger, withRequestLogContext } from "@/lib/logger";
import { tryCreateModelComparisonResponse } from "@/lib/model-experiments/runtime";
import { checkRateLimit, reconcileAiUsageForRecovery } from "@/lib/rate-limit";
import { resolveTechnicalMetricsVisibility } from "@/lib/technical-metrics";
import { transcribeAudio } from "@/lib/transcription";
import { decideWebVoiceMode, getVoiceUnavailability } from "@/lib/voice";
import { getVoicePlanConfig } from "@/lib/voice/config";
import {
  getVoiceGenerationExpiry,
  scheduleVoiceGenerationJob,
  withVoiceGenerationStatus,
} from "@/lib/voice/generation-jobs";

const logger = createLogger("ai");

export async function handleWebChatPost(request: Request) {
  return withRequestLogContext(
    request,
    { route: "/api/chat", channel: "WEB" },
    async () => {
      const requestTimer = LatencyLogger.start("🌐 Chat API Request");

      try {
        // Authenticate user with Clerk
        const clerkId = await LatencyLogger.measure(
          "Auth: Clerk authentication",
          () => resolveAuthenticatedClerkId(request),
          "🌐 Chat API Request",
        );

        if (!clerkId) {
          logger.warn(
            "auth.unauthenticated",
            "Request rejected: unauthenticated",
          );
          return new Response("Unauthorized", { status: 401 });
        }

        logger.debug("auth.authenticated", "Authenticated request", {
          clerkId,
        });

        // Parse request body before DB/rate-limit work so malformed requests
        // do not consume quota or trigger unrelated side effects.
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const { messages, chatId } = body as {
          messages: UIMessage[];
          chatId?: string;
        };

        // Validate structural request input before DB/rate-limit work.
        if (!isValidMessageArray(messages)) {
          return Response.json(
            { error: "messages must be a non-empty array" },
            { status: 400 },
          );
        }

        if (!chatId) {
          return Response.json(
            { error: "chatId is required" },
            { status: 400 },
          );
        }

        // Get and validate the last user message before DB/rate-limit work.
        const lastUserMessage = messages.filter((m) => m.role === "user").pop();

        if (!lastUserMessage) {
          return new Response("No user message provided", { status: 400 });
        }

        if (!isValidWebClientMessageId(lastUserMessage.id)) {
          return Response.json(
            { error: "A valid user message id is required" },
            { status: 400 },
          );
        }
        const clientMessageId = lastUserMessage.id;
        const clientPayloadHash = getWebClientPayloadHash(
          lastUserMessage.parts,
        );

        const userMessageText =
          lastUserMessage.parts
            ?.map((part) =>
              part.type === "text" ? (part as { text: string }).text : "",
            )
            .join("") || "";
        const normalizedUserMessageText = userMessageText.trim();

        const hasSubmittedAttachments = lastUserMessage.parts?.some(
          (part) => part.type === "file",
        );

        if (lastUserMessage.parts?.some(hasUnsupportedFilePayload)) {
          return Response.json(
            { error: "Unsupported file payload" },
            { status: 400 },
          );
        }

        if (!normalizedUserMessageText && !hasSubmittedAttachments) {
          return new Response("Empty message", { status: 400 });
        }

        // Get or create internal user with subscription info
        const user = await LatencyLogger.measure(
          "DB: Find user",
          async () => {
            const existing = await prisma.user.findUnique({
              where: { clerkId },
              select: {
                id: true,
                role: true,
                isGuest: true,
                billingSyncedAt: true,
                subscription: {
                  select: {
                    status: true,
                    planId: true,
                  },
                },
                preferences: {
                  select: {
                    voiceEnabled: true,
                    showTechnicalMetrics: true,
                  },
                },
              },
            });

            if (existing) return existing;

            // Fallback to upsert only if not found (rare case after initial signup)
            return prisma.user.upsert({
              where: { clerkId },
              update: {},
              create: { clerkId },
              select: {
                id: true,
                role: true,
                isGuest: true,
                billingSyncedAt: true,
                subscription: {
                  select: {
                    status: true,
                    planId: true,
                  },
                },
                preferences: {
                  select: {
                    voiceEnabled: true,
                    showTechnicalMetrics: true,
                  },
                },
              },
            });
          },
          "🌐 Chat API Request",
        );

        const routineProposalAllowed = await isRoutineFeatureEnabled({
          distinctId: clerkId,
          role: user.role,
          isGuest: user.isGuest,
        });

        let subscriptionStatus = user.subscription?.status;
        let planId = user.subscription?.planId;

        // Verify chat ownership
        const chat = await LatencyLogger.measure(
          "DB: Verify chat ownership",
          () =>
            prisma.chat.findFirst({
              where: { id: chatId, userId: user.id },
              select: {
                id: true,
                title: true,
                customTitle: true,
                visibility: true,
                _count: { select: { messages: true } },
              },
            }),
          "🌐 Chat API Request",
        );

        if (!chat) {
          return Response.json(
            { error: "Chat not found or access denied" },
            { status: 404 },
          );
        }

        const conversationThread = await ensureConversationThread({
          userId: user.id,
          channel: "WEB",
          externalThreadId: chatId,
          chatId,
        });

        let existingInbound: Awaited<
          ReturnType<typeof findExistingWebInboundMessage>
        >;
        try {
          existingInbound = await findExistingWebInboundMessage({
            userId: user.id,
            chatId,
            conversationThreadId: conversationThread.id,
            clientMessageId,
            payloadHash: clientPayloadHash,
          });
        } catch (error) {
          if (error instanceof WebInboundConflictError) {
            return Response.json(
              { error: error.message, reason: error.reason },
              { status: error.status },
            );
          }
          throw error;
        }

        if (existingInbound?.generatedResponse) {
          const savedText = textFromPersistedAssistant(
            existingInbound.generatedResponse,
          );
          if (!savedText.trim()) {
            throw new Error("Persisted assistant response has no text");
          }
          requestTimer.split("Idempotent replay complete");
          return createWebTextStreamResponse(
            existingInbound.generatedResponse.id,
            savedText,
          );
        }

        const shouldSyncSubscription =
          !user.isGuest &&
          isBillingSyncStale(user.billingSyncedAt) &&
          (!subscriptionStatus || !planId || subscriptionStatus === "TRIAL");

        if (shouldSyncSubscription) {
          const syncedSubscription = await LatencyLogger.measure(
            "Billing: Sync personal subscription",
            () =>
              syncPersonalSubscriptionFromClerk({
                userId: user.id,
                clerkUserId: clerkId,
                current: {
                  status: subscriptionStatus,
                  planId,
                },
              }),
            "🌐 Chat API Request",
          );

          subscriptionStatus = syncedSubscription?.status ?? subscriptionStatus;
          planId = syncedSubscription?.planId ?? planId;
        }

        // Check rate limit after ownership verification so missing or
        // inaccessible chats do not consume quota.
        const rateLimitResult = await LatencyLogger.measure(
          "Rate Limit: Check limits",
          () =>
            checkRateLimit(
              user.id,
              subscriptionStatus,
              user.role,
              planId,
              user.isGuest,
            ),
          "🌐 Chat API Request",
        );

        if (!rateLimitResult.allowed) {
          return Response.json(
            {
              error: "Rate limit exceeded",
              reason: rateLimitResult.reason,
              usage: rateLimitResult.usage,
              limits: rateLimitResult.limits,
              upgradeInfo: rateLimitResult.upgradeInfo,
            },
            { status: 429 },
          );
        }

        const requestConversationMessageCount = messages.filter(
          (message) => message.role === "user" || message.role === "assistant",
        ).length;

        let resolvedMessageParts: Awaited<
          ReturnType<typeof resolveOwnedWebMessageParts>
        >;
        try {
          resolvedMessageParts = await resolveOwnedWebMessageParts(
            lastUserMessage,
            user.id,
            {
              allowedExistingInboundMessageId: existingInbound?.id,
            },
          );
        } catch (error) {
          if (error instanceof WebAttachmentInputError) {
            return Response.json(
              { error: "Invalid or inaccessible attachment" },
              { status: 400 },
            );
          }
          throw error;
        }

        const messageParts = resolvedMessageParts.aiParts;
        const hasAttachments = messageParts.some(
          (part) => part.type === "file",
        );
        const hasImages = messageParts.some(
          (part) => part.type === "file" && part.mimeType?.startsWith("image/"),
        );
        const hadAudioAttachment = messageParts.some(
          (part) => part.type === "file" && part.mimeType?.startsWith("audio/"),
        );
        let inboundClaim: Awaited<ReturnType<typeof claimWebInboundMessage>>;
        try {
          inboundClaim = existingInbound
            ? { message: existingInbound, created: false }
            : await LatencyLogger.measure(
                "DB: Claim user message",
                () =>
                  claimWebInboundMessage({
                    userId: user.id,
                    chatId,
                    conversationThreadId: conversationThread.id,
                    clientMessageId,
                    payloadHash: clientPayloadHash,
                    parts:
                      resolvedMessageParts.persistedParts as Prisma.InputJsonValue,
                    attachmentIds: resolvedMessageParts.attachmentIds,
                  }),
                "🌐 Chat API Request",
              );
        } catch (error) {
          if (error instanceof WebInboundConflictError) {
            return Response.json(
              { error: error.message, reason: error.reason },
              { status: error.status },
            );
          }
          throw error;
        }

        const message = inboundClaim.message;
        if (message.generatedResponse) {
          const savedText = textFromPersistedAssistant(
            message.generatedResponse,
          );
          if (!savedText.trim()) {
            throw new Error("Persisted assistant response has no text");
          }
          return createWebTextStreamResponse(
            message.generatedResponse.id,
            savedText,
          );
        }

        let aiMessageParts: ChannelMessagePart[];
        let aiUserMessageText: string;
        let aiHasAudio: boolean;
        try {
          const preparedInput = await prepareWebMessageForAi({
            messageParts,
            userId: user.id,
            normalizedUserMessageText,
          });
          aiMessageParts = preparedInput.parts;
          aiUserMessageText = preparedInput.userMessageText;
          aiHasAudio = preparedInput.hasAudio;
        } catch (error) {
          logger.error(
            "chat.transcription_failed",
            "Failed transcribing web audio message",
            { error, userId: user.id, chatId },
          );
          return Response.json(
            {
              error:
                "Non sono riuscito a trascrivere l'audio in questo momento. Riprova o invia un messaggio testuale.",
            },
            { status: 502 },
          );
        }

        if (inboundClaim.created) {
          waitUntil(
            trackInboundUserMessageFunnelProgress({
              userId: user.id,
              isGuest: user.isGuest,
              userRole: user.role,
              channel: "WEB",
              planId,
              subscriptionStatus,
            }).catch((error) =>
              logger.error(
                "chat.funnel_tracking_failed",
                "Failed tracking funnel progress",
                {
                  error,
                  userId: user.id,
                  messageId: message.id,
                },
              ),
            ),
          );
        }

        // Auto-generate or refresh chat title if not manually set by user
        if (inboundClaim.created && !chat.customTitle) {
          const shouldRefresh = [1, 2, 4].includes(
            requestConversationMessageCount,
          );

          if (shouldRefresh) {
            const metadataMessages = messages
              .map((m) => {
                const text =
                  m.parts
                    ?.map((p) =>
                      p.type === "text" ? (p as { text: string }).text : "",
                    )
                    .join("")
                    .trim() || "";
                if ((m.role !== "user" && m.role !== "assistant") || !text) {
                  return null;
                }
                return { role: m.role, text };
              })
              .filter((message) => message !== null);

            waitUntil(
              generateChatMetadata(metadataMessages, aiUserMessageText, {
                userId: user.id,
              }).then(({ title, icon }) => {
                prisma.chat
                  .update({
                    where: { id: chatId },
                    data: { title, icon },
                  })
                  .catch((error) =>
                    logger.error(
                      "chat.metadata.update_failed",
                      "Failed updating generated chat metadata",
                      { error, chatId },
                    ),
                  );
              }),
            );
          }
        }

        const voicePlanConfig = getVoicePlanConfig(
          subscriptionStatus,
          user.role,
          planId,
          user.isGuest,
          rateLimitResult.effectiveEntitlements?.modelTier,
        );
        const voiceDecision = await decideWebVoiceMode({
          userId: user.id,
          chatId,
          userMessage: aiUserMessageText,
          recentMessages: getRecentTextMessages(messages),
          userPreferences: {
            voiceEnabled: user.preferences?.voiceEnabled ?? true,
          },
          planConfig: voicePlanConfig,
          planId,
          hasAttachments: Boolean(hasAttachments),
          abortSignal: request.signal,
        });

        logger.info(
          "voice.delivery.decision",
          "Web voice delivery decision completed",
          {
            userId: user.id,
            chatId,
            conversationThreadId: conversationThread.id,
            userMessageId: message.id,
            mode: voiceDecision.mode,
            source: voiceDecision.source,
            category: voiceDecision.category,
            capacityState: voiceDecision.capacityState,
            reasonCode: voiceDecision.reasonCode,
            classifierDiagnostics: voiceDecision.classifierDiagnostics,
          },
        );

        if (voiceDecision.mode === "VOICE") {
          const voiceResponse = await handleVoiceFirstWebResponse({
            userId: user.id,
            chatId,
            conversationThreadId: conversationThread.id,
            userMessageId: message.id,
            userMessageText: aiUserMessageText,
            messageParts: aiMessageParts,
            rateLimitResult,
            planId,
            userRole: user.role,
            subscriptionStatus,
            isGuest: user.isGuest,
            hasImages,
            hasAudio: aiHasAudio,
            inputOrigin: hadAudioAttachment
              ? "transcribed_voice"
              : hasImages
                ? "direct_media"
                : "text",
            voiceDecision,
            routineProposalAllowed,
            abortSignal: request.signal,
            waitUntil,
          });

          requestTimer.split("Voice response complete");
          return voiceResponse;
        }

        const voiceUnavailableReason =
          getExplicitVoiceUnavailableReason(voiceDecision);

        let preparedTurnContext:
          | NonNullable<
              NonNullable<
                Parameters<typeof runChannelFlow>[0]["ai"]
              >["preparedTurnContext"]
            >
          | undefined;
        const comparisonResponse = await tryCreateModelComparisonResponse({
          user: {
            id: user.id,
            clerkId,
            role: user.role,
            isGuest: user.isGuest,
          },
          request,
          chatId,
          conversationThreadId: conversationThread.id,
          sourceMessageId: message.id,
          userMessage: aiUserMessageText,
          planId,
          subscriptionStatus,
          hasAttachments: Boolean(hasAttachments),
          effectiveEntitlements: rateLimitResult.effectiveEntitlements,
          skipConversationHistory: chat._count.messages === 0,
          onPreparedTurnRejected(context) {
            preparedTurnContext = context;
          },
        });
        if (comparisonResponse) {
          requestTimer.split("Model comparison setup complete");
          return comparisonResponse;
        }

        const flowResult = await runChannelFlow({
          channel: "WEB",
          userId: user.id,
          chatId,
          conversationThreadId: conversationThread.id,
          userMessageId: message.id,
          userMessageText: aiUserMessageText,
          parts: aiMessageParts,
          rateLimit: {
            allowed: rateLimitResult.allowed,
            effectiveEntitlements: rateLimitResult.effectiveEntitlements,
            upgradeInfo: rateLimitResult.upgradeInfo,
          },
          options: {
            allowAttachments: true,
            allowMemoryExtraction: true,
            allowVoiceOutput: true,
          },
          ai: {
            planId,
            userRole: user.role,
            subscriptionStatus,
            isGuest: user.isGuest,
            hasImages,
            hasAudio: aiHasAudio,
            inputOrigin: hadAudioAttachment
              ? "transcribed_voice"
              : hasImages
                ? "direct_media"
                : "text",
            transcriptionStatus: hadAudioAttachment ? "success" : "not_needed",
            responseMode: "text",
            voiceEnabled: voiceUnavailableReason ? false : undefined,
            voiceUnavailableReason,
            skipConversationHistory: chat._count.messages === 0,
            routineProposalAllowed,
            preparedTurnContext,
          },
          execution: {
            mode: "stream",
            abortSignal: request.signal,
            includeTechnicalMetrics: resolveTechnicalMetricsVisibility({
              role: user.role,
              preference: user.preferences?.showTechnicalMetrics,
              isGuest: user.isGuest,
              isPrivateOwner: chat.visibility === "PRIVATE",
            }),
          },
          persistence: {
            channel: "WEB",
            saveAssistantMessage: true,
            metadata: buildVoiceDecisionMetadata(voiceDecision),
            updateChatTimestamp: true,
            revalidateTags: [`chats-${user.id}`, `chat-${chatId}`],
            waitUntil,
          },
        });

        if (flowResult.rateLimit) {
          return Response.json(
            {
              error: flowResult.rateLimit.retryable
                ? "Generation already in progress"
                : "Rate limit exceeded",
              reason: flowResult.rateLimit.reason,
              retryable: flowResult.rateLimit.retryable,
              upgradeInfo: flowResult.rateLimit.upgradeInfo,
            },
            { status: flowResult.rateLimit.retryable ? 409 : 429 },
          );
        }

        if (!flowResult.streamResult) {
          throw new Error("Missing stream result");
        }

        requestTimer.split("Setup complete");
        return flowResult.streamResult.toUIMessageStreamResponse();
      } catch (error) {
        logger.error("chat.request.failed", "Chat API request failed", {
          errorName: error instanceof Error ? error.name : "unknown",
        });
        return new Response(
          JSON.stringify({ error: "Internal server error" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    },
  );
}

async function prepareWebMessageForAi({
  messageParts,
  userId,
  normalizedUserMessageText,
}: {
  messageParts: ChannelMessagePart[];
  userId: string;
  normalizedUserMessageText: string;
}) {
  const aiMessageParts: ChannelMessagePart[] = [];
  const transcriptTexts: string[] = [];

  for (const part of messageParts) {
    if (part.type !== "file" || !part.mimeType?.startsWith("audio/")) {
      aiMessageParts.push(part);
      continue;
    }

    if (!part.data?.trim()) {
      throw new Error("Web audio message has no canonical Blob URL");
    }

    const audioBytes = await loadTrustedRemoteMedia({
      url: part.data,
      mediaType: part.mimeType,
      expectedSize: part.size,
    });

    const transcript = await transcribeAudio({
      base64: Buffer.from(audioBytes).toString("base64"),
      mimeType: part.mimeType,
      title: "Web Chat",
      userId,
      source: "WEB",
    });

    transcriptTexts.push(transcript.text);
  }

  if (transcriptTexts.length === 0) {
    return {
      parts: aiMessageParts,
      userMessageText: normalizedUserMessageText,
      hasAudio: false,
    };
  }

  const transcriptText = transcriptTexts
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n\n");

  if (!transcriptText) {
    throw new Error("Web audio transcription is empty");
  }

  const transcriptPartText = normalizedUserMessageText
    ? `Trascrizione del messaggio vocale allegato:\n${transcriptText}`
    : `Trascrizione del messaggio vocale:\n${transcriptText}`;

  aiMessageParts.push({
    type: "text",
    text: transcriptPartText,
  });

  return {
    parts: aiMessageParts,
    userMessageText: [normalizedUserMessageText, transcriptPartText]
      .filter(Boolean)
      .join("\n\n"),
    hasAudio: false,
  };
}

function hasUnsupportedFilePayload(part: UIMessage["parts"][number]) {
  if (part.type !== "file") {
    return false;
  }

  const filePart = part as unknown as {
    attachmentId?: unknown;
  };
  return (
    typeof filePart.attachmentId !== "string" || !filePart.attachmentId.trim()
  );
}

function getRecentTextMessages(messages: UIMessage[]) {
  return messages.slice(-6).map((message) => ({
    role: message.role,
    content:
      message.parts
        ?.map((part) => (part.type === "text" ? part.text : ""))
        .join("")
        .slice(0, 500) || "",
  }));
}

function buildVoiceDecisionMetadata(
  decision: Awaited<ReturnType<typeof decideWebVoiceMode>>,
): Prisma.InputJsonValue {
  return {
    voice: getVoiceDecisionMetadataFields(decision),
  };
}

function getVoiceDecisionMetadataFields(
  decision: Awaited<ReturnType<typeof decideWebVoiceMode>>,
) {
  return {
    mode: decision.mode,
    reason: decision.reason,
    reasonCode: decision.reasonCode,
    category: decision.category,
    capacityState: decision.capacityState,
    source: decision.source,
    ...(decision.suitabilityReason
      ? { suitabilityReason: decision.suitabilityReason }
      : {}),
    ...(decision.suitabilityConfidence !== undefined
      ? { suitabilityConfidence: decision.suitabilityConfidence }
      : {}),
    ...(decision.classifierDiagnostics
      ? { classifierDiagnostics: { ...decision.classifierDiagnostics } }
      : {}),
  };
}

function isValidMessageArray(value: unknown): value is UIMessage[] {
  return Array.isArray(value) && value.length > 0 && value.every(isMessageLike);
}

function isMessageLike(value: unknown): value is UIMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as { role?: unknown; parts?: unknown };
  if (typeof message.role !== "string") {
    return false;
  }

  if (message.parts === undefined) {
    return true;
  }

  return Array.isArray(message.parts) && message.parts.every(isMessagePartLike);
}

function isMessagePartLike(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const part = value as { type?: unknown };
  return typeof part.type === "string";
}

async function handleVoiceFirstWebResponse({
  userId,
  chatId,
  conversationThreadId,
  userMessageId,
  userMessageText,
  messageParts,
  rateLimitResult,
  planId,
  userRole,
  subscriptionStatus,
  isGuest,
  hasImages,
  hasAudio,
  inputOrigin,
  voiceDecision,
  routineProposalAllowed,
  abortSignal,
  waitUntil: schedule,
}: {
  userId: string;
  chatId: string;
  conversationThreadId: string;
  userMessageId: string;
  userMessageText: string;
  messageParts: ChannelMessagePart[];
  rateLimitResult: Awaited<ReturnType<typeof checkRateLimit>>;
  planId?: string | null;
  userRole?: string;
  subscriptionStatus?: string;
  isGuest?: boolean;
  hasImages?: boolean;
  hasAudio?: boolean;
  inputOrigin?: "text" | "transcribed_voice" | "direct_media";
  voiceDecision: Awaited<ReturnType<typeof decideWebVoiceMode>>;
  routineProposalAllowed: boolean;
  abortSignal?: AbortSignal;
  waitUntil?: (promise: Promise<unknown>) => void;
}) {
  const flowResult = await runChannelFlow({
    channel: "WEB",
    userId,
    chatId,
    conversationThreadId,
    userMessageId,
    userMessageText,
    parts: messageParts,
    rateLimit: {
      allowed: rateLimitResult.allowed,
      effectiveEntitlements: rateLimitResult.effectiveEntitlements,
      upgradeInfo: rateLimitResult.upgradeInfo,
    },
    options: {
      allowAttachments: true,
      allowMemoryExtraction: true,
      allowVoiceOutput: true,
    },
    ai: {
      planId,
      userRole,
      subscriptionStatus,
      isGuest,
      hasImages,
      hasAudio,
      inputOrigin,
      transcriptionStatus:
        inputOrigin === "transcribed_voice" ? "success" : "not_needed",
      responseMode: "voice",
      voiceEnabled: true,
      routineProposalAllowed,
    },
    execution: { mode: "text", abortSignal },
    persistence: {
      channel: "WEB",
      saveAssistantMessage: false,
    },
  });

  if (flowResult.rateLimit) {
    return Response.json(
      {
        error: flowResult.rateLimit.retryable
          ? "Generation already in progress"
          : "Rate limit exceeded",
        reason: flowResult.rateLimit.reason,
        retryable: flowResult.rateLimit.retryable,
        upgradeInfo: flowResult.rateLimit.upgradeInfo,
      },
      { status: flowResult.rateLimit.retryable ? 409 : 429 },
    );
  }

  const assistantText = flowResult.assistantText.trim();
  if (!assistantText || !flowResult.metrics) {
    throw new Error("Voice response generation produced no assistant text");
  }
  const voiceGenerationExpiresAt = getVoiceGenerationExpiry();
  let assistantMessage: Awaited<ReturnType<typeof persistAssistantOutput>>;
  try {
    assistantMessage = await persistAssistantOutput({
      userId,
      chatId,
      conversationThreadId,
      userMessageId,
      channel: "WEB",
      text: assistantText,
      userMessageText,
      metrics: flowResult.metrics,
      metadata: {
        responseMode: "voice",
        transcript: assistantText,
        ...withVoiceGenerationStatus(
          {
            voice: getVoiceDecisionMetadataFields(voiceDecision),
          },
          "pending",
        ),
      },
      updateChatTimestamp: true,
      revalidateTags: [`chats-${userId}`, `chat-${chatId}`],
      allowMemoryExtraction: !isGuest && flowResult.capabilityMetadataValid,
      capabilityDecision: flowResult.capabilityMetadataValid
        ? flowResult.capabilityDecision
        : undefined,
      capabilityPlannerMode: flowResult.capabilityMetadataValid
        ? flowResult.capabilityPlannerMode
        : undefined,
      waitUntil: schedule,
      usageReservationId: flowResult.usageReservationId,
      usageReservationClaimToken: flowResult.usageReservationClaimToken,
      usageAlreadyReconciled: flowResult.usageAlreadyReconciled,
      voiceGeneration: { expiresAt: voiceGenerationExpiresAt },
    });
  } catch (error) {
    if (
      flowResult.usageReservationId &&
      flowResult.usageReservationClaimToken &&
      !flowResult.usageAlreadyReconciled
    ) {
      await reconcileAiUsageForRecovery({
        reservationId: flowResult.usageReservationId,
        claimToken: flowResult.usageReservationClaimToken,
        userId,
        text: assistantText,
        metrics: flowResult.metrics,
        capabilityPlannerMode: flowResult.capabilityMetadataValid
          ? flowResult.capabilityPlannerMode
          : undefined,
        capabilityDecision: flowResult.capabilityMetadataValid
          ? flowResult.capabilityDecision
          : undefined,
      }).catch((recoveryError) =>
        logger.error(
          "voice.persistence_recovery_failed",
          "Failed recording voice-first persistence recovery",
          { error: recoveryError, userId, chatId },
        ),
      );
    }
    throw error;
  }

  // Return the persisted transcript immediately; TTS and Blob work continue in
  // the durable worker. A refresh/reconnect reads the same message and its
  // eventual attachment rather than receiving a second assistant message.
  scheduleVoiceGenerationJob(assistantMessage.id, schedule);

  return createWebTextStreamResponse(assistantMessage.id, assistantText);
}

function getExplicitVoiceUnavailableReason(
  decision: Awaited<ReturnType<typeof decideWebVoiceMode>>,
) {
  if (decision.mode !== "TEXT" || decision.category !== "VOICE_REQUIRED") {
    return undefined;
  }

  switch (decision.reasonCode) {
    case "PLAN_NOT_ELIGIBLE":
      return getVoiceUnavailability("PLAN_NOT_ELIGIBLE").userMessage;
    case "QUIET_MODE":
      return getVoiceUnavailability("QUIET_MODE").userMessage;
    case "QUOTA_REACHED":
      return getVoiceUnavailability("QUOTA_REACHED").userMessage;
    case "PROVIDER_RED":
      return getVoiceUnavailability("PROVIDER_UNAVAILABLE").userMessage;
    default:
      return undefined;
  }
}
