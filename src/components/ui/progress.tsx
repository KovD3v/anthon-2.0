"use client";

import { Progress as ProgressPrimitive } from "@base-ui/react/progress";

import { cn } from "@/lib/utils";

function Progress({
  className,
  value,
  ...props
}: ProgressPrimitive.Root.Props) {
  const normalizedValue = Math.max(0, Math.min(100, value ?? 0));

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={normalizedValue}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Track className="size-full">
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className="h-full w-full origin-left bg-primary transition-transform duration-200 ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none"
          style={{ transform: `scaleX(${normalizedValue / 100})` }}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
}

export { Progress };
