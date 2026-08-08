import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchActiveRoutineForReturn,
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
    expect(fetchMock).toHaveBeenCalledWith("/api/coaching/routines", {
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    });
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
});
