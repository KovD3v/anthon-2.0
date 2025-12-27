import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publishToQueue } from "@/lib/qstash";

export async function GET(request: NextRequest) {
  // 1. Validate Cron Secret (Native Vercel Cron security)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const jobType = searchParams.get("job") || "all";

  try {
    // 2. Fetch eligible users (exclude guests based on policy)
    // We process in batches to avoid memory issues, but assuming <10k users for MVP, select id is fine.
    const users = await prisma.user.findMany({
      where: {
        isGuest: false, // Explicitly exclude guests from maintenance
        deletedAt: null,
      },
      select: { id: true },
    });

    console.log(`[Cron] Triggering '${jobType}' for ${users.length} users`);

    // 3. Publish jobs to QStash
    const results = await Promise.allSettled(
      users.map(async (user) => {
        const promises = [];

        // Consolidate Memories (Daily)
        console.log(`[Cron] jobType=${jobType} user=${user.id}`);
        if (jobType === "all" || jobType === "consolidate") {
          promises.push(
            publishToQueue("api/queues/consolidate", {
              userId: user.id,
            }),
          );
        }

        // Archive Sessions (Daily)
        if (jobType === "all" || jobType === "archive") {
          promises.push(
            publishToQueue("api/queues/archive", {
              userId: user.id,
            }),
          );
        }

        // Analyze Profile (Weekly)
        // Usually triggered separately via cron schedule ?job=analyze
        if (jobType === "analyze") {
          promises.push(
            publishToQueue("api/queues/analyze", {
              userId: user.id,
            }),
          );
        }

        return Promise.all(promises);
      }),
    );

    let totalJobsPublished = 0;
    const _successCount = results.filter((r) => {
      if (r.status === "fulfilled") {
        totalJobsPublished += r.value.length;
        return true;
      }
      return false;
    }).length;

    // Log any failures
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.error(`[Cron] Failed for user ${users[i].id}:`, r.reason);
      }
    });

    return NextResponse.json({
      success: true,
      usersProcessed: users.length,
      jobsPublished: totalJobsPublished,
    });
  } catch (error) {
    console.error("[Cron] Error triggering maintenance:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
