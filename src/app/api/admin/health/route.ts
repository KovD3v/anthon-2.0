import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { del, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

interface HealthStatus {
  status: "connected" | "error";
  message?: string;
}

interface HealthResponse {
  database: HealthStatus;
  openrouter: HealthStatus;
  clerk: HealthStatus;
  vercelBlob: HealthStatus;
}

const healthLogger = createLogger("maintenance");

async function checkDatabase(): Promise<HealthStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "connected" };
  } catch (error) {
    healthLogger.error(
      "health.database_failed",
      "Database health check failed",
      {
        error,
      },
    );
    return { status: "error", message: "Database check failed" };
  }
}

async function checkOpenRouter(): Promise<HealthStatus> {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return { status: "error", message: "OpenRouter is not configured" };
    }

    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    return { status: "connected" };
  } catch (error) {
    healthLogger.error(
      "health.openrouter_failed",
      "OpenRouter health check failed",
      { error },
    );
    return { status: "error", message: "OpenRouter check failed" };
  }
}

async function checkClerk(): Promise<HealthStatus> {
  try {
    if (!process.env.CLERK_SECRET_KEY) {
      return { status: "error", message: "Clerk is not configured" };
    }

    await (await clerkClient()).users.getUserList({ limit: 1 });
    return { status: "connected" };
  } catch (error) {
    healthLogger.error("health.clerk_failed", "Clerk health check failed", {
      error,
    });
    return { status: "error", message: "Clerk check failed" };
  }
}

async function checkVercelBlob(): Promise<HealthStatus> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { status: "error", message: "Vercel Blob is not configured" };
  }

  let blobUrl: string | undefined;
  let status: HealthStatus = { status: "connected" };

  try {
    const result = await put(`health/${randomUUID()}.txt`, "test", {
      access: "public",
    });
    blobUrl = result.url;
  } catch (error) {
    healthLogger.error(
      "health.vercel_blob_failed",
      "Vercel Blob health check failed",
      { error },
    );
    status = { status: "error", message: "Vercel Blob check failed" };
  } finally {
    if (blobUrl) {
      try {
        await del(blobUrl);
      } catch (error) {
        healthLogger.error(
          "health.vercel_blob_cleanup_failed",
          "Vercel Blob health-check cleanup failed",
          { error },
        );
        status = {
          status: "error",
          message: "Vercel Blob cleanup failed",
        };
      }
    }
  }

  return status;
}

export async function GET() {
  const { errorResponse } = await requireAdmin();
  if (errorResponse) return errorResponse;

  const [database, openrouter, clerk, vercelBlob] = await Promise.all([
    checkDatabase(),
    checkOpenRouter(),
    checkClerk(),
    checkVercelBlob(),
  ]);

  return NextResponse.json({
    database,
    openrouter,
    clerk,
    vercelBlob,
  } satisfies HealthResponse);
}
