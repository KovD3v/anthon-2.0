// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("framer-motion", async () => {
  const React = await import("react");
  const motionElement =
    (tag: string) =>
    ({
      children,
      initial,
      variants: _variants,
      animate: _animate,
      transition: _transition,
      ...props
    }: {
      children?: React.ReactNode;
      initial?: unknown;
      variants?: unknown;
      animate?: unknown;
      transition?: unknown;
      [key: string]: unknown;
    }) =>
      React.createElement(
        tag,
        {
          ...props,
          ...(initial !== undefined
            ? { "data-motion-initial": String(initial) }
            : {}),
        },
        children,
      );

  return {
    m: {
      div: motionElement("div"),
      h1: motionElement("h1"),
      p: motionElement("p"),
      span: motionElement("span"),
    },
  };
});

vi.mock("./AnthonScenarioDemo", () => ({
  AnthonScenarioDemo: () => <div data-testid="scenario-demo" />,
}));

import { Hero } from "./Hero";

describe("Hero", () => {
  it("keeps the primary heading renderable before motion hydration", () => {
    render(<Hero />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.getAttribute("data-motion-initial")).not.toBe("hidden");
  });
});
