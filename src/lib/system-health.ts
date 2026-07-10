import { clerkClient } from "@clerk/nextjs/server";
import { list } from "@vercel/blob";
import { prisma } from "@/lib/db";

export interface HealthStatus {
  status: "connected" | "error";
  message?: string;
}

export interface SystemHealth {
  database: HealthStatus;
  openrouter: HealthStatus;
  clerk: HealthStatus;
  vercelBlob: HealthStatus;
}

async function checkDatabase(): Promise<HealthStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "connected" };
  } catch {
    return { status: "error", message: "Database check failed" };
  }
}

async function checkOpenRouter(): Promise<HealthStatus> {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return { status: "error", message: "OPENROUTER_API_KEY not configured" };
    }

    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) throw new Error(`API returned ${response.status}`);
    return { status: "connected" };
  } catch {
    return { status: "error", message: "OpenRouter check failed" };
  }
}

async function checkClerk(): Promise<HealthStatus> {
  try {
    if (!process.env.CLERK_SECRET_KEY) {
      return { status: "error", message: "CLERK_SECRET_KEY not configured" };
    }

    await (await clerkClient()).users.getUserList({ limit: 1 });
    return { status: "connected" };
  } catch {
    return { status: "error", message: "Clerk check failed" };
  }
}

async function checkVercelBlob(): Promise<HealthStatus> {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return {
        status: "error",
        message: "BLOB_READ_WRITE_TOKEN not configured",
      };
    }

    await list({ limit: 1, token });
    return { status: "connected" };
  } catch {
    return { status: "error", message: "Vercel Blob check failed" };
  }
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const [database, openrouter, clerk, vercelBlob] = await Promise.all([
    checkDatabase(),
    checkOpenRouter(),
    checkClerk(),
    checkVercelBlob(),
  ]);

  return { database, openrouter, clerk, vercelBlob };
}
