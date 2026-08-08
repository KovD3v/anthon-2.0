import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchActiveRoutineForReturn,
  fetchRoutineCollection,
  RoutineClientError,
} from "./routine-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchActiveRoutineForReturn", () => {
  it("accepts the exact card-safe active selector response", async () => {
    const routine = {
      id: "routine-1",
      sourceChatId: null,
      sourceAssistantMessageId: null,
      status: "ACTIVE",
      formatVersion: 1,
      proposal: {
        title: "Reset rapido",
        trigger: "Dopo un errore",
        durationLabel: null,
        steps: ["Fermati", "Espira"],
        completionCue: "Riparti",
      },
      archivedAt: null,
      latestAttempt: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ routine }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchActiveRoutineForReturn()).resolves.toEqual(routine);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/coaching/routines?mode=return",
      {
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      },
    );
  });

  it("accepts an authoritative empty selector", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ routine: null }), { status: 200 }),
        ),
    );

    await expect(fetchActiveRoutineForReturn()).resolves.toBeNull();
  });

  it("rejects a malformed selector instead of clearing persistent state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ routine: { id: "unsafe" } }), {
          status: 200,
        }),
      ),
    );

    await expect(fetchActiveRoutineForReturn()).rejects.toEqual(
      new RoutineClientError("Risposta del server non valida. Riprova.", 200),
    );
  });

  it("fetches a strict paginated routine collection", async () => {
    const payload = {
      routines: [],
      total: 0,
      nextCursor: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchRoutineCollection({ status: "ARCHIVED", cursor: "abc", limit: 2 }),
    ).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/coaching/routines?mode=collection&status=ARCHIVED&cursor=abc&limit=2",
      { cache: "no-store", headers: { "Content-Type": "application/json" } },
    );
  });

  it("uses RoutineClientError for collection status and schema failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 503 })),
    );
    await expect(fetchRoutineCollection({ status: "ACTIVE" })).rejects.toEqual(
      new RoutineClientError("Operazione non riuscita. Riprova.", 503),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ routines: [{ unsafe: true }] }), {
          status: 200,
        }),
      ),
    );
    await expect(fetchRoutineCollection({ status: "ACTIVE" })).rejects.toEqual(
      new RoutineClientError("Risposta del server non valida. Riprova.", 200),
    );
  });
});
