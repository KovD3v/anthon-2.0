"use client";

import { Separator as SeparatorPrimitive } from "@base-ui/react/separator";

import { cn } from "@/lib/utils";

type SeparatorProps = SeparatorPrimitive.Props & {
  decorative?: boolean;
};

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: SeparatorProps) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      role={decorative ? "presentation" : "separator"}
      className={cn(
        "shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:h-full data-vertical:w-px",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
