import { clerkClient } from "@clerk/nextjs/server";
import { del, put } from "@vercel/blob";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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

async function checkDatabase(): Promise<HealthStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "connected" };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Database connection failed",
    };
  }
}

async function checkOpenRouter(): Promise<HealthStatus> {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return { status: "error", message: "OPENROUTER_API_KEY not configured" };
    }

    // Make a direct API call to check if key works
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
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "OpenRouter API check failed",
    };
  }
}

async function checkClerk(): Promise<HealthStatus> {
  try {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      return { status: "error", message: "CLERK_SECRET_KEY not configured" };
    }

    await (await clerkClient()).users.getUserList({ limit: 1 });
    return { status: "connected" };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Clerk API check failed",
    };
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

    const testContent = "test";
    const { url } = await put("health-check-test.txt", testContent, {
      access: "public",
    });
    await del(url);

    return { status: "connected" };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Vercel Blob check failed",
    };
  }
}

export async function GET(
  _request: NextRequest,
): Promise<NextResponse<HealthResponse>> {
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
  });
}
