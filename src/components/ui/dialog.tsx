"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
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

function Dialog({
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  ...props
}: DialogPrimitive.Root.Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const { captureReturnFocus, contextValue } = useBaseUIRootFocus(open);

  return (
    <BaseUIRootFocusContext.Provider value={contextValue}>
      <DialogPrimitive.Root
        data-slot="dialog"
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

function DialogTrigger({
  asChild = false,
  children,
  render,
  ...props
}: ComposableProps<DialogPrimitive.Trigger.Props>) {
  const composedRender =
    asChild && React.isValidElement(children) ? children : render;

  return (
    <DialogPrimitive.Trigger
      data-slot="dialog-trigger"
      render={composedRender}
      {...props}
    >
      {asChild ? undefined : children}
    </DialogPrimitive.Trigger>
  );
}

function DialogPortal(props: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  asChild = false,
  children,
  render,
  ...props
}: ComposableProps<DialogPrimitive.Close.Props>) {
  const composedRender =
    asChild && React.isValidElement(children) ? children : render;

  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      render={composedRender}
      {...props}
    >
      {asChild ? undefined : children}
    </DialogPrimitive.Close>
  );
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 opacity-0 transition-opacity duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] data-open:opacity-100 motion-reduce:duration-150 motion-reduce:transform-none",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onOpenAutoFocus,
  onCloseAutoFocus,
  initialFocus,
  finalFocus,
  onKeyDown,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  onOpenAutoFocus?: (event: AutoFocusEvent) => void;
  onCloseAutoFocus?: (event: AutoFocusEvent) => void;
}) {
  const rootFocus = React.useContext(BaseUIRootFocusContext);
  if (rootFocus) {
    rootFocus.closeHandlerRef.current = onCloseAutoFocus;
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 scale-95 gap-4 rounded-lg border bg-background p-6 opacity-0 shadow-lg outline-none transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] data-open:scale-100 data-open:opacity-100 motion-reduce:translate-x-[-50%] motion-reduce:translate-y-[-50%] motion-reduce:transform-none motion-reduce:transition-opacity motion-reduce:duration-150 sm:max-w-lg",
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
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
