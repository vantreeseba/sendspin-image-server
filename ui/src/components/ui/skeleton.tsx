import type * as React from "react";
import { skeletonClass } from "@/components/ui/skeleton-base";
import { cn } from "@/lib/utils";

type SkeletonProps = React.ComponentProps<"div">;

/** A pulsing block standing in for content that has not arrived. */
function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse", skeletonClass, className)}
      {...props}
    />
  );
}

export type { SkeletonProps };
export { Skeleton };
