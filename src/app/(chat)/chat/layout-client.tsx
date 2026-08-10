"use client";

import { useUser } from "@clerk/nextjs";
import { PanelLeft, Sparkles, UserPlus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { useConfirm } from "@/hooks/use-confirm";
import { useKeyboardShortcut } from "@/hooks/useKeyboardShortcut";
import { normalizeChatIcon } from "@/lib/chat-icons";
import type { RoutineCardData } from "@/lib/coaching/routine";
import {
  buildRoutineChatPrompt,
  type PendingRoutineChatContext,
  type RoutineChatMode,
} from "@/lib/coaching/routine-chat";
import {
  fetchActiveRoutineForReturn,
  fetchRoutineCollection,
  type RoutineCollectionStatus,
} from "@/lib/coaching/routine-client";
import { installChatViewportSizing } from "@/lib/visual-viewport";
import type { Chat, ChatData, UsageData } from "@/types/chat";
import { ChatList } from "../../(chat)/components/ChatList";
import { RoutineSidebarShelf } from "../../(chat)/components/RoutineSidebarShelf";
import { SearchDialog } from "../../(chat)/components/SearchDialog";
import { SidebarBottom } from "../../(chat)/components/SidebarBottom";
import { SidebarHeader } from "../../(chat)/components/SidebarHeader";
import { UsageBanner } from "../../(chat)/components/UsageBanner";

// -----------------------------------------------------
// Types
// -----------------------------------------------------

interface CreateChatOptions {
  initialMessage?: string;
  routineContext?: PendingRoutineChatContext;
  title?: string;
}

interface GuestConversationNotice {
  remaining?: number;
  registrationHref: string;
}

const MOBILE_SIDEBAR_MEDIA_QUERY = "(max-width: 767px)";

function subscribeToMobileSidebar(listener: () => void) {
  const mediaQuery = window.matchMedia(MOBILE_SIDEBAR_MEDIA_QUERY);
  mediaQuery.addEventListener("change", listener);
  return () => mediaQuery.removeEventListener("change", listener);
}

function getMobileSidebarSnapshot() {
  return window.matchMedia(MOBILE_SIDEBAR_MEDIA_QUERY).matches;
}

function getServerMobileSidebarSnapshot() {
  return false;
}

function useIsMobileSidebarViewport() {
  return useSyncExternalStore(
    subscribeToMobileSidebar,
    getMobileSidebarSnapshot,
    getServerMobileSidebarSnapshot,
  );
}

function isRenderedVisible(
  element: HTMLElement | null,
): element is HTMLElement {
  if (!element?.isConnected) return false;

  for (
    let currentElement: HTMLElement | null = element;
    currentElement;
    currentElement = currentElement.parentElement
  ) {
    const styles = window.getComputedStyle(currentElement);
    if (styles.display === "none" || styles.visibility === "hidden") {
      return false;
    }
  }

  return true;
}

function focusVisibleMainContent(mainContent: HTMLElement | null) {
  if (!mainContent) return;

  const mainContentControl = Array.from(
    mainContent.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).find(
    (element) =>
      element.dataset.chatSidebarOpener !== "true" &&
      isRenderedVisible(element),
  );

  if (mainContentControl) {
    mainContentControl.focus();
    return;
  }

  if (isRenderedVisible(mainContent)) {
    mainContent.focus();
  }
}

interface ChatContextType {
  chats: Chat[];
  coachingGoal: string | null;
  activeRoutine: RoutineCardData | null;
  routineCollection: RoutineCollectionState;
  routineCollectionError: string | null;
  isRoutineCollectionLoading: boolean;
  routineCollectionLoadingMoreStatus: RoutineCollectionStatus | null;
  isLoading: boolean;
  isCreatingChat: boolean;
  currentChatId: string | null;
  chatNavigationEpoch: number;
  isGuest: boolean;
  createChat: (options?: CreateChatOptions) => Promise<string | null>;
  createRoutineChat: (
    routine: RoutineCardData,
    mode: RoutineChatMode,
  ) => Promise<string | null>;
  deleteChat: (id: string) => Promise<boolean>;
  refreshChats: () => Promise<void>;
  preFetchChat: (id: string) => Promise<void>;
  getCachedChat: (id: string) => ChatData | null;
  navigateToChat: (id: string) => void;
  renameChat: (id: string, newTitle: string) => Promise<boolean>;
  updateCachedChat: (id: string, data: Partial<ChatData>) => void;
  consumePendingInitialMessage: (chatId: string) => string | null;
  consumePendingRoutineChatContext: (
    chatId: string,
  ) => PendingRoutineChatContext | null;
  updateActiveRoutine: (routine: RoutineCardData) => void;
  refreshActiveRoutine: () => Promise<RoutineCardData | null>;
  refreshRoutineCollection: () => Promise<RoutineCollectionState>;
  loadMoreRoutineCollection: (status: RoutineCollectionStatus) => Promise<void>;
  navigateToRoutine: (routine: RoutineCardData) => void;
  openRoutineCheckIn: (routine: RoutineCardData) => void;
  openSidebar: () => void;
  guestConversationNotice: GuestConversationNotice | null;
}

interface RoutineCollectionSegment {
  total: number | null;
  nextCursor: string | null;
}

interface RoutineCollectionState {
  routines: RoutineCardData[];
  active: RoutineCollectionSegment;
  archived: RoutineCollectionSegment;
}

const emptyRoutineCollection: RoutineCollectionState = {
  routines: [],
  active: { total: null, nextCursor: null },
  archived: { total: null, nextCursor: null },
};

const ChatContext = createContext<ChatContextType | null>(null);

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within ChatLayout");
  }
  return context;
}

export function getRoutineCheckInHref(routine: RoutineCardData): string {
  const query = new URLSearchParams({
    checkInRoutineId: routine.id,
  }).toString();
  if (routine.sourceChatId && routine.sourceAssistantMessageId) {
    return `/chat/${encodeURIComponent(routine.sourceChatId)}?${query}`;
  }
  return `/chat?${query}`;
}

// -----------------------------------------------------
// Guest Banner Component
// -----------------------------------------------------

function GuestBanner({
  remaining,
  registrationHref,
  onOpenSidebar,
}: {
  remaining?: number;
  registrationHref: string;
  onOpenSidebar: () => void;
}) {
  return (
    <div className="mx-2 mt-2 md:mx-4 md:mt-4">
      <div className="flex items-center justify-between gap-2 bg-linear-to-r from-primary/10 via-primary/5 to-transparent backdrop-blur-xl border border-primary/20 px-3 py-2 sm:px-4 sm:py-2.5 rounded-2xl shadow-sm shadow-primary/5">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 md:hidden"
            onClick={onOpenSidebar}
            aria-label="Apri la barra laterale"
            data-chat-sidebar-opener="true"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary shrink-0" />
            <span className="text-muted-foreground truncate text-sm">
              <span className="hidden xs:inline">Ospite: </span>
              {remaining !== undefined && (
                <span className="font-medium text-primary">
                  {remaining} {remaining === 1 ? "messaggio" : "messaggi"}
                </span>
              )}
            </span>
          </div>
        </div>
        <Button
          asChild
          size="sm"
          variant="default"
          className="gap-1.5 h-8 text-xs shrink-0 rounded-xl px-3"
        >
          <Link href={registrationHref} aria-label="Registrati">
            <UserPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Registrati</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}

function MobileLandingSidebarTrigger({
  onOpenSidebar,
}: {
  onOpenSidebar: () => void;
}) {
  return (
    <div className="px-2 pt-2 md:hidden">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9"
        onClick={onOpenSidebar}
        aria-label="Apri la barra laterale"
        data-chat-sidebar-opener="true"
      >
        <PanelLeft className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface SidebarContentsProps {
  chats: Chat[];
  isLoading: boolean;
  isCreatingChat: boolean;
  currentChatId: string | null;
  deletingChatId: string | null;
  onDelete: (id: string) => Promise<boolean>;
  onSelect: (id: string) => void;
  onCreate: (options?: CreateChatOptions) => Promise<string | null>;
  onSearch?: () => void;
  onRename: (id: string, newTitle: string) => Promise<boolean>;
  onPreFetch: (id: string) => void;
  onClose: () => void;
  isGuest: boolean;
  routineCollection: RoutineCollectionState;
  routineCollectionError: string | null;
  isRoutineCollectionLoading: boolean;
  routinesEnabled: boolean;
  onRetryRoutineCollection: () => void;
}

function SidebarContents({
  chats,
  isLoading,
  isCreatingChat,
  currentChatId,
  deletingChatId,
  onDelete,
  onSelect,
  onCreate,
  onSearch,
  onRename,
  onPreFetch,
  onClose,
  isGuest,
  routineCollection,
  routineCollectionError,
  isRoutineCollectionLoading,
  routinesEnabled,
  onRetryRoutineCollection,
}: SidebarContentsProps) {
  return (
    <div className="flex h-full w-72 flex-col pt-[env(safe-area-inset-top)]">
      <div className="shrink-0" data-testid="sidebar-header-actions">
        <SidebarHeader onCollapse={onClose} />
      </div>
      <div
        className="min-h-0 flex-1 overflow-hidden"
        data-testid="sidebar-chat-list"
      >
        <ChatList
          chats={chats}
          isLoading={isLoading}
          isCreatingChat={isCreatingChat}
          currentChatId={currentChatId}
          deletingChatId={deletingChatId}
          onDelete={onDelete}
          onSelect={onSelect}
          onCreate={onCreate}
          onSearch={onSearch}
          onRename={onRename}
          onPreFetch={onPreFetch}
        />
      </div>
      {!isGuest &&
      (routinesEnabled || routineCollection.routines.length > 0) ? (
        <RoutineSidebarShelf
          routines={routineCollection.routines}
          activeTotal={routineCollection.active.total}
          isLoading={isRoutineCollectionLoading}
          error={routineCollectionError}
          onRetry={onRetryRoutineCollection}
        />
      ) : null}
      <div className="shrink-0" data-testid="sidebar-profile">
        <SidebarBottom />
      </div>
    </div>
  );
}

// -----------------------------------------------------
// Client Layout Component
// -----------------------------------------------------

export function LayoutClient({
  children,
  initialChats,
  initialUsageData,
  initialCoachingGoal,
  initialActiveRoutine,
  initialRoutinesEnabled = false,
  guestConversionPending,
  isGuest,
}: {
  children: React.ReactNode;
  initialChats: Chat[];
  initialUsageData: UsageData | null;
  initialCoachingGoal: string | null;
  initialActiveRoutine: RoutineCardData | null;
  initialRoutinesEnabled?: boolean;
  guestConversionPending: boolean;
  isGuest: boolean;
}) {
  const { user } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [chats, setChats] = useState<Chat[]>(() =>
    initialChats.map((chat) => ({
      ...chat,
      icon: normalizeChatIcon(chat.icon),
    })),
  );
  const [activeRoutine, setActiveRoutine] = useState<RoutineCardData | null>(
    initialActiveRoutine,
  );
  const activeRoutineRefreshIdRef = useRef(0);
  const [routineCollection, setRoutineCollection] =
    useState<RoutineCollectionState>(emptyRoutineCollection);
  const routineCollectionRef = useRef<RoutineCollectionState>(
    emptyRoutineCollection,
  );
  const [routineCollectionError, setRoutineCollectionError] = useState<
    string | null
  >(null);
  const [isRoutineCollectionLoading, setIsRoutineCollectionLoading] =
    useState(false);
  const [
    routineCollectionLoadingMoreStatus,
    setRoutineCollectionLoadingMoreStatus,
  ] = useState<RoutineCollectionStatus | null>(null);
  const routineCollectionRefreshIdRef = useRef(0);
  const routineCollectionPageLoadingRef =
    useRef<RoutineCollectionStatus | null>(null);
  const [isLoading, _setIsLoading] = useState(false);
  const [isCreateChatRequestPending, setIsCreateChatRequestPending] =
    useState(false);
  const [, startChatNavigation] = useTransition();
  const [isCreateChatNavigationPending, startCreateChatNavigation] =
    useTransition();
  const isCreatingChat =
    isCreateChatRequestPending || isCreateChatNavigationPending;
  const isMobileSidebarViewport = useIsMobileSidebarViewport();
  const isMobileSidebarViewportRef = useRef(isMobileSidebarViewport);
  isMobileSidebarViewportRef.current = isMobileSidebarViewport;
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(true);
  const sidebarReturnFocusRef = useRef<HTMLElement | null>(null);
  const desktopSidebarRef = useRef<HTMLElement | null>(null);
  const mainContentRef = useRef<HTMLElement | null>(null);
  const [chatNavigationEpoch, setChatNavigationEpoch] = useState(0);
  const previousPathnameRef = useRef(pathname);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { confirm, isOpen, options, handleConfirm, setIsOpen } = useConfirm();

  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      previousPathnameRef.current = pathname;
      setChatNavigationEpoch((current) => current + 1);
    }
  }, [pathname]);

  useEffect(() => {
    const root = document.documentElement;

    if (!isMobileSidebarViewport && isDesktopSidebarOpen) {
      root.dataset.chatSidebar = "open";
    } else {
      delete root.dataset.chatSidebar;
    }

    return () => {
      delete root.dataset.chatSidebar;
    };
  }, [isDesktopSidebarOpen, isMobileSidebarViewport]);

  useEffect(() => {
    if (!isMobileSidebarViewport) {
      setIsMobileSidebarOpen(false);
    }
  }, [isMobileSidebarViewport]);

  // API base path switches based on auth mode
  const apiBase = isGuest ? "/api/guest" : "/api";

  // Usage tracking state
  const [usageData, setUsageData] = useState(initialUsageData);
  const isConversationRoute =
    pathname !== "/chat/usage" &&
    pathname !== "/chat/routines" &&
    /^\/chat\/[^/?#\\]+$/.test(pathname ?? "");
  const safeChatContinuation =
    pathname === "/chat" || isConversationRoute ? pathname : "/chat";
  const guestRegistrationHref = `/sign-up?redirect_url=${encodeURIComponent(
    safeChatContinuation,
  )}`;
  const guestRemaining = usageData
    ? Math.max(0, usageData.limits.maxRequests - usageData.usage.requestCount)
    : undefined;
  const guestConversationNotice: GuestConversationNotice | null =
    isGuest && isConversationRoute
      ? {
          remaining: guestRemaining,
          registrationHref: guestRegistrationHref,
        }
      : null;
  const openSidebar = useCallback(() => {
    if (isMobileSidebarViewport) {
      sidebarReturnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setIsMobileSidebarOpen(true);
      return;
    }
    setIsDesktopSidebarOpen(true);
  }, [isMobileSidebarViewport]);

  // Sync state with initial data on change (HMR support)
  useEffect(() => {
    setChats(
      initialChats.map((chat) => ({
        ...chat,
        icon: normalizeChatIcon(chat.icon),
      })),
    );
  }, [initialChats]);

  useEffect(() => {
    setUsageData(initialUsageData);
  }, [initialUsageData]);

  useEffect(() => {
    activeRoutineRefreshIdRef.current += 1;
    setActiveRoutine(initialActiveRoutine);
  }, [initialActiveRoutine]);

  const applyRoutineCollection = useCallback(
    (update: (current: RoutineCollectionState) => RoutineCollectionState) => {
      setRoutineCollection((current) => {
        const next = update(current);
        routineCollectionRef.current = next;
        return next;
      });
    },
    [],
  );

  const refreshRoutineCollection = useCallback(async () => {
    if (isGuest) return emptyRoutineCollection;

    const refreshId = routineCollectionRefreshIdRef.current + 1;
    routineCollectionRefreshIdRef.current = refreshId;
    routineCollectionPageLoadingRef.current = null;
    setIsRoutineCollectionLoading(true);
    setRoutineCollectionLoadingMoreStatus(null);
    setRoutineCollectionError(null);

    try {
      const [active, archived] = await Promise.all([
        fetchRoutineCollection({ status: "ACTIVE", limit: 12 }),
        fetchRoutineCollection({ status: "ARCHIVED", limit: 12 }),
      ]);
      const collection = {
        routines: [...active.routines, ...archived.routines],
        active: { total: active.total, nextCursor: active.nextCursor },
        archived: { total: archived.total, nextCursor: archived.nextCursor },
      };
      if (routineCollectionRefreshIdRef.current === refreshId) {
        applyRoutineCollection(() => collection);
        setIsRoutineCollectionLoading(false);
      }
      return collection;
    } catch {
      if (routineCollectionRefreshIdRef.current === refreshId) {
        setRoutineCollectionError("Routine non disponibili");
        setIsRoutineCollectionLoading(false);
      }
      return emptyRoutineCollection;
    }
  }, [applyRoutineCollection, isGuest]);

  const loadMoreRoutineCollection = useCallback(
    async (status: RoutineCollectionStatus) => {
      if (isGuest || routineCollectionPageLoadingRef.current !== null) return;

      const segment =
        status === "ACTIVE"
          ? routineCollectionRef.current.active
          : routineCollectionRef.current.archived;
      if (!segment.nextCursor) return;

      const refreshId = routineCollectionRefreshIdRef.current + 1;
      routineCollectionRefreshIdRef.current = refreshId;
      routineCollectionPageLoadingRef.current = status;
      setRoutineCollectionLoadingMoreStatus(status);
      setRoutineCollectionError(null);

      try {
        const page = await fetchRoutineCollection({
          status,
          cursor: segment.nextCursor,
          limit: 12,
        });
        if (routineCollectionRefreshIdRef.current === refreshId) {
          applyRoutineCollection((current) => {
            const currentStatusRoutines = current.routines.filter(
              (routine) => routine.status === status,
            );
            const otherRoutines = current.routines.filter(
              (routine) => routine.status !== status,
            );
            const existingIds = new Set(
              currentStatusRoutines.map((routine) => routine.id),
            );
            const nextStatusRoutines = [
              ...currentStatusRoutines,
              ...page.routines.filter(
                (routine) => !existingIds.has(routine.id),
              ),
            ];
            const nextSegment = {
              total: page.total,
              nextCursor: page.nextCursor,
            };
            return status === "ACTIVE"
              ? {
                  routines: [...nextStatusRoutines, ...otherRoutines],
                  active: nextSegment,
                  archived: current.archived,
                }
              : {
                  routines: [...otherRoutines, ...nextStatusRoutines],
                  active: current.active,
                  archived: nextSegment,
                };
          });
        }
      } catch {
        if (routineCollectionRefreshIdRef.current === refreshId) {
          setRoutineCollectionError("Routine non disponibili");
        }
      } finally {
        if (routineCollectionRefreshIdRef.current === refreshId) {
          routineCollectionPageLoadingRef.current = null;
          setRoutineCollectionLoadingMoreStatus(null);
        }
      }
    },
    [applyRoutineCollection, isGuest],
  );

  useEffect(() => {
    if (!isGuest) {
      void refreshRoutineCollection();
    }
  }, [isGuest, refreshRoutineCollection]);

  const updateActiveRoutine = useCallback(
    (routine: RoutineCardData) => {
      activeRoutineRefreshIdRef.current += 1;
      routineCollectionRefreshIdRef.current += 1;
      routineCollectionPageLoadingRef.current = null;
      setIsRoutineCollectionLoading(false);
      setRoutineCollectionLoadingMoreStatus(null);
      setRoutineCollectionError(null);
      setActiveRoutine((current) => {
        if (routine.status === "ACTIVE") return routine;
        return current?.id === routine.id ? null : current;
      });
      applyRoutineCollection((current) => {
        const withoutRoutine = current.routines.filter(
          (item) => item.id !== routine.id,
        );
        return {
          routines: [routine, ...withoutRoutine],
          active: { total: null, nextCursor: null },
          archived: { total: null, nextCursor: null },
        };
      });
    },
    [applyRoutineCollection],
  );

  const refreshActiveRoutine = useCallback(async () => {
    if (isGuest) return null;
    const refreshId = activeRoutineRefreshIdRef.current + 1;
    activeRoutineRefreshIdRef.current = refreshId;
    const routine = await fetchActiveRoutineForReturn();
    if (activeRoutineRefreshIdRef.current === refreshId) {
      setActiveRoutine(routine);
    }
    void refreshRoutineCollection();
    return routine;
  }, [isGuest, refreshRoutineCollection]);

  const navigateToRoutine = useCallback(
    (routine: RoutineCardData) => {
      if (isMobileSidebarViewport) {
        setIsMobileSidebarOpen(false);
      }
      startChatNavigation(() => {
        router.push(getRoutineCheckInHref(routine), { scroll: false });
      });
    },
    [isMobileSidebarViewport, router],
  );

  const openRoutineCheckIn = navigateToRoutine;

  useEffect(() => {
    if (!guestConversionPending || isGuest) return;
    fetch("/api/guest/convert", { method: "POST" }).catch(() => {});
  }, [guestConversionPending, isGuest]);

  // Keep usage monitor fresh while user is active in chat.
  useEffect(() => {
    const endpoint = isGuest ? "/api/guest/usage" : "/api/usage";
    let cancelled = false;

    const refreshUsageData = async () => {
      try {
        const res = await fetch(`${endpoint}?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as UsageData;
        if (!cancelled) {
          setUsageData(data);
        }
      } catch (error) {
        console.error("Failed to refresh usage data:", error);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshUsageData();
      }
    };

    refreshUsageData();
    const intervalId = window.setInterval(refreshUsageData, 30_000);
    window.addEventListener("focus", refreshUsageData);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshUsageData);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [isGuest]);

  // Keyboard shortcuts
  useKeyboardShortcut({
    key: "n",
    modifiers: ["meta"],
    callback: () => {
      createChat();
    },
  });

  useKeyboardShortcut({
    key: "/",
    modifiers: ["meta"],
    callback: () => {
      if (isMobileSidebarViewport) {
        setIsMobileSidebarOpen((open) => {
          if (!open) {
            sidebarReturnFocusRef.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }
          return !open;
        });
        return;
      }
      setIsDesktopSidebarOpen((open) => !open);
    },
  });

  useKeyboardShortcut({
    key: "k",
    modifiers: ["meta"],
    callback: () => setIsSearchOpen(true),
    enabled: !!user,
  });

  // Chat data cache for avoiding redundant API calls
  const chatCacheRef = useRef<Map<string, ChatData>>(new Map());
  const preFetchingIdsRef = useRef<Set<string>>(new Set());
  const createChatPromiseRef = useRef<Promise<string | null> | null>(null);
  const pendingInitialMessagesRef = useRef<Map<string, string>>(new Map());
  const pendingRoutineChatContextsRef = useRef<
    Map<string, PendingRoutineChatContext>
  >(new Map());
  const chatViewportRef = useRef<HTMLDivElement>(null);
  const MAX_CACHE_SIZE = 20;

  // Get current chat ID from pathname
  const currentChatId = pathname?.split("/chat/")?.[1] || null;

  useEffect(() => {
    if (!chatViewportRef.current) return;

    return installChatViewportSizing(chatViewportRef.current);
  }, []);

  // Fetch chats (for refresh)
  async function refreshChats() {
    try {
      const response = await fetch(`${apiBase}/chats`);
      if (response.ok) {
        const data = await response.json();
        const nextChats = Array.isArray(data.chats) ? data.chats : [];
        setChats(
          nextChats.map((chat: Chat) => ({
            ...chat,
            icon: normalizeChatIcon(chat.icon),
          })),
        );
      }
    } catch (error) {
      console.error("Failed to fetch chats:", error);
    }
  }

  // Pre-fetch chat data on hover
  async function preFetchChat(id: string) {
    router.prefetch(`/chat/${id}`);

    if (chatCacheRef.current.has(id) || preFetchingIdsRef.current.has(id)) {
      return;
    }

    preFetchingIdsRef.current.add(id);

    try {
      const response = await fetch(`${apiBase}/chats/${id}`);
      if (response.ok) {
        const data = await response.json();

        if (chatCacheRef.current.size >= MAX_CACHE_SIZE) {
          const firstKey = chatCacheRef.current.keys().next().value;
          if (firstKey) {
            chatCacheRef.current.delete(firstKey);
          }
        }

        chatCacheRef.current.set(id, data);
      }
    } catch {
      // prefetch failures are non-critical; suppress noise
    } finally {
      preFetchingIdsRef.current.delete(id);
    }
  }

  function getCachedChat(id: string): ChatData | null {
    return chatCacheRef.current.get(id) || null;
  }

  function updateCachedChat(id: string, data: Partial<ChatData>) {
    const existing = chatCacheRef.current.get(id);
    if (existing) {
      chatCacheRef.current.set(id, { ...existing, ...data });
    } else if (data.messages) {
      chatCacheRef.current.set(id, data as ChatData);
    }
  }

  function navigateToChat(id: string) {
    startChatNavigation(() => {
      router.push(`/chat/${id}`, { scroll: false });
    });
  }

  function consumePendingInitialMessage(chatId: string) {
    const pending = pendingInitialMessagesRef.current.get(chatId) ?? null;
    if (pending) {
      pendingInitialMessagesRef.current.delete(chatId);
    }
    return pending;
  }

  function consumePendingRoutineChatContext(
    chatId: string,
  ): PendingRoutineChatContext | null {
    const pending = pendingRoutineChatContextsRef.current.get(chatId) ?? null;
    if (pending) {
      pendingRoutineChatContextsRef.current.delete(chatId);
    }
    return pending;
  }

  // Create chat
  const createChat = async (
    options: CreateChatOptions = {},
  ): Promise<string | null> => {
    if (isCreatingChat) {
      return createChatPromiseRef.current ?? null;
    }

    if (createChatPromiseRef.current) {
      return createChatPromiseRef.current;
    }

    const initialMessage = options.initialMessage?.trim();

    const createChatPromise = (async () => {
      const response = await fetch(`${apiBase}/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: options.title,
          routineContext: options.routineContext
            ? {
                routineId: options.routineContext.routineId,
                mode: options.routineContext.mode,
              }
            : undefined,
        }),
      });

      if (response.ok) {
        const chat = await response.json();

        const newChat: Chat = {
          id: chat.id,
          title: chat.title ?? "Nuova Chat",
          icon: normalizeChatIcon(chat.icon),
          visibility: chat.visibility,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          messageCount: 0,
        };

        setChats((prev) => [newChat, ...prev]);
        if (options.routineContext) {
          pendingRoutineChatContextsRef.current.set(
            chat.id,
            options.routineContext,
          );
        }
        if (initialMessage) {
          pendingInitialMessagesRef.current.set(chat.id, initialMessage);
          chatCacheRef.current.set(chat.id, {
            id: chat.id,
            title: newChat.title,
            icon: newChat.icon,
            visibility: newChat.visibility,
            isOwner: true,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
            messages: [],
            routines: [],
            ...(options.routineContext?.routine
              ? {
                  routineContext: {
                    mode: options.routineContext.mode,
                    routine: options.routineContext.routine,
                  },
                }
              : {}),
            pagination: {
              hasMore: false,
              nextCursor: null,
            },
            voiceEnabled: true,
            voicePlanEnabled: !isGuest,
          });
        }
        startCreateChatNavigation(() => {
          router.push(`/chat/${chat.id}`, { scroll: false });
        });
        return chat.id;
      }

      toast.error("Creazione conversazione fallita");
      return null;
    })();

    createChatPromiseRef.current = createChatPromise;
    setIsCreateChatRequestPending(true);

    try {
      return await createChatPromise;
    } catch (error) {
      console.error("Failed to create chat:", error);
      toast.error("Creazione conversazione fallita");
      return null;
    } finally {
      createChatPromiseRef.current = null;
      setIsCreateChatRequestPending(false);
    }
  };

  const createRoutineChat = (routine: RoutineCardData, mode: RoutineChatMode) =>
    createChat({
      title: `${mode === "repeat" ? "Ripeti" : "Adatta"}: ${routine.proposal.title}`,
      // Repeating is a local invocation of the saved routine. The card is
      // already actionable in the new chat, so do not spend a model turn
      // restating it. Adaptation still needs an Anthon turn to propose a new
      // version from the user's feedback.
      ...(mode === "adapt"
        ? { initialMessage: buildRoutineChatPrompt(routine, mode) }
        : {}),
      routineContext: { mode, routineId: routine.id, routine },
    });

  // Rename chat
  const renameChat = async (id: string, newTitle: string): Promise<boolean> => {
    try {
      setChats((prev) => {
        const chat = prev.find((c) => c.id === id);
        if (!chat) return prev;
        const filtered = prev.filter((c) => c.id !== id);
        return [{ ...chat, title: newTitle }, ...filtered];
      });

      const response = await fetch(`${apiBase}/chats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });

      if (response.ok) {
        const cached = chatCacheRef.current.get(id);
        if (cached) {
          chatCacheRef.current.set(id, {
            ...cached,
            title: newTitle,
          });
        }
        return true;
      } else {
        await refreshChats();
        toast.error("Impossibile rinominare la conversazione");
        return false;
      }
    } catch (error) {
      console.error("Failed to rename chat:", error);
      await refreshChats();
      toast.error("Impossibile rinominare la conversazione");
      return false;
    }
  };

  // Delete chat
  const deleteChat = async (id: string): Promise<boolean> => {
    const confirmed = await confirm({
      title: "Eliminare la conversazione?",
      description:
        "Questo eliminerà permanentemente questa conversazione e tutti i suoi messaggi. Questa azione non può essere annullata.",
      confirmText: "Elimina",
      cancelText: "Annulla",
      variant: "destructive",
    });

    if (!confirmed) {
      return false;
    }

    setDeletingChatId(id);
    try {
      const response = await fetch(`${apiBase}/chats/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Optimistically remove the chat from local state immediately
        setChats((prev) => prev.filter((c) => c.id !== id));
        chatCacheRef.current.delete(id);

        try {
          await refreshActiveRoutine();
        } catch {
          router.refresh();
        }

        // Navigate away if we just deleted the current chat
        if (currentChatId === id) {
          router.push("/chat");
        }

        toast.success("Conversazione eliminata");

        // Refresh chat list in the background (non-blocking)
        refreshChats().catch(() => {});

        return true;
      } else {
        toast.error("Eliminazione conversazione fallita");
      }
    } catch (error) {
      console.error("Failed to delete chat:", error);
      toast.error("Eliminazione conversazione fallita");
    } finally {
      setDeletingChatId(null);
    }
    return false;
  };

  return (
    <ChatContext.Provider
      value={{
        chats,
        coachingGoal: initialCoachingGoal,
        activeRoutine,
        isLoading,
        isCreatingChat,
        currentChatId,
        chatNavigationEpoch,
        isGuest,
        createChat,
        createRoutineChat,
        deleteChat,
        refreshChats,
        preFetchChat,
        getCachedChat,
        navigateToChat,
        renameChat,
        updateCachedChat,
        consumePendingInitialMessage,
        consumePendingRoutineChatContext,
        updateActiveRoutine,
        refreshActiveRoutine,
        routineCollection,
        routineCollectionError,
        isRoutineCollectionLoading,
        routineCollectionLoadingMoreStatus,
        refreshRoutineCollection,
        loadMoreRoutineCollection,
        navigateToRoutine,
        openRoutineCheckIn,
        openSidebar,
        guestConversationNotice,
      }}
    >
      <div
        ref={chatViewportRef}
        className="flex chat-mobile-viewport overflow-hidden"
        data-testid="chat-layout-shell"
      >
        {isMobileSidebarViewport && (
          <Sheet
            open={isMobileSidebarOpen}
            onOpenChange={setIsMobileSidebarOpen}
          >
            <SheetContent
              side="left"
              showCloseButton={false}
              className="w-72 max-w-[85vw] gap-0 p-0"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (
                  isMobileSidebarViewportRef.current &&
                  isRenderedVisible(sidebarReturnFocusRef.current)
                ) {
                  sidebarReturnFocusRef.current.focus();
                  return;
                }

                const desktopSidebarControl =
                  desktopSidebarRef.current?.querySelector<HTMLButtonElement>(
                    'button[aria-label="Chiudi la barra laterale"]',
                  ) ?? null;
                if (isRenderedVisible(desktopSidebarControl)) {
                  desktopSidebarControl.focus();
                  return;
                }

                focusVisibleMainContent(mainContentRef.current);
              }}
            >
              <SheetTitle className="sr-only">Conversazioni</SheetTitle>
              <SheetDescription className="sr-only">
                Elenco delle tue conversazioni.
              </SheetDescription>
              <SidebarContents
                chats={chats}
                isLoading={isLoading}
                isCreatingChat={isCreatingChat}
                currentChatId={currentChatId}
                deletingChatId={deletingChatId}
                onDelete={deleteChat}
                onSelect={(id) => {
                  navigateToChat(id);
                  setIsMobileSidebarOpen(false);
                }}
                onCreate={createChat}
                onSearch={user ? () => setIsSearchOpen(true) : undefined}
                onRename={renameChat}
                onPreFetch={preFetchChat}
                onClose={() => setIsMobileSidebarOpen(false)}
                isGuest={isGuest}
                routineCollection={routineCollection}
                routineCollectionError={routineCollectionError}
                isRoutineCollectionLoading={isRoutineCollectionLoading}
                routinesEnabled={initialRoutinesEnabled}
                onRetryRoutineCollection={() => {
                  void refreshRoutineCollection();
                }}
              />
            </SheetContent>
          </Sheet>
        )}

        {!isMobileSidebarViewport && isDesktopSidebarOpen && (
          <aside
            ref={desktopSidebarRef}
            className="hidden h-full w-72 shrink-0 flex-col border-r border-border/50 bg-background/80 backdrop-blur-xl dark:border-white/10 dark:bg-muted/40 md:flex"
          >
            <SidebarContents
              chats={chats}
              isLoading={isLoading}
              isCreatingChat={isCreatingChat}
              currentChatId={currentChatId}
              deletingChatId={deletingChatId}
              onDelete={deleteChat}
              onSelect={navigateToChat}
              onCreate={createChat}
              onSearch={user ? () => setIsSearchOpen(true) : undefined}
              onRename={renameChat}
              onPreFetch={preFetchChat}
              onClose={() => setIsDesktopSidebarOpen(false)}
              isGuest={isGuest}
              routineCollection={routineCollection}
              routineCollectionError={routineCollectionError}
              isRoutineCollectionLoading={isRoutineCollectionLoading}
              routinesEnabled={initialRoutinesEnabled}
              onRetryRoutineCollection={() => {
                void refreshRoutineCollection();
              }}
            />
          </aside>
        )}

        {/* Main Content */}
        <main
          ref={mainContentRef}
          tabIndex={-1}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)]"
        >
          {/* Integrated Header Bar */}
          {!isConversationRoute &&
            (isGuest ? (
              <GuestBanner
                remaining={guestRemaining}
                registrationHref={guestRegistrationHref}
                onOpenSidebar={openSidebar}
              />
            ) : (
              <MobileLandingSidebarTrigger onOpenSidebar={openSidebar} />
            ))}
          {usageData && (!isGuest || isConversationRoute) ? (
            <UsageBanner
              usage={usageData.usage}
              limits={usageData.limits}
              tier={usageData.tier}
              subscriptionStatus={usageData.subscriptionStatus}
              entitlements={usageData.entitlements}
            />
          ) : null}
          {children}
        </main>
      </div>
      <SearchDialog
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onResultNavigation={() => {
          if (isMobileSidebarViewport) {
            setIsMobileSidebarOpen(false);
          }
        }}
      />
      <ConfirmDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        onConfirm={handleConfirm}
        title={options.title}
        description={options.description}
        confirmText={options.confirmText}
        cancelText={options.cancelText}
        variant={options.variant}
      />
    </ChatContext.Provider>
  );
}
