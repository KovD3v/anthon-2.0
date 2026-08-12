// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RagToolDiagnostics } from "./RagToolDiagnostics";

const diagnostics = {
  version: 1 as const,
  rag: {
    decision: "used" as const,
    query: "come dormire?",
    chunks: [
      {
        sequence: 1,
        documentTitle: "Routine",
        score: 0.91,
        text: '<script>alert("x")</script>',
      },
    ],
  },
  tools: [
    {
      sequence: 1,
      name: "searchRag",
      input: { query: "sonno" },
      output: { matches: 1 },
      status: "completed" as const,
      startOffsetMs: 25,
      durationMs: 35,
    },
  ],
  truncated: false,
};

describe("RagToolDiagnostics", () => {
  it("renders query, exact chunk text and tool input/output as text", () => {
    const { container } = render(
      <RagToolDiagnostics diagnostics={diagnostics} />,
    );

    expect(screen.getByText("Diagnostica RAG e tool")).toBeTruthy();
    expect(screen.getByText("come dormire?")).toBeTruthy();
    expect(screen.getByText('<script>alert("x")</script>')).toBeTruthy();
    expect(screen.getByText("searchRag")).toBeTruthy();
    expect(screen.getByText(/"query": "sonno"/)).toBeTruthy();
    expect(screen.getByText(/"matches": 1/)).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
  });

  it("copies the exact serialized value", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<RagToolDiagnostics diagnostics={diagnostics} />);

    await user.click(
      screen.getByRole("button", { name: "Copia input searchRag" }),
    );

    expect(writeText).toHaveBeenCalledWith('{\n  "query": "sonno"\n}');
  });
});
