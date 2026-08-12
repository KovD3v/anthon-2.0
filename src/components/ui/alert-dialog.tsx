"use client";

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import * as React from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ComposableProps<T> = T & { asChild?: boolean };

function AlertDialog({
  onOpenChange,
  ...props
}: AlertDialogPrimitive.Root.Props) {
  return (
    <AlertDialogPrimitive.Root
      data-slot="alert-dialog"
      onOpenChange={(open) =>
        (onOpenChange as ((nextOpen: boolean) => void) | undefined)?.(open)
      }
      {...props}
    />
  );
}

function AlertDialogTrigger({
  asChild = false,
  children,
  render,
  ...props
}: ComposableProps<AlertDialogPrimitive.Trigger.Props>) {
  const composedRender =
    asChild && React.isValidElement(children) ? children : render;

  return (
    <AlertDialogPrimitive.Trigger
      data-slot="alert-dialog-trigger"
      render={composedRender}
      {...props}
    >
      {asChild ? undefined : children}
    </AlertDialogPrimitive.Trigger>
  );
}

function AlertDialogPortal(props: AlertDialogPrimitive.Portal.Props) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  );
}

function AlertDialogOverlay({
  className,
  ...props
}: AlertDialogPrimitive.Backdrop.Props) {
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 opacity-0 transition-opacity duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] data-open:opacity-100 motion-reduce:duration-150 motion-reduce:transform-none",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  ...props
}: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 scale-95 gap-4 rounded-lg border bg-background p-6 opacity-0 shadow-lg transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] data-open:scale-100 data-open:opacity-100 motion-reduce:translate-x-[-50%] motion-reduce:translate-y-[-50%] motion-reduce:transform-none motion-reduce:transition-opacity motion-reduce:duration-150 sm:max-w-lg",
          className,
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  ...props
}: AlertDialogPrimitive.Close.Props) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-action"
      className={cn(buttonVariants(), className)}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  ...props
}: AlertDialogPrimitive.Close.Props) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      className={cn(buttonVariants({ variant: "outline" }), className)}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
