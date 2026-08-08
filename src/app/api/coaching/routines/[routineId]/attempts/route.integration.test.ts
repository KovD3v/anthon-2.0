import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createRoutine,
  createRoutineAttempt,
  createUser,
  resetIntegrationDb,
  toAuthUser,
} from "@/test/integration/factories";

const mocks = vi.hoisted(() => ({ getAuthUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

import { GET } from "./route";

function context(routineId: string) {
  return { params: Promise.resolve({ routineId }) };
}

describe("integration routine attempt history", () => {
  beforeEach(async () => {
    await resetIntegrationDb();
    mocks.getAuthUser.mockReset();
    const user = await createUser();
    mocks.getAuthUser.mockResolvedValue({
      user: { ...toAuthUser(user), isGuest: false },
      error: null,
    });
  });

  it("returns only the owner's newest-first attempts and an opaque cursor", async () => {
    const user = await prisma.user.findFirstOrThrow();
    const routine = await createRoutine(user.id);
    const earlier = await createRoutineAttempt(routine.id, {
      clientActionId: "11111111-1111-4111-8111-111111111111",
      outcome: "PARTIALLY_HELPFUL",
      outcomeNote: "Prima nota privata",
      outcomeRecordedAt: new Date("2026-08-01T09:00:00.000Z"),
    });
    const later = await createRoutineAttempt(routine.id, {
      clientActionId: "22222222-2222-4222-8222-222222222222",
      outcome: "HELPFUL",
      outcomeNote: "Seconda nota privata",
      outcomeRecordedAt: new Date("2026-08-02T09:00:00.000Z"),
    });
    await prisma.routineAttempt.update({
      where: { id: earlier.id },
      data: { attemptedAt: new Date("2026-08-01T09:00:00.000Z") },
    });
    await prisma.routineAttempt.update({
      where: { id: later.id },
      data: { attemptedAt: new Date("2026-08-02T09:00:00.000Z") },
    });

    const response = await GET(
      new Request(
        `http://localhost/api/coaching/routines/${routine.id}/attempts?limit=1`,
      ),
      context(routine.id),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      attempts: [
        {
          id: later.id,
          outcome: "HELPFUL",
          outcomeNote: "Seconda nota privata",
        },
      ],
      nextCursor: expect.any(String),
    });
  });

  it("does not reveal attempts for another owner's routine", async () => {
    const other = await createUser();
    const foreignRoutine = await createRoutine(other.id);
    await createRoutineAttempt(foreignRoutine.id, {
      clientActionId: "11111111-1111-4111-8111-111111111111",
      outcome: "HELPFUL",
      outcomeNote: "Privato",
      outcomeRecordedAt: new Date(),
    });

    const response = await GET(
      new Request(
        `http://localhost/api/coaching/routines/${foreignRoutine.id}/attempts`,
      ),
      context(foreignRoutine.id),
    );

    expect(response.status).toBe(404);
  });
});
