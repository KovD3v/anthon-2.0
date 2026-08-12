import {
  type ClientTraceV1,
  MAX_TRACE_MS,
  parseClientTrace,
} from "./contracts";

export interface ClientTraceCollector {
  readonly clientMessageId: string;
  markStreamOpened(): void;
  markFirstChunkReceived(): void;
  markFirstTextDeltaReceived(): void;
  markFirstDomText(): void;
  markFirstVisibleFrame(): void;
  markStreamCompleted(): void;
  markPersistedMessageResolved(): void;
  abandon(): void;
  waitForPresentation(options?: { timeoutMs?: number }): Promise<void>;
  snapshot(): ClientTraceV1;
}

type Milestones = ClientTraceV1["milestones"];
type OptionalMilestone = Exclude<keyof Milestones, "requestStartedMs">;

const COMPLETE_MILESTONES: OptionalMilestone[] = [
  "streamOpenedMs",
  "firstChunkReceivedMs",
  "firstTextDeltaReceivedMs",
  "firstDomTextMs",
  "firstVisibleFrameMs",
  "streamCompletedMs",
  "persistedMessageResolvedMs",
];
const RETRY_DELAYS_MS = [150, 400, 900] as const;

function boundedMilliseconds(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_TRACE_MS, Math.max(0, Math.round(value)));
}

export function createClientTraceCollector(options: {
  clientMessageId: string;
  now?: () => number;
  documentVisibility?: () => DocumentVisibilityState;
}): ClientTraceCollector {
  const now = options.now ?? (() => performance.now());
  const documentVisibility =
    options.documentVisibility ??
    (() => globalThis.document?.visibilityState ?? "visible");
  let lastClock = 0;
  const readClock = () => {
    try {
      const value = now();
      if (Number.isFinite(value)) lastClock = Math.max(lastClock, value);
    } catch {
      // Client profiling must not affect chat delivery.
    }
    return lastClock;
  };
  const startedAt = readClock();
  const elapsed = () => boundedMilliseconds(readClock() - startedAt);
  const milestones: Milestones = { requestStartedMs: 0 };
  const presentationWaiters = new Set<() => void>();
  let abandoned = false;
  let presentationSettled = documentVisibility() === "hidden";

  const settlePresentation = () => {
    if (presentationSettled) return;
    presentationSettled = true;
    for (const resolve of presentationWaiters) resolve();
    presentationWaiters.clear();
  };
  const mark = (key: OptionalMilestone, predecessor?: OptionalMilestone) => {
    if (abandoned || milestones[key] !== undefined) return false;
    if (predecessor && milestones[predecessor] === undefined) return false;
    milestones[key] = elapsed();
    return true;
  };
  const isComplete = () =>
    COMPLETE_MILESTONES.every((key) => milestones[key] !== undefined);

  return {
    clientMessageId: options.clientMessageId,
    markStreamOpened() {
      mark("streamOpenedMs");
    },
    markFirstChunkReceived() {
      mark("firstChunkReceivedMs", "streamOpenedMs");
    },
    markFirstTextDeltaReceived() {
      mark("firstTextDeltaReceivedMs", "firstChunkReceivedMs");
    },
    markFirstDomText() {
      if (!mark("firstDomTextMs", "firstTextDeltaReceivedMs")) return;
      if (documentVisibility() === "hidden") {
        settlePresentation();
      }
    },
    markFirstVisibleFrame() {
      if (documentVisibility() === "hidden") {
        settlePresentation();
        return;
      }
      if (mark("firstVisibleFrameMs", "firstDomTextMs")) {
        settlePresentation();
      }
    },
    markStreamCompleted() {
      mark("streamCompletedMs");
    },
    markPersistedMessageResolved() {
      mark("persistedMessageResolvedMs", "streamCompletedMs");
    },
    abandon() {
      if (!isComplete()) abandoned = true;
      settlePresentation();
    },
    async waitForPresentation({ timeoutMs = 1_000 } = {}) {
      if (
        presentationSettled ||
        milestones.firstVisibleFrameMs !== undefined ||
        documentVisibility() === "hidden"
      ) {
        settlePresentation();
        return;
      }

      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          presentationWaiters.delete(finish);
          if (typeof document !== "undefined") {
            document.removeEventListener("visibilitychange", onVisibility);
          }
          clearTimeout(timer);
          resolve();
        };
        const onVisibility = () => {
          if (documentVisibility() === "hidden") {
            settlePresentation();
            finish();
          }
        };
        presentationWaiters.add(finish);
        if (typeof document !== "undefined") {
          document.addEventListener("visibilitychange", onVisibility, {
            once: true,
          });
        }
        const timer = setTimeout(finish, Math.max(0, timeoutMs));
      });
    },
    snapshot() {
      return {
        version: 1,
        status: abandoned
          ? "abandoned"
          : isComplete()
            ? "completed"
            : "partial",
        milestones: { ...milestones },
      };
    },
  };
}

export type SubmitClientTraceResult = "stored" | "failed";

export async function submitClientTrace(options: {
  chatId: string;
  collector: ClientTraceCollector;
  fetchImpl?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
  presentationTimeoutMs?: number;
}): Promise<SubmitClientTraceResult> {
  try {
    await options.collector.waitForPresentation({
      timeoutMs: options.presentationTimeoutMs ?? 1_000,
    });
    const trace = parseClientTrace(options.collector.snapshot());
    if (!trace) return "failed";
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const sleep =
      options.sleep ??
      ((delayMs: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, delayMs)));

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      const response = await fetchImpl("/api/chat/messages/client-trace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
        body: JSON.stringify({
          chatId: options.chatId,
          clientMessageId: options.collector.clientMessageId,
          trace,
        }),
      });
      if (response.ok) return "stored";

      const retryablePending =
        response.status === 409 &&
        (
          (await response.json().catch(() => null)) as {
            retryable?: unknown;
          } | null
        )?.retryable === true;
      if (!retryablePending || attempt === RETRY_DELAYS_MS.length) {
        return "failed";
      }
      await sleep(RETRY_DELAYS_MS[attempt] ?? 0);
    }
  } catch {
    // Best effort: a profiler failure must never surface in chat UI.
  }
  return "failed";
}
