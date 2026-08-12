// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./accordion";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Slider } from "./slider";
import { Switch } from "./switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
});

afterEach(cleanup);

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("UI primitive compatibility", () => {
  it("keeps Button asChild link semantics", () => {
    render(
      <Button asChild>
        <a href="/profilo">Apri profilo</a>
      </Button>,
    );

    const link = screen.getByRole("link", { name: "Apri profilo" });
    expect(link.getAttribute("href")).toBe("/profilo");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps native form submit semantics", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <Button>Salva</Button>
      </form>,
    );

    await user.click(screen.getByRole("button", { name: "Salva" }));

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("reports checkbox and switch state changes", async () => {
    const user = userEvent.setup();
    const onCheckboxChange = vi.fn();
    const onSwitchChange = vi.fn();

    render(
      <>
        <Checkbox aria-label="Memoria" onCheckedChange={onCheckboxChange} />
        <Switch aria-label="Tema scuro" onCheckedChange={onSwitchChange} />
      </>,
    );

    await user.click(screen.getByRole("checkbox", { name: "Memoria" }));
    await user.click(screen.getByRole("switch", { name: "Tema scuro" }));

    expect(onCheckboxChange).toHaveBeenLastCalledWith(true);
    expect(onSwitchChange).toHaveBeenLastCalledWith(true);
  });

  it("updates a slider from the keyboard", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Slider
        aria-label="Volume"
        defaultValue={[50]}
        onValueChange={onValueChange}
      />,
    );

    const slider = document.querySelector<HTMLInputElement>(
      'input[type="range"][aria-label="Volume"]',
    );
    expect(slider).not.toBeNull();
    if (!slider) {
      throw new Error("Slider input not found");
    }
    slider.focus();
    await user.keyboard("{ArrowRight}");

    expect(onValueChange).toHaveBeenLastCalledWith([51]);
  });

  it("selects the next tab with the keyboard", async () => {
    const user = userEvent.setup();

    render(
      <Tabs defaultValue="profilo">
        <TabsList aria-label="Impostazioni">
          <TabsTrigger value="profilo">Profilo</TabsTrigger>
          <TabsTrigger value="voce">Voce</TabsTrigger>
        </TabsList>
        <TabsContent value="profilo">Contenuto profilo</TabsContent>
        <TabsContent value="voce">Contenuto voce</TabsContent>
      </Tabs>,
    );

    const profileTab = screen.getByRole("tab", { name: "Profilo" });
    profileTab.focus();
    await user.keyboard("{ArrowRight}");

    expect(
      screen.getByRole("tab", { name: "Voce" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toBe("Contenuto voce");
  });

  it("expands accordion content", async () => {
    const user = userEvent.setup();

    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="memoria">
          <AccordionTrigger>Memoria</AccordionTrigger>
          <AccordionContent>Dettagli memoria</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );

    const trigger = screen.getByRole("button", { name: "Memoria" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    await user.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Dettagli memoria")).toBeTruthy();
  });
});
