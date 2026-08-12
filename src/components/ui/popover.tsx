"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import * as React from "react";

import { cn } from "@/lib/utils";

type ComposableProps<T> = T & { asChild?: boolean };

function Popover({ onOpenChange, ...props }: PopoverPrimitive.Root.Props) {
  return (
    <PopoverPrimitive.Root
      data-slot="popover"
      onOpenChange={(open) =>
        (onOpenChange as ((nextOpen: boolean) => void) | undefined)?.(open)
      }
      {...props}
    />
  );
}

function PopoverTrigger({
  asChild = false,
  children,
  render,
  ...props
}: ComposableProps<PopoverPrimitive.Trigger.Props>) {
  const composedRender =
    asChild && React.isValidElement(children) ? children : render;

  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      render={composedRender}
      {...props}
    >
      {asChild ? undefined : children}
    </PopoverPrimitive.Trigger>
  );
}

function PopoverContent({
  className,
  align = "center",
  side = "bottom",
  sideOffset = 4,
  alignOffset,
  children,
  ...props
}: PopoverPrimitive.Popup.Props & {
  align?: PopoverPrimitive.Positioner.Props["align"];
  side?: PopoverPrimitive.Positioner.Props["side"];
  sideOffset?: PopoverPrimitive.Positioner.Props["sideOffset"];
  alignOffset?: PopoverPrimitive.Positioner.Props["alignOffset"];
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className="z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "w-72 origin-(--transform-origin) scale-95 rounded-md border bg-popover p-4 text-popover-foreground opacity-0 shadow-md outline-hidden transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] data-[side=bottom]:-translate-y-1 data-[side=left]:translate-x-1 data-[side=right]:-translate-x-1 data-[side=top]:translate-y-1 data-open:translate-x-0 data-open:translate-y-0 data-open:scale-100 data-open:opacity-100 motion-reduce:transform-none motion-reduce:transition-opacity",
            className,
          )}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({ ...props }: React.ComponentPropsWithoutRef<"span">) {
  return <span data-slot="popover-anchor" {...props} />;
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-1 text-sm", className)}
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  );
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
};
