"use server";

import { requireAdmin } from "@/lib/auth";

async function triggerCronJob(job: string): Promise<void> {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) throw new Error("Forbidden: Admin access required");

  const secret = process.env.CRON_SECRET;
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  await fetch(`${appUrl}/api/cron/trigger?job=${job}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
}

export async function triggerAllMaintenance(): Promise<void> {
  await triggerCronJob("all");
}

export async function triggerConsolidateMemories(): Promise<void> {
  await triggerCronJob("consolidate");
}

export async function triggerArchiveSessions(): Promise<void> {
  await triggerCronJob("archive");
}

export async function triggerAnalyzeProfiles(): Promise<void> {
  await triggerCronJob("analyze");
}
