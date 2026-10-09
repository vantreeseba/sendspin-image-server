import type * as React from "react";
import { cn } from "@/lib/utils";

const ORIENTATIONS = {
  horizontal: "h-px w-full",
  vertical: "h-full w-px",
} as const;

type SeparatorProps = Omit<React.ComponentPropsWithoutRef<"div">, "className" | "children"> & {
  className?: string | undefined;
  /** Which way the rule runs. `horizontal` divides stacked groups, `vertical` side-by-side ones. */
  orientation?: keyof typeof ORIENTATIONS | undefined;
  /**
   * Hidden from assistive tech, the default. `false` makes it a `role="separator"` a screen
   * reader announces — for a boundary nothing else on the screen says.
   */
  decorative?: boolean | undefined;
};

/** A one-pixel rule between groups, horizontal or vertical. */
function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: SeparatorProps) {
  return (
    <div
      data-slot="separator"
      {...(decorative
        ? ({ "aria-hidden": true } as const)
        : ({
            role: "separator",
            // Radix's: said only when it is not the default. React Native has no such prop and
            // ignores it; react-native-web and the compiled half write it.
            "aria-orientation": orientation === "vertical" ? "vertical" : undefined,
          } as const))}
      data-orientation={orientation}
      className={cn(
        "cube-rn-view",
        "shrink-0 bg-foreground/10",
        ORIENTATIONS[orientation],
        className,
      )}
      {...(props as React.ComponentPropsWithoutRef<"div">)}
    />
  );
}

export type { SeparatorProps };
export { Separator };
