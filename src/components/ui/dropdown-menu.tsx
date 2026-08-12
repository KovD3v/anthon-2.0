"use client";

import { Menu as DropdownMenuPrimitive } from "@base-ui/react/menu";
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

type ComposableProps<T> = T & { asChild?: boolean };

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DropdownMenuContext =
  React.createContext<DropdownMenuContextValue | null>(null);

type PositionProps = Pick<
  DropdownMenuPrimitive.Positioner.Props,
  | "align"
  | "alignOffset"
  | "collisionBoundary"
  | "collisionPadding"
  | "side"
  | "sideOffset"
  | "sticky"
>;

function DropdownMenu({
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  ...props
}: DropdownMenuPrimitive.Root.Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setUncontrolledOpen(nextOpen);
      }
      (onOpenChange as ((value: boolean) => void) | undefined)?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );
  const contextValue = React.useMemo(
    () => ({ open, setOpen }),
    [open, setOpen],
  );

  return (
    <DropdownMenuContext.Provider value={contextValue}>
      <DropdownMenuPrimitive.Root
        data-slot="dropdown-menu"
        open={open}
        onOpenChange={(nextOpen) => setOpen(nextOpen)}
        {...props}
      />
    </DropdownMenuContext.Provider>
  );
}

function DropdownMenuPortal(props: DropdownMenuPrimitive.Portal.Props) {
  return (
    <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
  );
}

function DropdownMenuTrigger({
  asChild = false,
  children,
  render,
  onClick,
  onMouseDown,
  ...props
}: ComposableProps<DropdownMenuPrimitive.Trigger.Props>) {
  const context = React.useContext(DropdownMenuContext);
  const composedRender =
    asChild && React.isValidElement(children) ? children : render;

  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      render={composedRender}
      onMouseDown={(event) => {
        onMouseDown?.(event);
        event.preventBaseUIHandler();
      }}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          context?.setOpen(!context.open);
        }
      }}
      {...props}
    >
      {asChild ? undefined : children}
    </DropdownMenuPrimitive.Trigger>
  );
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  align,
  alignOffset,
  collisionBoundary,
  collisionPadding,
  side,
  sticky,
  ...props
}: DropdownMenuPrimitive.Popup.Props & PositionProps) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Positioner
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        collisionBoundary={collisionBoundary}
        collisionPadding={collisionPadding}
        side={side}
        sticky={sticky}
        className="z-50"
      >
        <DropdownMenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "max-h-(--available-height) min-w-32 origin-(--transform-origin) scale-95 overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground opacity-0 shadow-md transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] data-[side=bottom]:-translate-y-1 data-[side=left]:translate-x-1 data-[side=right]:-translate-x-1 data-[side=top]:translate-y-1 data-open:translate-x-0 data-open:translate-y-0 data-open:scale-100 data-open:opacity-100 motion-reduce:transform-none motion-reduce:transition-opacity",
            className,
          )}
          {...props}
        />
      </DropdownMenuPrimitive.Positioner>
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuGroup(props: DropdownMenuPrimitive.Group.Props) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  );
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  onSelect,
  onClick,
  ...props
}: DropdownMenuPrimitive.Item.Props & {
  inset?: boolean;
  variant?: "default" | "destructive";
  onSelect?: (event: Event) => void;
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[inset]:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive/10 data-[variant=destructive]:data-highlighted:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 dark:data-[variant=destructive]:data-highlighted:bg-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground data-[variant=destructive]:*:[svg]:text-destructive!",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        onSelect?.(event.nativeEvent);
        if (event.nativeEvent.defaultPrevented) {
          event.preventBaseUIHandler();
        }
      }}
      {...props}
    />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  onCheckedChange,
  ...props
}: DropdownMenuPrimitive.CheckboxItem.Props) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      checked={checked}
      onCheckedChange={(nextChecked) =>
        (onCheckedChange as ((value: boolean) => void) | undefined)?.(
          nextChecked,
        )
      }
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.CheckboxItemIndicator>
          <CheckIcon className="size-4" />
        </DropdownMenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({
  onValueChange,
  ...props
}: DropdownMenuPrimitive.RadioGroup.Props) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      onValueChange={(value) =>
        (onValueChange as ((nextValue: unknown) => void) | undefined)?.(value)
      }
      {...props}
    />
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: DropdownMenuPrimitive.RadioItem.Props) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.RadioItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </DropdownMenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: DropdownMenuPrimitive.GroupLabel.Props & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-2 py-1.5 text-sm font-medium data-[inset]:pl-8",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: DropdownMenuPrimitive.Separator.Props) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSub({
  onOpenChange,
  ...props
}: DropdownMenuPrimitive.SubmenuRoot.Props) {
  return (
    <DropdownMenuPrimitive.SubmenuRoot
      data-slot="dropdown-menu-sub"
      onOpenChange={(open) =>
        (onOpenChange as ((nextOpen: boolean) => void) | undefined)?.(open)
      }
      {...props}
    />
  );
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: DropdownMenuPrimitive.SubmenuTrigger.Props & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </DropdownMenuPrimitive.SubmenuTrigger>
  );
}

function DropdownMenuSubContent({
  className,
  sideOffset = 4,
  align,
  alignOffset,
  collisionBoundary,
  collisionPadding,
  side,
  sticky,
  ...props
}: DropdownMenuPrimitive.Popup.Props & PositionProps) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Positioner
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        collisionBoundary={collisionBoundary}
        collisionPadding={collisionPadding}
        side={side}
        sticky={sticky}
        className="z-50"
      >
        <DropdownMenuPrimitive.Popup
          data-slot="dropdown-menu-sub-content"
          className={cn(
            "min-w-32 origin-(--transform-origin) scale-95 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground opacity-0 shadow-lg transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] data-[side=bottom]:-translate-y-1 data-[side=left]:translate-x-1 data-[side=right]:-translate-x-1 data-[side=top]:translate-y-1 data-open:translate-x-0 data-open:translate-y-0 data-open:scale-100 data-open:opacity-100 motion-reduce:transform-none motion-reduce:transition-opacity",
            className,
          )}
          {...props}
        />
      </DropdownMenuPrimitive.Positioner>
    </DropdownMenuPrimitive.Portal>
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
