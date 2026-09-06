// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AiTracesPage from "./page";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  traceResponse: "success" as "success" | "expired",
}));

describe("AiTracesPage", () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.traceResponse = "success";
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.fetch.mockImplementation(
      async (input: string, init?: RequestInit) => {
        if (input === "/api/admin/ai-traces") {
          return {
            ok: true,
            json: async () => ({
              traces: [
                {
                  id: "trace-1",
                  conversationThreadId: "thread-1",
                  userMessageId: "message-1",
                  assistantMessageId: "message-2",
                  status: "COMPLETE",
                  contentCaptureStatus: "captured",
                  expiresAt: "2026-09-08T10:00:00.000Z",
                  createdAt: "2026-09-07T10:00:00.000Z",
                },
              ],
            }),
          };
        }
        if (
          input === "/api/admin/ai-traces/trace-1" &&
          init?.method === "POST"
        ) {
          if (mocks.traceResponse === "expired") {
            return {
              ok: false,
              json: async () => ({ error: "Trace expired" }),
            };
          }
          return {
            ok: true,
            json: async () => ({
              trace: {
                id: "trace-1",
                payload: { text: "redacted" },
              },
            }),
          };
        }
        throw new Error(`Unexpected fetch: ${input}`);
      },
    );
  });

  it("requires purpose-bound fields and reads detail through POST", async () => {
    const user = userEvent.setup();
    render(<AiTracesPage />);

    const traceButton = await screen.findByRole("button", {
      name: /trace-1/i,
    });
    expect(screen.queryByRole("link", { name: /trace-1/i })).toBeNull();
    await user.click(traceButton);

    await user.type(screen.getByLabelText("ID caso o ticket"), "INC-123");
    await user.type(
      screen.getByLabelText("Motivazione scritta"),
      "Investigate provider failure",
    );
    await user.click(screen.getByRole("button", { name: "Leggi contenuto" }));

    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/api/admin/ai-traces/trace-1",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            purpose: "DEBUGGING",
            reason: "Investigate provider failure",
            caseId: "INC-123",
          }),
        }),
      ),
    );
    expect(await screen.findByText(/"redacted"/)).toBeTruthy();
  });

  it("keeps the read action disabled until case and reason are provided", async () => {
    const user = userEvent.setup();
    render(<AiTracesPage />);
    await user.click(await screen.findByRole("button", { name: /trace-1/i }));

    expect(
      screen.getByRole("button", { name: "Leggi contenuto" }),
    ).toHaveProperty("disabled", true);
    expect(
      mocks.fetch.mock.calls.filter(
        ([input, init]) =>
          input === "/api/admin/ai-traces/trace-1" && init?.method === "POST",
      ),
    ).toHaveLength(0);
  });

  it("localizes an expired trace error", async () => {
    mocks.traceResponse = "expired";
    const user = userEvent.setup();
    render(<AiTracesPage />);
    await user.click(await screen.findByRole("button", { name: /trace-1/i }));

    await user.type(screen.getByLabelText("ID caso o ticket"), "INC-123");
    await user.type(
      screen.getByLabelText("Motivazione scritta"),
      "Investigate provider failure",
    );
    await user.click(screen.getByRole("button", { name: "Leggi contenuto" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Il trace è scaduto.",
    );
  });
});
