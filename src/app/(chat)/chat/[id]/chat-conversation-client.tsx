"use client";

import { useChat } from "@ai-sdk/react";
import { useClerk } from "@clerk/nextjs";
import { DefaultChatTransport, safeValidateUIMessages } from "ai";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useConfirm } from "@/hooks/use-confirm";
import {
  convertToUIMessages,
  extractTextFromParts,
  hasPendingVoiceGeneration,
} from "@/lib/chat-client";
import {
  parseRoutineSourceHydrationPayload,
  type RoutineCardData,
  routineCardDataSchema,
  storedRoutineProposalSchema,
} from "@/lib/coaching/routine";
import { trackRoutineAnalytics } from "@/lib/coaching/routine-analytics-client";
import {
  archiveRoutine,
  createRoutineAttempt,
  type RoutineAttemptOutcome,
  RoutineClientError,
  saveRoutineOutcome,
  saveRoutineProposal,
} from "@/lib/coaching/routine-client";
import type {
  AnthonUIMessage,
  ModelComparisonSlot,
} from "@/lib/model-experiments/types";
import {
  getPaywallCardContent,
  type PaywallCardContent,
} from "@/lib/rate-limit/paywall";
import type { AttachmentData, ChatData } from "@/types/chat";
import { ChatHeader } from "../../../(chat)/components/ChatHeader";
import { ChatInput } from "../../../(chat)/components/ChatInput";
import {
  EmptyChatWelcome,
  MessageList,
} from "../../../(chat)/components/MessageList";
import { SuggestedActions } from "../../../(chat)/components/SuggestedActions";
import { createChatInputWarmup } from "../chat-input-warmup";
import { useChatContext } from "../layout-client";

interface DeleteSnapshot {
  cancelled: boolean;
  previousMessages: AnthonUIMessage[];
  previousChatData: ChatData;
}

const VOICE_GENERATION_POLL_INITIAL_DELAY_MS = 750;
const VOICE_GENERATION_POLL_MAX_ATTEMPTS = 30;
const routineListSchema = routineCardDataSchema.array();

const messageMetadataSchema = z.object({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  generationTimeMs: z.number().optional(),
  reasoningTimeMs: z.number().optional(),
});

const modelComparisonSlotSchema = z.object({
  status: z.enum(["pending", "streaming", "completed", "failed"]),
  text: z.string(),
});

const chatDataPartSchemas = {
  coachingRoutine: storedRoutineProposalSchema,
  modelComparison: z.object({
    pairId: z.string(),
    noticeRequired: z.boolean(),
    status: z.enum(["generating", "ready", "resolved", "partial_failed"]),
    slots: z.object({
      A: modelComparisonSlotSchema,
      B: modelComparisonSlotSchema,
    }),
  }),
  modelComparisonDelta: z.object({
    pairId: z.string(),
    slot: z.enum(["A", "B"]),
    delta: z.string(),
  }),
};

function isExpectedChatRejection(error: Error, isGuest: boolean) {
  try {
    const payload = JSON.parse(error.message);

    return (
      getPaywallCardContent(payload, isGuest) !== null ||
      (payload?.retryable === true &&
        payload?.error === "Generation already in progress")
    );
  } catch {
    return false;
  }
}

export function ChatConversationClient({
  chatId,
  initialChatData,
}: {
  chatId: string;
  initialChatData: ChatData;
}) {
  const clerk = useClerk();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const searchParams = useSearchParams();
  const {
    renameChat,
    isGuest,
    getCachedChat,
    updateCachedChat,
    consumePendingInitialMessage,
    activeRoutine,
    chatNavigationEpoch,
    refreshActiveRoutine,
    openSidebar,
    guestConversationNotice,
  } = useChatContext();
  const apiBase = isGuest ? "/api/guest" : "/api";

  const [chatData, setChatData] = useState<ChatData>(initialChatData);
  const [input, setInput] = useState("");
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(
    null,
  );
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSubmitInFlight, setIsSubmitInFlight] = useState(false);
  const [isResponseSettling, setIsResponseSettling] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [comparisonDeltas, setComparisonDeltas] = useState<
    Record<string, Partial<Record<ModelComparisonSlot, string>>>
  >({});
  const { confirm, isOpen, options, handleConfirm, handleCancel, setIsOpen } =
    useConfirm();

  const trialActivationAttemptedRef = useRef(false);
  const trialActivationInFlightRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const pendingInitialMessageSubmittedRef = useRef(false);
  const voiceGenerationPollAttemptsRef = useRef(0);
  const routineAttemptActionIdsRef = useRef(new Map<string, string>());
  const pendingRoutineAdaptationRef = useRef<{
    routineId: string;
    sourceAssistantMessageId: string;
  } | null>(null);
  const routineAdaptationDraftRef = useRef<{
    routineId: string;
    prompt: string;
  } | null>(null);
  const submittedRoutineAdaptationRef = useRef<{
    routineId: string;
    assistantMessageIds: Set<string>;
  } | null>(null);
  const cleanedCheckInRoutineIdRef = useRef<string | null>(null);
  const sourceHydrationRequestRef = useRef<string | null>(null);
  const pendingHydrationMessageSyncRef = useRef(false);
  const [sourceHydration, setSourceHydration] = useState<{
    routineId: string;
    status: "loading" | "complete" | "failed";
  } | null>(null);
  const [returnCheckInRequest, setReturnCheckInRequest] = useState<{
    routineId: string;
    navigationEpoch: number;
  } | null>(null);
  const [resolvedRequestedRoutine, setResolvedRequestedRoutine] =
    useState<RoutineCardData | null>(null);
  const [isResolvingRequestedRoutine, setIsResolvingRequestedRoutine] =
    useState(false);
  const requestedCheckInRoutineId =
    searchParams.get("checkInRoutineId")?.trim() ?? null;
  const requestedRoutine = requestedCheckInRoutineId
    ? (chatData.routines.find(
        (routine) => routine.id === requestedCheckInRoutineId,
      ) ?? null)
    : null;
  useEffect(() => {
    if (
      !requestedCheckInRoutineId ||
      requestedRoutine ||
      activeRoutine?.id === requestedCheckInRoutineId
    ) {
      setResolvedRequestedRoutine(null);
      setIsResolvingRequestedRoutine(false);
      return;
    }
    let cancelled = false;
    setIsResolvingRequestedRoutine(true);
    void fetch(`/api/coaching/routines/${requestedCheckInRoutineId}`)
      .then(async (response) => {
        if (!response.ok) return null;
        const payload: unknown = await response.json();
        const parsed = z
          .object({ routine: routineCardDataSchema })
          .safeParse(payload);
        return parsed.success ? parsed.data.routine : null;
      })
      .then((routine) => {
        if (!cancelled) setResolvedRequestedRoutine(routine);
      })
      .catch(() => {
        if (!cancelled) setResolvedRequestedRoutine(null);
      })
      .finally(() => {
        if (!cancelled) setIsResolvingRequestedRoutine(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeRoutine, requestedCheckInRoutineId, requestedRoutine]);
  const requestedSourceRoutine =
    requestedRoutine ??
    (activeRoutine?.id === requestedCheckInRoutineId ? activeRoutine : null) ??
    resolvedRequestedRoutine;
  const queriedCheckInRoutineId =
    requestedRoutine?.status === "ACTIVE" &&
    requestedRoutine.latestAttempt?.outcome === null &&
    requestedRoutine.sourceChatId === chatId &&
    requestedRoutine.sourceAssistantMessageId !== null
      ? requestedRoutine.id
      : null;
  const openCheckInRoutineId =
    queriedCheckInRoutineId ??
    (!requestedCheckInRoutineId &&
    returnCheckInRequest?.navigationEpoch === chatNavigationEpoch &&
    chatData.routines.some(
      (routine) =>
        routine.id === returnCheckInRequest.routineId &&
        routine.status === "ACTIVE" &&
        routine.latestAttempt?.outcome === null,
    )
      ? returnCheckInRequest.routineId
      : null);
  const targetSourceAssistantMessageId =
    !isGuest &&
    requestedCheckInRoutineId &&
    requestedSourceRoutine?.sourceChatId === chatId
      ? requestedSourceRoutine.sourceAssistantMessageId
      : null;

  // Initial messages from server data
  const initialMessages = convertToUIMessages(chatData.messages);
  const persistedMessageIds = useMemo(
    () => new Set(chatData.messages.map((message) => message.id)),
    [chatData.messages],
  );

  const refreshChatData = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/chats/${chatId}`);
      if (response.ok) {
        const data = await response.json();
        setChatData(data);
        return convertToUIMessages(data.messages);
      }
    } catch (err) {
      console.error("Failed to refresh chat data:", err);
    }
    return null;
  }, [apiBase, chatId]);

  async function loadMoreMessages() {
    if (
      isLoadingMore ||
      !chatData.pagination?.hasMore ||
      !chatData.pagination.nextCursor
    ) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const response = await fetch(
        `${apiBase}/chats/${chatId}?cursor=${chatData.pagination.nextCursor}&limit=50`,
      );
      if (response.ok) {
        const data = await response.json();
        const olderRoutines = (data.routines ?? []) as ChatData["routines"];
        setChatData((prev) => {
          const messagesById = new Map(
            prev.messages.map((message) => [message.id, message]),
          );
          for (const message of data.messages as ChatData["messages"]) {
            messagesById.set(message.id, message);
          }
          const existingRoutineIds = new Set(
            prev.routines.map((routine) => routine.id),
          );

          return {
            ...prev,
            messages: [...messagesById.values()].sort(
              (left, right) =>
                Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
                left.id.localeCompare(right.id),
            ),
            routines: [
              ...prev.routines,
              ...olderRoutines.filter(
                (routine) => !existingRoutineIds.has(routine.id),
              ),
            ],
            pagination: data.pagination,
          };
        });
      }
    } catch (err) {
      console.error("Failed to load more messages:", err);
      toast.error("Impossibile caricare i messaggi precedenti");
    } finally {
      setIsLoadingMore(false);
    }
  }

  const transport = new DefaultChatTransport({
    api: isGuest ? "/api/guest/chat" : "/api/chat",
    body: { chatId },
  });
  const inputWarmup = useMemo(
    () => createChatInputWarmup({ chatId }),
    [chatId],
  );

  const {
    messages: streamingMessages,
    sendMessage,
    status,
    error: chatError,
    setMessages,
    stop,
    clearError,
  } = useChat<AnthonUIMessage>({
    id: chatId,
    messages: initialMessages,
    // Rendering Markdown for every stream chunk can exhaust React's nested
    // update limit on longer, consecutive turns. Batch visual updates while
    // preserving the underlying stream and final response.
    throttle: 50,
    messageMetadataSchema,
    dataPartSchemas: chatDataPartSchemas,
    transport,
    onData: (part) => {
      if (part.type !== "data-modelComparisonDelta") return;
      const { pairId, slot, delta } = part.data;
      setComparisonDeltas((current) => ({
        ...current,
        [pairId]: {
          ...current[pairId],
          [slot]: `${current[pairId]?.[slot] ?? ""}${delta}`,
        },
      }));
    },
    onFinish: async () => {
      try {
        const newMessages = await refreshChatData();
        if (newMessages) {
          setMessages(newMessages);
          const submittedAdaptation = submittedRoutineAdaptationRef.current;
          if (submittedAdaptation) {
            const sourceMessage = [...newMessages]
              .reverse()
              .find(
                (message) =>
                  message.role === "assistant" &&
                  !submittedAdaptation.assistantMessageIds.has(message.id) &&
                  message.parts.some(
                    (part) => part.type === "data-coachingRoutine",
                  ),
              );
            pendingRoutineAdaptationRef.current = sourceMessage
              ? {
                  routineId: submittedAdaptation.routineId,
                  sourceAssistantMessageId: sourceMessage.id,
                }
              : null;
          }
        }
      } finally {
        submittedRoutineAdaptationRef.current = null;
        setIsResponseSettling(false);
      }
    },
    onError: () => {
      submittedRoutineAdaptationRef.current = null;
      pendingRoutineAdaptationRef.current = null;
      setIsResponseSettling(false);
    },
  });

  useEffect(() => {
    if (!pendingHydrationMessageSyncRef.current) return;
    pendingHydrationMessageSyncRef.current = false;
    setMessages(convertToUIMessages(chatData.messages));
  }, [chatData.messages, setMessages]);

  useEffect(() => {
    if (queriedCheckInRoutineId) {
      setReturnCheckInRequest({
        routineId: queriedCheckInRoutineId,
        navigationEpoch: chatNavigationEpoch,
      });
      return;
    }
    if (
      requestedCheckInRoutineId &&
      returnCheckInRequest?.routineId !== requestedCheckInRoutineId
    ) {
      setReturnCheckInRequest(null);
    }
  }, [
    chatNavigationEpoch,
    queriedCheckInRoutineId,
    requestedCheckInRoutineId,
    returnCheckInRequest?.routineId,
  ]);

  useEffect(() => {
    if (!requestedCheckInRoutineId) {
      cleanedCheckInRoutineIdRef.current = null;
      sourceHydrationRequestRef.current = null;
      setSourceHydration(null);
      return;
    }
    const hydrationRequestKey = targetSourceAssistantMessageId
      ? `${requestedCheckInRoutineId}:${targetSourceAssistantMessageId}`
      : null;
    if (
      openCheckInRoutineId ||
      !targetSourceAssistantMessageId ||
      sourceHydrationRequestRef.current === hydrationRequestKey
    ) {
      return;
    }

    let cancelled = false;
    sourceHydrationRequestRef.current = hydrationRequestKey;
    setSourceHydration({
      routineId: requestedCheckInRoutineId,
      status: "loading",
    });

    void (async () => {
      try {
        const query = new URLSearchParams({
          routineId: requestedCheckInRoutineId,
          sourceAssistantMessageId: targetSourceAssistantMessageId,
        });
        const response = await fetch(`${apiBase}/chats/${chatId}?${query}`);
        if (!response.ok) throw new Error("Source hydration failed");
        const payload: unknown = await response.json();
        const parsedSource = parseRoutineSourceHydrationPayload(payload, {
          routineId: requestedCheckInRoutineId,
          sourceChatId: chatId,
          sourceAssistantMessageId: targetSourceAssistantMessageId,
        });
        if (!parsedSource)
          throw new Error("Source hydration payload is invalid");
        const sourceRoutine = parsedSource.routine;
        const validatedUiMessages =
          await safeValidateUIMessages<AnthonUIMessage>({
            messages: convertToUIMessages([parsedSource.message]),
            dataSchemas: chatDataPartSchemas,
          });
        if (
          !validatedUiMessages.success ||
          validatedUiMessages.data.length !== 1
        ) {
          throw new Error("Source hydration messages are invalid");
        }
        const validatedSourceMessage = validatedUiMessages.data[0];
        if (
          validatedSourceMessage.id !== targetSourceAssistantMessageId ||
          validatedSourceMessage.role !== "assistant"
        ) {
          throw new Error("Source hydration message is invalid");
        }
        const sourceData: Pick<ChatData, "messages"> = {
          messages: [
            {
              ...parsedSource.message,
              parts: validatedSourceMessage.parts,
            },
          ],
        };
        const mergeSource = (current: ChatData): ChatData => {
          const messagesById = new Map(
            current.messages.map((message) => [message.id, message]),
          );
          for (const message of sourceData.messages) {
            messagesById.set(message.id, message);
          }
          const routinesById = new Map(
            current.routines.map((routine) => [routine.id, routine]),
          );
          routinesById.set(sourceRoutine.id, sourceRoutine);
          return {
            ...current,
            messages: [...messagesById.values()].sort(
              (left, right) =>
                Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
                left.id.localeCompare(right.id),
            ),
            routines: [...routinesById.values()],
          };
        };
        if (!cancelled) {
          pendingHydrationMessageSyncRef.current = true;
          setChatData(mergeSource);
          setSourceHydration({
            routineId: requestedCheckInRoutineId,
            status: "complete",
          });
        }
      } catch {
        if (!cancelled) {
          setSourceHydration({
            routineId: requestedCheckInRoutineId,
            status: "failed",
          });
          toast.error("Non siamo riusciti ad aprire la routine salvata");
          cleanedCheckInRoutineIdRef.current = requestedCheckInRoutineId;
          routerRef.current.replace(
            `/chat?checkInRoutineId=${encodeURIComponent(requestedCheckInRoutineId)}`,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      if (sourceHydrationRequestRef.current === hydrationRequestKey) {
        sourceHydrationRequestRef.current = null;
      }
    };
  }, [
    apiBase,
    chatId,
    openCheckInRoutineId,
    requestedCheckInRoutineId,
    targetSourceAssistantMessageId,
  ]);

  useEffect(() => {
    if (!requestedCheckInRoutineId) return;
    if (cleanedCheckInRoutineIdRef.current === requestedCheckInRoutineId) {
      return;
    }

    if (!openCheckInRoutineId) {
      const lostActiveHydrationTarget =
        requestedRoutine === null &&
        targetSourceAssistantMessageId === null &&
        sourceHydration?.routineId === requestedCheckInRoutineId &&
        sourceHydration.status === "loading";
      if (isResolvingRequestedRoutine) return;
      if (lostActiveHydrationTarget) {
        cleanedCheckInRoutineIdRef.current = requestedCheckInRoutineId;
        router.replace("/chat");
        return;
      }
      const isHydratingTarget =
        targetSourceAssistantMessageId !== null &&
        (sourceHydration?.routineId !== requestedCheckInRoutineId ||
          sourceHydration.status === "loading");
      if (isHydratingTarget || sourceHydration?.status === "failed") return;
      cleanedCheckInRoutineIdRef.current = requestedCheckInRoutineId;
      router.replace(`/chat/${encodeURIComponent(chatId)}`);
      return;
    }

    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      activeElement
        .closest("[data-routine-check-in-id]")
        ?.getAttribute("data-routine-check-in-id") === openCheckInRoutineId
    ) {
      cleanedCheckInRoutineIdRef.current = requestedCheckInRoutineId;
      router.replace(`/chat/${encodeURIComponent(chatId)}`);
    }
  }, [
    chatId,
    openCheckInRoutineId,
    requestedCheckInRoutineId,
    requestedRoutine,
    isResolvingRequestedRoutine,
    router,
    sourceHydration,
    targetSourceAssistantMessageId,
  ]);

  const hasBlockingModelComparison = streamingMessages.some((message) =>
    message.parts.some(
      (part) =>
        part.type === "data-modelComparison" &&
        (part.data.status === "generating" || part.data.status === "ready"),
    ),
  );

  const handleModelComparisonResolved = useCallback(async () => {
    const newMessages = await refreshChatData();
    if (newMessages) {
      setMessages(newMessages);
      setComparisonDeltas({});
    }
  }, [refreshChatData, setMessages]);

  const loadRoutineChatData = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/chats/${chatId}`);
      if (!response.ok) {
        throw new Error(`Chat refresh failed with ${response.status}`);
      }

      const payload: unknown = await response.json();
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("messages" in payload) ||
        !Array.isArray(payload.messages) ||
        !("routines" in payload)
      ) {
        throw new Error("Chat refresh payload is invalid");
      }
      const parsedRoutines = routineListSchema.safeParse(payload.routines);
      if (!parsedRoutines.success) {
        throw new Error("Chat refresh routines are invalid");
      }

      const data = { ...payload, routines: parsedRoutines.data } as ChatData;
      return {
        data,
        messages: convertToUIMessages(data.messages),
      };
    } catch {
      throw new RoutineClientError(
        "Non siamo riusciti ad aggiornare lo stato della routine. Riprova.",
        null,
      );
    }
  }, [apiBase, chatId]);

  const applyRoutineMutation = useCallback(
    async (
      operation: () => Promise<RoutineCardData>,
    ): Promise<RoutineCardData> => {
      let routine: RoutineCardData;
      try {
        routine = await operation();
      } catch (cause) {
        if (
          cause instanceof RoutineClientError &&
          (cause.status === 409 || cause.status === 422)
        ) {
          try {
            const refreshed = await loadRoutineChatData();
            setChatData(refreshed.data);
            setMessages(refreshed.messages);
            await refreshActiveRoutine();
          } catch {
            // Recovery refresh is best effort; preserve the actionable conflict.
          }
        }
        throw cause;
      }

      let refreshed: Awaited<ReturnType<typeof loadRoutineChatData>>;
      try {
        refreshed = await loadRoutineChatData();
      } catch {
        throw new RoutineClientError(
          "Routine aggiornata, ma non siamo riusciti ad aggiornare la chat. Riprova.",
          null,
        );
      }

      const refreshedRoutine = refreshed.data.routines.find(
        (candidate) =>
          candidate.id === routine.id ||
          (routine.sourceAssistantMessageId !== null &&
            candidate.sourceAssistantMessageId ===
              routine.sourceAssistantMessageId),
      );
      if (
        !refreshedRoutine ||
        JSON.stringify(refreshedRoutine) !== JSON.stringify(routine)
      ) {
        throw new RoutineClientError(
          "La chat non mostra ancora l'ultimo aggiornamento della routine. Riprova.",
          null,
        );
      }
      setChatData(refreshed.data);
      setMessages(refreshed.messages);
      await refreshActiveRoutine();
      return refreshedRoutine;
    },
    [loadRoutineChatData, refreshActiveRoutine, setMessages],
  );

  const handleSaveRoutine = useCallback(
    async (sourceAssistantMessageId: string) => {
      const adaptation = pendingRoutineAdaptationRef.current;
      const derivedFromRoutineId =
        adaptation?.sourceAssistantMessageId === sourceAssistantMessageId
          ? adaptation.routineId
          : undefined;
      try {
        return await applyRoutineMutation(() =>
          saveRoutineProposal(sourceAssistantMessageId, {
            derivedFromRoutineId,
          }),
        );
      } finally {
        if (derivedFromRoutineId) pendingRoutineAdaptationRef.current = null;
      }
    },
    [applyRoutineMutation],
  );

  const handleCreateRoutineAttempt = useCallback(
    async (
      routineId: string,
      outcome?: RoutineAttemptOutcome,
      outcomeNote?: string | null,
    ) => {
      const normalizedOutcomeNote = outcomeNote?.trim() || null;
      const actionKey = JSON.stringify({
        routineId,
        outcome: outcome ?? null,
        outcomeNote: normalizedOutcomeNote,
      });
      let clientActionId = routineAttemptActionIdsRef.current.get(actionKey);
      if (!clientActionId) {
        clientActionId = crypto.randomUUID();
        routineAttemptActionIdsRef.current.set(actionKey, clientActionId);
      }

      const routine = await applyRoutineMutation(() =>
        createRoutineAttempt(
          routineId,
          clientActionId,
          outcome,
          normalizedOutcomeNote,
        ),
      );
      routineAttemptActionIdsRef.current.delete(actionKey);
      return routine;
    },
    [applyRoutineMutation],
  );

  const handleSaveRoutineOutcome = useCallback(
    async (
      attemptId: string,
      outcome: RoutineAttemptOutcome,
      outcomeNote?: string | null,
    ) => {
      const routine = await applyRoutineMutation(() =>
          saveRoutineOutcome(attemptId, outcome, outcomeNote),
        ),
        completedRoutine = chatData.routines.find(
          (candidate) => candidate.latestAttempt?.id === attemptId,
        );
      if (completedRoutine) {
        trackRoutineAnalytics({
          event: "routine_check_in_completed",
          routineId: completedRoutine.id,
          formatVersion: completedRoutine.formatVersion,
          widgetKind: "form",
          technicalState: "success",
        });
      }
      return routine;
    },
    [applyRoutineMutation, chatData.routines],
  );

  const handleArchiveRoutine = useCallback(
    async (routineId: string) => {
      const confirmed = await confirm({
        title: "Archiviare la routine?",
        description:
          "La routine resterà nello storico, ma non sarà più disponibile per nuovi tentativi.",
        confirmText: "Archivia",
        cancelText: "Annulla",
        variant: "destructive",
      });
      if (!confirmed) {
        const currentRoutine = chatData.routines.find(
          (routine) => routine.id === routineId,
        );
        if (currentRoutine) return currentRoutine;
        throw new Error("Routine not found");
      }
      return applyRoutineMutation(() => archiveRoutine(routineId));
    },
    [applyRoutineMutation, chatData.routines, confirm],
  );

  const handleTryRoutineNow = useCallback((title: string) => {
    setInput(`Inizio ora la routine: ${title}. Ti aggiorno dopo il tentativo.`);
    setFocusRequestId((current) => current + 1);
  }, []);

  const handleAdaptRoutine = useCallback((routineId: string, title: string) => {
    const prompt = `Vorrei adattare la routine "${title}" dopo l'ultimo tentativo. Aiutami a renderla più efficace.`;
    pendingRoutineAdaptationRef.current = null;
    routineAdaptationDraftRef.current = { routineId, prompt };
    setInput(prompt);
    setFocusRequestId((current) => current + 1);
  }, []);

  const hasUnresolvedVoiceGeneration = hasPendingVoiceGeneration(
    chatData.messages,
  );

  // Voice jobs are durable and eventually attach their file to the existing
  // assistant message. Poll only while one is unresolved so reconnects receive
  // the final attachment without holding the chat stream open indefinitely.
  useEffect(() => {
    if (!hasUnresolvedVoiceGeneration) {
      voiceGenerationPollAttemptsRef.current = 0;
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;

    const poll = async () => {
      const refreshedMessages = await refreshChatData();
      if (cancelled) return;

      if (refreshedMessages) {
        setMessages(refreshedMessages);
      }

      voiceGenerationPollAttemptsRef.current += 1;
      // A failed or misconfigured queue must not leave a mounted chat making
      // requests forever. A later navigation or refresh starts a fresh,
      // bounded observation window for the durable job.
      if (
        voiceGenerationPollAttemptsRef.current >=
        VOICE_GENERATION_POLL_MAX_ATTEMPTS
      ) {
        return;
      }

      const backoffMultiplier = Math.floor(
        voiceGenerationPollAttemptsRef.current / 4,
      );
      const delay = Math.min(
        4_000,
        VOICE_GENERATION_POLL_INITIAL_DELAY_MS * 2 ** backoffMultiplier,
      );
      timeoutId = window.setTimeout(poll, delay);
    };

    timeoutId = window.setTimeout(poll, VOICE_GENERATION_POLL_INITIAL_DELAY_MS);

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [hasUnresolvedVoiceGeneration, refreshChatData, setMessages]);

  useEffect(() => () => inputWarmup.dispose(), [inputWarmup]);

  useEffect(() => {
    if (pendingInitialMessageSubmittedRef.current || status !== "ready") {
      return;
    }

    const pendingInitialMessage = consumePendingInitialMessage(chatId);
    if (!pendingInitialMessage) {
      return;
    }

    pendingInitialMessageSubmittedRef.current = true;
    sendMessage({
      role: "user",
      parts: [{ type: "text", text: pendingInitialMessage }],
    }).catch((error) => {
      pendingInitialMessageSubmittedRef.current = false;
      setInput(pendingInitialMessage);
      console.error("Failed to send initial chat message:", error);
      toast.error("Invio messaggio fallito");
    });
  }, [chatId, consumePendingInitialMessage, sendMessage, status]);

  // Sync cached data to local state if available
  useEffect(() => {
    if (hasInitialized) return;

    const cached = getCachedChat(chatId);
    if (cached) {
      // If we have cached data, update local chatData state
      setChatData(cached);
    }
    // Mark as initialized regardless - useChat handles the initial messages
    setHasInitialized(true);
  }, [chatId, hasInitialized, getCachedChat]);

  useEffect(() => {
    const draftKey = `chat-draft:${chatId}`;
    const savedDraft = window.sessionStorage.getItem(draftKey);
    if (savedDraft) {
      setInput(savedDraft);
      window.sessionStorage.removeItem(draftKey);
    }
  }, [chatId]);

  // Sync local changes back to layout cache
  useEffect(() => {
    if (hasInitialized) {
      updateCachedChat(chatId, {
        ...chatData,
        messages: chatData.messages, // chatData already has messages
      });
    }
  }, [chatId, chatData, hasInitialized, updateCachedChat]);

  // Sync streaming messages to cache for "live" feel when switching back
  useEffect(() => {
    if (status === "streaming" && streamingMessages.length > 0) {
      updateCachedChat(chatId, {
        // We don't want to convert back and forth too much,
        // but we can store partial message lists
        // For simplicity, we'll only sync on finish in the production version
        // but let's do a partial sync for "active" chats
      });
    }
  }, [chatId, streamingMessages, status, updateCachedChat]);

  const formattedError:
    | { message: string; title?: string }
    | PaywallCardContent
    | null = (() => {
    if (!chatError) return null;
    try {
      if (chatError.message.trim().startsWith("{")) {
        const parsed = JSON.parse(chatError.message);
        const paywallCard = getPaywallCardContent(parsed, isGuest);
        if (paywallCard) {
          return paywallCard;
        }
        return { message: parsed.error || chatError.message };
      }
    } catch {
      /* ignore */
    }
    return { message: chatError.message };
  })();

  useEffect(() => {
    if (!chatError || isExpectedChatRejection(chatError, isGuest)) return;

    posthog.captureException(chatError, {
      chat_id: chatId,
      chat_status: status,
      is_guest: isGuest,
    });
  }, [chatError, chatId, isGuest, status]);

  const maybeActivateClerkTrial = useCallback(async () => {
    if (
      isGuest ||
      trialActivationAttemptedRef.current ||
      trialActivationInFlightRef.current
    ) {
      return;
    }

    trialActivationInFlightRef.current = true;

    try {
      try {
        const currentSubscription = await clerk.billing.getSubscription({});
        const hasFreeTrialItem = currentSubscription.subscriptionItems.some(
          (item) => item.isFreeTrial,
        );

        if (hasFreeTrialItem || !currentSubscription.eligibleForFreeTrial) {
          trialActivationAttemptedRef.current = true;
          return;
        }
      } catch {
        // If subscription lookup fails, continue and try to bootstrap from plans.
      }

      const plans = await clerk.billing.getPlans({ for: "user" });
      const trialPlan =
        plans.data.find(
          (plan) => plan.freeTrialEnabled && plan.publiclyVisible,
        ) ?? plans.data.find((plan) => plan.freeTrialEnabled);

      if (!trialPlan) {
        trialActivationAttemptedRef.current = true;
        return;
      }

      let checkout = await clerk.billing.startCheckout({
        planId: trialPlan.id,
        planPeriod: "month",
      });

      if (
        checkout.status === "needs_confirmation" &&
        checkout.needsPaymentMethod
      ) {
        trialActivationAttemptedRef.current = true;
        toast.info(
          "Per attivare la prova gratuita è richiesto un metodo di pagamento.",
        );
        router.push("/pricing");
        return;
      }

      if (
        checkout.status === "needs_confirmation" &&
        !checkout.needsPaymentMethod
      ) {
        checkout = await checkout.confirm({});
      }

      if (checkout.status === "completed") {
        trialActivationAttemptedRef.current = true;
        toast.success("Prova gratuita attivata");
      }
    } catch (error) {
      console.error("Failed to auto-activate Clerk trial:", error);
    } finally {
      trialActivationInFlightRef.current = false;
    }
  }, [clerk, isGuest, router]);

  const handleSubmit = async (
    e: React.FormEvent,
    attachments?: AttachmentData[],
  ) => {
    e.preventDefault();
    if (
      !(input.trim() || (attachments && attachments.length > 0)) ||
      (status !== "ready" && status !== "error") ||
      submitInFlightRef.current
    ) {
      return;
    }

    submitInFlightRef.current = true;
    if (status === "error") {
      clearError();
    }
    setIsSubmitInFlight(true);
    setIsResponseSettling(true);
    const submittedInput = input;
    const adaptationRoutineId =
      routineAdaptationDraftRef.current?.prompt === submittedInput
        ? routineAdaptationDraftRef.current.routineId
        : null;
    routineAdaptationDraftRef.current = null;
    pendingRoutineAdaptationRef.current = null;
    submittedRoutineAdaptationRef.current = adaptationRoutineId
      ? {
          routineId: adaptationRoutineId,
          assistantMessageIds: new Set(
            chatData.messages
              .filter((message) => message.role === "assistant")
              .map((message) => message.id),
          ),
        }
      : null;

    try {
      await maybeActivateClerkTrial();

      const parts: AnthonUIMessage["parts"] = [];
      if (submittedInput.trim()) {
        parts.push({ type: "text", text: submittedInput });
      }
      if (attachments) {
        attachments.forEach((att: AttachmentData) => {
          const isAudio = att.contentType.startsWith("audio/");
          parts.push({
            type: "file",
            data: isAudio && att.base64Data ? att.base64Data : att.url,
            mimeType: att.contentType,
            name: att.name,
            size: att.size,
            attachmentId: att.id,
            // biome-ignore lint/suspicious/noExplicitAny: Extra metadata
          } as any);
        });
      }
      setInput("");
      await sendMessage({ role: "user", parts });
    } catch (error) {
      pendingRoutineAdaptationRef.current = null;
      submittedRoutineAdaptationRef.current = null;
      setIsResponseSettling(false);
      setInput(submittedInput);
      if (error instanceof Error && isExpectedChatRejection(error, isGuest)) {
        return;
      }
      console.error("Failed to send chat message:", error);
      toast.error("Invio messaggio fallito");
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitInFlight(false);
    }
  };

  const deleteStateRef = useRef<DeleteSnapshot | null>(null);

  const handleDeleteMessage = async (messageId: string) => {
    const confirmed = await confirm({
      title: "Eliminare il messaggio?",
      description:
        "Questo eliminerà questo messaggio e tutti i messaggi successivi.",
      confirmText: "Elimina",
      cancelText: "Annulla",
      variant: "destructive",
    });

    if (!confirmed) return;

    deleteStateRef.current = {
      cancelled: false,
      previousMessages: [...streamingMessages],
      previousChatData: chatData,
    };

    const msgIndex = streamingMessages.findIndex((m) => m.id === messageId);
    if (msgIndex !== -1) {
      setMessages(streamingMessages.slice(0, msgIndex));
    }

    setDeletingMessageId(messageId);

    toast("Messaggio eliminato", {
      description: "Clicca per annullare",
      action: {
        label: "Annulla",
        onClick: () => {
          if (deleteStateRef.current) {
            deleteStateRef.current.cancelled = true;
            setMessages(deleteStateRef.current.previousMessages);
            setChatData(deleteStateRef.current.previousChatData);
            setDeletingMessageId(null);
            toast.success("Eliminazione annullata");
          }
        },
      },
      duration: 5000,
      onAutoClose: async () => {
        if (deleteStateRef.current?.cancelled) return;
        try {
          const response = await fetch(
            `${apiBase}/chat/messages?id=${messageId}`,
            {
              method: "DELETE",
            },
          );
          if (response.ok) {
            await refreshChatData();
            try {
              await refreshActiveRoutine();
            } catch {
              router.refresh();
            }
          } else {
            if (deleteStateRef.current) {
              setMessages(deleteStateRef.current.previousMessages);
              setChatData(deleteStateRef.current.previousChatData);
            }
            toast.error("Eliminazione fallita");
          }
        } catch (err) {
          console.error("Delete error:", err);
          if (deleteStateRef.current) {
            setMessages(deleteStateRef.current.previousMessages);
            setChatData(deleteStateRef.current.previousChatData);
          }
          toast.error("Eliminazione fallita");
        } finally {
          setDeletingMessageId(null);
          deleteStateRef.current = null;
        }
      },
    });
  };

  const handleSaveEdit = async () => {
    if (!editingMessageId || !editContent.trim()) return;
    const newContent = editContent.trim();

    try {
      const response = await fetch("/api/chat/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: editingMessageId,
          content: newContent,
        }),
      });

      if (response.ok) {
        setEditingMessageId(null);
        setEditContent("");
        const newMsgs = await refreshChatData();
        if (newMsgs) {
          setMessages(newMsgs);
          sendMessage({ text: newContent });
        }
      } else {
        toast.error("Impossibile modificare il messaggio");
      }
    } catch (err) {
      console.error("Edit error:", err);
      toast.error("Impossibile modificare il messaggio");
    }
  };

  const handleRegenerate = async () => {
    if (
      (status !== "ready" && status !== "error") ||
      submitInFlightRef.current ||
      isRegenerating
    ) {
      return;
    }

    const lastAssistantIdx = [...streamingMessages]
      .reverse()
      .findIndex((m) => m.role === "assistant");
    if (lastAssistantIdx === -1) return;
    const assistantIdx = streamingMessages.length - 1 - lastAssistantIdx;
    const userMessage = streamingMessages
      .slice(0, assistantIdx)
      .reverse()
      .find((m) => m.role === "user");
    if (!userMessage) return;

    const userText = extractTextFromParts(userMessage.parts);
    if (!userText) return;

    const userMessageIndex = streamingMessages.findIndex(
      (message) => message.id === userMessage.id,
    );
    if (userMessageIndex === -1) return;

    const previousMessages = streamingMessages;
    let deleteSucceeded = false;
    submitInFlightRef.current = true;
    setIsSubmitInFlight(true);
    setIsResponseSettling(true);
    setIsRegenerating(true);
    if (status === "error") {
      clearError();
    }

    // Keep the original prompt in place, but remove the old answer before the
    // delete request finishes. sendMessage(messageId) will replace this user
    // message instead of appending a second one when the request starts.
    setMessages(streamingMessages.slice(0, userMessageIndex + 1));

    try {
      const response = await fetch(
        `${apiBase}/chat/messages?id=${userMessage.id}`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) {
        throw new Error(
          `Regenerate delete failed with status ${response.status}`,
        );
      }
      deleteSucceeded = true;
      await sendMessage({ text: userText, messageId: userMessage.id });
    } catch (err) {
      if (!deleteSucceeded) {
        setMessages(previousMessages);
      } else {
        const refreshedMessages = await refreshChatData();
        if (refreshedMessages) {
          setMessages(refreshedMessages);
        }
      }

      setIsResponseSettling(false);
      if (err instanceof Error && isExpectedChatRejection(err, isGuest)) {
        return;
      }
      console.error("Regenerate error:", err);
      toast.error("Impossibile rigenerare la risposta");
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitInFlight(false);
      setIsRegenerating(false);
    }
  };

  const isLoading =
    status === "streaming" ||
    status === "submitted" ||
    isSubmitInFlight ||
    isResponseSettling ||
    isRegenerating;
  const isEmptyIdle = streamingMessages.length === 0 && !isLoading;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-linear-to-b from-background to-muted/20">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-primary/5 via-background/0 to-background/0" />

      <ChatHeader
        chatId={chatId}
        title={chatData.title}
        icon={chatData.icon}
        onOpenSidebar={openSidebar}
        guestConversationNotice={guestConversationNotice}
        onRename={async (id, newTitle) => {
          const success = await renameChat(id, newTitle);
          if (success) setChatData((prev) => ({ ...prev, title: newTitle }));
          return success;
        }}
      />

      {isEmptyIdle ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center gap-6 py-4">
            <EmptyChatWelcome />
            <SuggestedActions
              onSelect={(prompt) => setInput(prompt)}
              variant="cards"
              className="w-full"
            />
          </div>
        </div>
      ) : (
        <MessageList
          messages={streamingMessages}
          status={status}
          isLoading={isLoading}
          isRegenerating={isRegenerating}
          editingMessageId={editingMessageId}
          deletingMessageId={deletingMessageId}
          editContent={editContent}
          onEditStart={(id, text) => {
            setEditingMessageId(id);
            setEditContent(text);
          }}
          onEditCancel={() => {
            setEditingMessageId(null);
            setEditContent("");
          }}
          onEditSave={handleSaveEdit}
          onEditContentChange={setEditContent}
          onDelete={handleDeleteMessage}
          onRegenerate={handleRegenerate}
          feedbackEndpoint={
            isGuest ? "/api/guest/chat/feedback" : "/api/chat/feedback"
          }
          canSubmitFeedback={chatData.isOwner}
          feedbackMessageIds={persistedMessageIds}
          comparisonDeltas={comparisonDeltas}
          onModelComparisonResolved={handleModelComparisonResolved}
          routines={chatData.routines}
          isGuest={isGuest}
          canRenderRoutineCards={
            chatData.visibility === "PRIVATE" && chatData.isOwner
          }
          registrationHref={`/sign-up?redirect_url=${encodeURIComponent(`/chat/${chatId}`)}`}
          onSaveRoutine={handleSaveRoutine}
          onCreateRoutineAttempt={handleCreateRoutineAttempt}
          onSaveRoutineOutcome={handleSaveRoutineOutcome}
          onArchiveRoutine={handleArchiveRoutine}
          onTryRoutineNow={handleTryRoutineNow}
          onAdaptRoutine={handleAdaptRoutine}
          openCheckInRoutineId={openCheckInRoutineId}
          hasMoreMessages={chatData.pagination?.hasMore ?? false}
          isLoadingMore={isLoadingMore}
          onLoadMore={loadMoreMessages}
        />
      )}

      {formattedError && (
        <div
          className="fixed bottom-24 -translate-x-1/2 z-50 min-w-75 max-w-md rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400 shadow-xl backdrop-blur-sm"
          style={{
            left: "calc(50% + var(--toast-center-offset, 0px))",
          }}
        >
          {formattedError.title && (
            <div className="mb-1 font-semibold">{formattedError.title}</div>
          )}
          <div>
            {formattedError.title ? "" : "Un errore si è verificato: "}
            {formattedError.message}
          </div>
          {"primaryCta" in formattedError && (
            <div className="mt-3 flex items-center gap-3">
              <Button
                asChild
                size="sm"
                variant="outline"
                className="w-full border-red-200 bg-white hover:bg-red-50 text-red-700 dark:bg-transparent dark:hover:bg-red-900/20"
              >
                <Link href={formattedError.primaryCta.href}>
                  {formattedError.primaryCta.label}
                </Link>
              </Button>
              {formattedError.secondaryCta && (
                <Link
                  href={formattedError.secondaryCta.href}
                  className="text-xs underline underline-offset-2 text-red-700 dark:text-red-300 whitespace-nowrap"
                >
                  {formattedError.secondaryCta.label}
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      <ChatInput
        input={input}
        focusRequestId={focusRequestId}
        setInput={setInput}
        onInputWarmup={inputWarmup.schedule}
        onSubmit={handleSubmit}
        isLoading={isLoading}
        onStop={() => {
          stop();
          setIsResponseSettling(false);
        }}
        disableAttachments={isGuest}
        disabledReason={
          hasBlockingModelComparison
            ? "Scegli una risposta per continuare"
            : undefined
        }
      />

      <ConfirmDialog
        open={isOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsOpen(true);
          } else {
            handleCancel();
          }
        }}
        onConfirm={handleConfirm}
        title={options.title}
        description={options.description}
        confirmText={options.confirmText}
        cancelText={options.cancelText}
        variant={options.variant}
      />
    </div>
  );
}
