"use client";

import posthog from "posthog-js";
import { z } from "zod";

const routineAnalyticsClientEventSchema = z
  .object({
    event: z.enum([
      "routine_proposed",
      "routine_saved",
      "routine_started",
      "routine_completed",
      "routine_check_in_completed",
      "routine_restarted_within_14d",
    ]),
    routineId: z
      .string()
      .min(6)
      .max(128)
      .regex(/^[a-zA-Z0-9_-]+$/),
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

export type RoutineAnalyticsClientEvent = z.infer<
  typeof routineAnalyticsClientEventSchema
>;

export function trackRoutineAnalytics(input: RoutineAnalyticsClientEvent) {
  const parsed = routineAnalyticsClientEventSchema.safeParse(input);
  if (!parsed.success) return;
  posthog.capture(parsed.data.event, {
    routine_id: parsed.data.routineId,
    format_version: parsed.data.formatVersion,
    widget_kind: parsed.data.widgetKind,
    ...(parsed.data.durationSeconds !== undefined
      ? { duration_seconds: parsed.data.durationSeconds }
      : {}),
    ...(parsed.data.technicalState
      ? { technical_state: parsed.data.technicalState }
      : {}),
    ...(parsed.data.temporalWindowDays
      ? { temporal_window_days: parsed.data.temporalWindowDays }
      : {}),
  });
}
