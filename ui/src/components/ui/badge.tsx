import { Slot } from "radix-ui";
import type * as React from "react";
import {
  type BadgeProps,
  type BadgeVariant,
  badgeContainerVariants,
  badgeHasLabel,
  badgeIconClass,
  badgeRemoveLabel,
  badgeTextFallback,
  badgeTextVariants,
  badgeVariants,
} from "@/components/ui/badge-base";
import { cn } from "@/lib/utils";
import { X } from "@/components/ui/icons";

export type { BadgeProps, BadgeVariant };

/** A small pill naming a kind or a state, or a dot of the same colour when it has no children. */
export function Badge({
  variant = "default",
  backgroundColor,
  textColor,
  className,
  label,
  onRemove,
  removeLabel,
  asChild = false,
  style,
  children,
  ...props
}: BadgeProps &
  Omit<React.ComponentProps<"span">, keyof BadgeProps> & {
    /** Render the single child with the badge's classes instead of a `<span>`. */
    asChild?: boolean | undefined;
  }) {
  const shape = asChild || badgeHasLabel(children) ? "pill" : "dot";
  const Comp = asChild ? Slot.Root : "span";
  const dotName = label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);

  const pill =
    shape === "pill" ? (
      <>
        {children}
        {onRemove ? (
          <button
            type="button"
            aria-label={removeLabel ?? badgeRemoveLabel(children, label)}
            className="-my-1 -mr-1.5 -ml-1 inline-flex cursor-pointer items-center justify-center rounded-full p-1 text-inherit outline-none hover:opacity-75 focus-visible:opacity-75"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            // The keys that press it, stopped too, so a badge's own `onKeyDown` does not act on them.
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.stopPropagation();
              }
            }}
          >
            <X className={badgeIconClass} aria-hidden />
          </button>
        ) : null}
      </>
    ) : null;

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(
        "inline-flex w-fit overflow-hidden whitespace-nowrap transition-colors focus-visible:outline-none [&>svg]:pointer-events-none [&>svg]:size-3",
        badgeContainerVariants({ variant, shape }),
        shape === "pill" && (backgroundColor ? badgeTextFallback : badgeTextVariants({ variant })),
        variant === "link" && "[a&]:hover:underline [a&]:focus-visible:underline",
        className,
      )}
      style={{
        ...(backgroundColor ? { backgroundColor } : {}),
        ...(textColor ? { color: textColor } : {}),
        ...style,
      }}
      // A dot carries meaning and no text, so it is named or it is decoration;
      // the same split `color-dot` makes, for the same reason.
      {...(shape === "dot" ? dotName : {})}
      {...props}
    >
      {/* `asChild` renders `children` and nothing beside it. `Slot` counts every child
          expression, a `null` included, so a second slot here — even one that is always
          empty under `asChild` — made it throw "failed to slot onto its children" (#152). */}
      {asChild ? children : pill}
    </Comp>
  );
}

export { badgeVariants };
