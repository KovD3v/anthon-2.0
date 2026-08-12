"use client";

import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type AccordionBaseProps = Omit<
  AccordionPrimitive.Root.Props<string>,
  "value" | "defaultValue" | "onValueChange" | "multiple"
>;

type AccordionProps = AccordionBaseProps &
  (
    | {
        type: "single";
        value?: string;
        defaultValue?: string;
        onValueChange?: (value: string) => void;
        collapsible?: boolean;
      }
    | {
        type: "multiple";
        value?: string[];
        defaultValue?: string[];
        onValueChange?: (value: string[]) => void;
        collapsible?: never;
      }
  );

function Accordion(props: AccordionProps) {
  if (props.type === "multiple") {
    const { type: _type, collapsible: _collapsible, ...multipleProps } = props;
    return (
      <AccordionPrimitive.Root
        data-slot="accordion"
        multiple
        {...multipleProps}
      />
    );
  }

  const {
    type: _type,
    collapsible: _collapsible,
    value,
    defaultValue,
    onValueChange,
    ...singleProps
  } = props;

  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      value={value === undefined ? undefined : value ? [value] : []}
      defaultValue={
        defaultValue === undefined
          ? undefined
          : defaultValue
            ? [defaultValue]
            : []
      }
      onValueChange={
        onValueChange ? (values) => onValueChange(values[0] ?? "") : undefined
      }
      {...singleProps}
    />
  );
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group/accordion-trigger flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-[color,background-color,border-color,box-shadow] outline-none hover:underline focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon className="pointer-events-none size-4 shrink-0 translate-y-0.5 text-muted-foreground transition-transform duration-200 group-aria-expanded/accordion-trigger:rotate-180" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className="overflow-hidden text-sm data-closed:animate-accordion-up data-open:animate-accordion-down"
      {...props}
    >
      <div className={cn("pt-0 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Panel>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
