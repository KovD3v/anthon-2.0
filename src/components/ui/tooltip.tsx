"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import * as React from "react";

import { cn } from "@/lib/utils";

type ComposableProps<T> = T & { asChild?: boolean };

function TooltipProvider({
  delayDuration = 0,
  ...props
}: TooltipPrimitive.Provider.Props & { delayDuration?: number }) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delayDuration}
      {...props}
    />
  );
}

function Tooltip({ onOpenChange, ...props }: TooltipPrimitive.Root.Props) {
  return (
    <TooltipPrimitive.Root
      data-slot="tooltip"
      onOpenChange={(open) =>
        (onOpenChange as ((nextOpen: boolean) => void) | undefined)?.(open)
      }
      {...props}
    />
  );
}

function TooltipTrigger({
  asChild = false,
  children,
  render,
  ...props
}: ComposableProps<TooltipPrimitive.Trigger.Props>) {
  const composedRender =
    asChild && React.isValidElement(children) ? children : render;

  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      render={composedRender}
      {...props}
    >
      {asChild ? undefined : children}
    </TooltipPrimitive.Trigger>
  );
}

function TooltipContent({
  className,
  sideOffset = 0,
  side = "top",
  align = "center",
  children,
  ...props
}: TooltipPrimitive.Popup.Props & {
  align?: TooltipPrimitive.Positioner.Props["align"];
  side?: TooltipPrimitive.Positioner.Props["side"];
  sideOffset?: TooltipPrimitive.Positioner.Props["sideOffset"];
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        className="z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "w-fit origin-(--transform-origin) scale-95 rounded-md bg-foreground px-3 py-1.5 text-xs text-balance text-background opacity-0 transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] data-[side=bottom]:-translate-y-1 data-[side=left]:translate-x-1 data-[side=right]:-translate-x-1 data-[side=top]:translate-y-1 data-open:translate-x-0 data-open:translate-y-0 data-open:scale-100 data-open:opacity-100 motion-reduce:transform-none motion-reduce:transition-opacity",
            className,
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
