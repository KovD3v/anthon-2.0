import type { SubscriptionStatus, UserRole } from "@/generated/prisma";
import { SESSION } from "@/lib/ai/constants";
import { prisma } from "@/lib/db";
import { getPostHogClient } from "@/lib/posthog";

export type FunnelStep = "signup" | "first_chat" | "session_3" | "upgrade";
export type FunnelChannel = "WEB" | "WHATSAPP" | "TELEGRAM" | "WEB_GUEST";

interface FunnelEventContext {
  userId: string;
  isGuest: boolean;
  userRole: UserRole;
  channel?: FunnelChannel;
  planId?: string | null;
  planName?: string | null;
  subscriptionStatus?: SubscriptionStatus | null;
}

interface FunnelSession3Context extends FunnelEventContext {
  validSessionsCount: number;
}

export interface SessionProgress {
  totalSessions: number;
  validSessions: number;
  lastSessionMessageCount: number;
}

const SESSION_GAP_MINUTES = Math.round(SESSION.GAP_MS / (60 * 1000));

function compactProperties(
  properties: Record<string, string | number | boolean | null | undefined>,
) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  );
}

function captureFunnelEvent(
  step: FunnelStep,
  context: FunnelEventContext,
  extra: Record<string, string | number | boolean | null | undefined> = {},
) {
  if (!process.env.POSTHOG_API_KEY) {
    return;
  }

  try {
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: context.userId,
      event: `funnel_${step}`,
      properties: compactProperties({
        funnel_step: step,
        is_guest: context.isGuest,
        channel: context.channel,
        user_role: context.userRole,
        plan_id: context.planId,
        plan_name: context.planName,
        subscription_status: context.subscriptionStatus,
        ...extra,
      }),
    });
  } catch (error) {
    console.error("[Funnel Analytics] capture failed:", error);
  }
}

export function trackFunnelSignup(context: FunnelEventContext) {
  captureFunnelEvent("signup", context);
}

export function trackFunnelFirstChat(context: FunnelEventContext) {
  captureFunnelEvent("first_chat", context);
}

export function trackFunnelSession3(context: FunnelSession3Context) {
  captureFunnelEvent("session_3", context, {
    session_gap_minutes: SESSION_GAP_MINUTES,
    valid_sessions_count: context.validSessionsCount,
  });
}

export function trackFunnelUpgrade(context: FunnelEventContext) {
  captureFunnelEvent("upgrade", context);
}

export function analyzeSessionProgress(timestamps: Date[]): SessionProgress {
  if (timestamps.length === 0) {
    return {
      totalSessions: 0,
      validSessions: 0,
      lastSessionMessageCount: 0,
    };
  }

  const sessionSizes: number[] = [];
  let currentSessionSize = 1;

  for (let i = 1; i < timestamps.length; i++) {
    const prevTime = timestamps[i - 1].getTime();
    const currentTime = timestamps[i].getTime();

    if (currentTime - prevTime > SESSION.GAP_MS) {
      sessionSizes.push(currentSessionSize);
      currentSessionSize = 1;
    } else {
      currentSessionSize++;
    }
  }

  sessionSizes.push(currentSessionSize);

  return {
    totalSessions: sessionSizes.length,
    validSessions: sessionSizes.filter((size) => size >= 2).length,
    lastSessionMessageCount: sessionSizes[sessionSizes.length - 1] || 0,
  };
}

export function shouldTrackSession3(progress: SessionProgress): boolean {
  return progress.validSessions === 3 && progress.lastSessionMessageCount === 2;
}

export async function trackInboundUserMessageFunnelProgress(
  context: FunnelEventContext,
) {
  const totalUserMessages = await prisma.message.count({
    where: {
      userId: context.userId,
      role: "USER",
    },
  });

  if (totalUserMessages === 1) {
    trackFunnelFirstChat(context);
  }

  // Minimum needed for 3 valid sessions with at least 2 messages each.
  if (totalUserMessages < 6) {
    return;
  }

  const userMessages = await prisma.message.findMany({
    where: {
      userId: context.userId,
      role: "USER",
    },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const progress = analyzeSessionProgress(
    userMessages.map((message) => message.createdAt),
  );

  if (shouldTrackSession3(progress)) {
    trackFunnelSession3({
      ...context,
      validSessionsCount: progress.validSessions,
    });
  }
}
