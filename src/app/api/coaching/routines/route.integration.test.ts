import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createRoutine,
  createRoutineAttempt,
  createUser,
  resetIntegrationDb,
  toAuthUser,
} from "@/test/integration/factories";

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAuthUser: mocks.getAuthUser,
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
}));

import { PATCH as saveOutcome } from "@/app/api/coaching/attempts/[attemptId]/route";
import { POST as createAttempt } from "@/app/api/coaching/routines/[routineId]/attempts/route";
import { PATCH as archiveRoutine } from "@/app/api/coaching/routines/[routineId]/route";

const clientActionId = "11111111-1111-4111-8111-111111111111";

function routineContext(routineId: string) {
  return { params: Promise.resolve({ routineId }) };
}

function attemptContext(attemptId: string) {
  return { params: Promise.resolve({ attemptId }) };
}

function jsonRequest(url: string, method: "POST" | "PATCH", body: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function waitUntilBlockedBy(blockerPid: number) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [{ blocked }] = await prisma.$queryRaw<Array<{ blocked: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE ${blockerPid} = ANY(pg_blocking_pids(pid))
      ) AS blocked
    `;
    if (blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Mutation did not block on the routine lifecycle row");
}

async function archiveWhileMutationWaits(
  routineId: string,
  startMutation: () => Promise<Response>,
) {
  const archivedAt = new Date("2026-08-08T10:00:00.000Z");
  let mutationPromise: Promise<Response> | undefined;

  await prisma.$transaction(async (tx) => {
    const [{ pid: archiveBackendPid }] = await tx.$queryRaw<
      Array<{ pid: number }>
    >`SELECT pg_backend_pid()::integer AS pid`;
    await tx.$queryRaw`
      SELECT "id"
      FROM "Routine"
      WHERE "id" = ${routineId}
      FOR UPDATE
    `;

    mutationPromise = startMutation();
    await waitUntilBlockedBy(archiveBackendPid);

    await tx.routine.update({
      where: { id: routineId },
      data: {
        status: "ARCHIVED",
        archivedAt,
        updatedAt: archivedAt,
      },
    });
  });

  if (!mutationPromise) throw new Error("Mutation did not start");
  return { response: await mutationPromise, archivedAt };
}

describe("integration coaching routine lifecycle serialization", () => {
  beforeEach(async () => {
    await resetIntegrationDb();
    mocks.getAuthUser.mockReset();
    mocks.revalidateTag.mockReset();

    const user = await createUser();
    mocks.getAuthUser.mockResolvedValue({
      user: { ...toAuthUser(user), isGuest: false },
      error: null,
    });
  });

  it("returns 409 and leaves no attempt when archive commits first", async () => {
    const user = await prisma.user.findFirstOrThrow();
    const routine = await createRoutine(user.id);

    const { response, archivedAt } = await archiveWhileMutationWaits(
      routine.id,
      () =>
        createAttempt(
          jsonRequest(
            `http://localhost/api/coaching/routines/${routine.id}/attempts`,
            "POST",
            { clientActionId },
          ),
          routineContext(routine.id),
        ),
    );

    expect(response.status).toBe(409);
    await expect(
      prisma.routineAttempt.count({ where: { routineId: routine.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.routine.findUniqueOrThrow({
        where: { id: routine.id },
        select: { status: true, archivedAt: true, updatedAt: true },
      }),
    ).resolves.toEqual({
      status: "ARCHIVED",
      archivedAt,
      updatedAt: archivedAt,
    });
  });

  it("returns 409 and leaves the outcome unchanged when archive commits first", async () => {
    const user = await prisma.user.findFirstOrThrow();
    const routine = await createRoutine(user.id);
    const attempt = await createRoutineAttempt(routine.id, {
      clientActionId,
      outcome: null,
      outcomeNote: null,
      outcomeRecordedAt: null,
    });

    const { response } = await archiveWhileMutationWaits(routine.id, () =>
      saveOutcome(
        jsonRequest(
          `http://localhost/api/coaching/attempts/${attempt.id}`,
          "PATCH",
          { outcome: "HELPFUL", outcomeNote: "Mi ha aiutato" },
        ),
        attemptContext(attempt.id),
      ),
    );

    expect(response.status).toBe(409);
    await expect(
      prisma.routineAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
        select: {
          outcome: true,
          outcomeNote: true,
          outcomeRecordedAt: true,
        },
      }),
    ).resolves.toEqual({
      outcome: null,
      outcomeNote: null,
      outcomeRecordedAt: null,
    });
  });

  it("does not touch the parent timestamp on a repeated attempt action", async () => {
    const user = await prisma.user.findFirstOrThrow();
    const routine = await createRoutine(user.id);
    const oldUpdatedAt = new Date("2026-08-01T08:00:00.000Z");
    await prisma.routine.update({
      where: { id: routine.id },
      data: { updatedAt: oldUpdatedAt },
    });
    const request = () =>
      jsonRequest(
        `http://localhost/api/coaching/routines/${routine.id}/attempts`,
        "POST",
        { clientActionId },
      );

    const first = await createAttempt(request(), routineContext(routine.id));
    const afterFirst = await prisma.routine.findUniqueOrThrow({
      where: { id: routine.id },
      select: { updatedAt: true },
    });
    const retry = await createAttempt(request(), routineContext(routine.id));
    const afterRetry = await prisma.routine.findUniqueOrThrow({
      where: { id: routine.id },
      select: { updatedAt: true },
    });

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(afterFirst.updatedAt.getTime()).toBeGreaterThan(
      oldUpdatedAt.getTime(),
    );
    expect(afterRetry.updatedAt).toEqual(afterFirst.updatedAt);
    await expect(
      prisma.routineAttempt.count({ where: { routineId: routine.id } }),
    ).resolves.toBe(1);
  });

  it("preserves archive timestamps when archive is retried", async () => {
    const user = await prisma.user.findFirstOrThrow();
    const routine = await createRoutine(user.id);
    const request = () =>
      jsonRequest(
        `http://localhost/api/coaching/routines/${routine.id}`,
        "PATCH",
        { status: "ARCHIVED" },
      );

    const first = await archiveRoutine(request(), routineContext(routine.id));
    const afterFirst = await prisma.routine.findUniqueOrThrow({
      where: { id: routine.id },
      select: { archivedAt: true, updatedAt: true },
    });
    const retry = await archiveRoutine(request(), routineContext(routine.id));
    const afterRetry = await prisma.routine.findUniqueOrThrow({
      where: { id: routine.id },
      select: { archivedAt: true, updatedAt: true },
    });

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(afterFirst.archivedAt).not.toBeNull();
    expect(afterRetry).toEqual(afterFirst);
  });
});
