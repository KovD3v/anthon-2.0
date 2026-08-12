"use client";

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import * as React from "react";

import {
  type AutoFocusEvent,
  BaseUIRootFocusContext,
  runAutoFocusHandler,
  trapTabKey,
  useBaseUIRootFocus,
} from "@/components/ui/base-ui-compat";
import { cn } from "@/lib/utils";

type ComposableProps<T> = T & { asChild?: boolean };

function Sheet({
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  ...props
}: SheetPrimitive.Root.Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const { captureReturnFocus, contextValue } = useBaseUIRootFocus(open);

  return (
    <BaseUIRootFocusContext.Provider value={contextValue}>
      <SheetPrimitive.Root
        data-slot="sheet"
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            captureReturnFocus();
          }
          if (controlledOpen === undefined) {
            setUncontrolledOpen(nextOpen);
          }
          (onOpenChange as ((value: boolean) => void) | undefined)?.(nextOpen);
        }}
        {...props}
      />
    </BaseUIRootFocusContext.Provider>
  );
}

function SheetTrigger({
  asChild = false,
  children,
  render,
  ...props
}: ComposableProps<SheetPrimitive.Trigger.Props>) {
  const composedRender =
    asChild && React.isValidElement(children) ? children : render;

  return (
    <SheetPrimitive.Trigger
      data-slot="sheet-trigger"
      render={composedRender}
      {...props}
    >
      {asChild ? undefined : children}
    </SheetPrimitive.Trigger>
  );
}

function SheetClose({
  asChild = false,
  children,
  render,
  ...props
}: ComposableProps<SheetPrimitive.Close.Props>) {
  const composedRender =
    asChild && React.isValidElement(children) ? children : render;

  return (
    <SheetPrimitive.Close
      data-slot="sheet-close"
      render={composedRender}
      {...props}
    >
      {asChild ? undefined : children}
    </SheetPrimitive.Close>
  );
}

function SheetPortal(props: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 opacity-0 transition-opacity duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] data-open:opacity-100 data-open:duration-250 motion-reduce:duration-150 motion-reduce:data-open:duration-150",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  closeLabel = "Close",
  showCloseButton = true,
  onOpenAutoFocus,
  onCloseAutoFocus,
  initialFocus,
  finalFocus,
  onKeyDown,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left";
  closeLabel?: string;
  showCloseButton?: boolean;
  onOpenAutoFocus?: (event: AutoFocusEvent) => void;
  onCloseAutoFocus?: (event: AutoFocusEvent) => void;
}) {
  const rootFocus = React.useContext(BaseUIRootFocusContext);
  if (rootFocus) {
    rootFocus.closeHandlerRef.current = onCloseAutoFocus;
  }

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-background shadow-lg transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] data-open:translate-x-0 data-open:translate-y-0 data-open:duration-250 motion-reduce:transform-none motion-reduce:opacity-0 motion-reduce:transition-opacity motion-reduce:data-open:opacity-100 motion-reduce:duration-150 motion-reduce:data-open:duration-150",
          side === "right" &&
            "inset-y-0 right-0 h-full w-3/4 translate-x-full border-l sm:max-w-sm",
          side === "left" &&
            "inset-y-0 left-0 h-full w-3/4 -translate-x-full border-r sm:max-w-sm",
          side === "top" && "inset-x-0 top-0 h-auto -translate-y-full border-b",
          side === "bottom" &&
            "inset-x-0 bottom-0 h-auto translate-y-full border-t",
          className,
        )}
        initialFocus={
          initialFocus ??
          (onOpenAutoFocus
            ? () => runAutoFocusHandler(onOpenAutoFocus)
            : undefined)
        }
        finalFocus={finalFocus ?? (onCloseAutoFocus ? false : undefined)}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (!event.defaultPrevented) {
            trapTabKey(event);
          }
        }}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
            <XIcon className="size-4" />
            <span className="sr-only">{closeLabel}</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
};
