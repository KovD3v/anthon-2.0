import { z } from "zod";
import { createLogger } from "@/lib/logger";
import { getPostHogClient } from "@/lib/posthog";

const routineAnalyticsLogger = createLogger("usage");
const opaqueIdSchema = z
  .string()
  .min(6)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const routineAnalyticsEventSchema = z
  .object({
    event: z.enum([
      "routine_proposed",
      "routine_saved",
      "routine_started",
      "routine_completed",
      "routine_check_in_completed",
      "routine_restarted_within_14d",
    ]),
    routineId: opaqueIdSchema,
    formatVersion: z.union([z.literal(1), z.literal(2)]),
    widgetKind: z.enum([
      "instruction",
      "timer",
      "breathing",
      "form",
      "routine_card",
    ]),
    durationSeconds: z.number().int().min(5).max(900).optional(),
    technicalState: z.enum(["success", "retry", "failed"]).optional(),
    temporalWindowDays: z.union([z.literal(7), z.literal(14)]).optional(),
  })
  .strict();

export type RoutineAnalyticsEvent = z.infer<typeof routineAnalyticsEventSchema>;

export function routineAnalyticsProperties(event: RoutineAnalyticsEvent) {
  return {
    routine_id: event.routineId,
    format_version: event.formatVersion,
    widget_kind: event.widgetKind,
    ...(event.durationSeconds !== undefined
      ? { duration_seconds: event.durationSeconds }
      : {}),
    ...(event.technicalState ? { technical_state: event.technicalState } : {}),
    ...(event.temporalWindowDays
      ? { temporal_window_days: event.temporalWindowDays }
      : {}),
  };
}

export function trackRoutineAnalyticsEvent(input: RoutineAnalyticsEvent) {
  const parsed = routineAnalyticsEventSchema.safeParse(input);
  if (!parsed.success || !process.env.POSTHOG_API_KEY) return;
  try {
    getPostHogClient().capture({
      distinctId: parsed.data.routineId,
      event: parsed.data.event,
      properties: routineAnalyticsProperties(parsed.data),
    });
  } catch (error) {
    routineAnalyticsLogger.error(
      "routine_capture_failed",
      "Routine analytics capture failed",
      { error },
    );
  }
}
