import * as React from "react";
import { IconClassContext } from "@/components/ui/icons-base";
import { cn } from "@/lib/utils";

// `className` is re-declared rather than inherited: nativewind types it as `className?: string`,
// which under `exactOptionalPropertyTypes` rejects the `cond ? "x" : undefined` call sites pass.
type ViewProps = Omit<React.ComponentPropsWithoutRef<"div">, "className"> & {
  className?: string | undefined;
};
type TextProps = Omit<React.ComponentPropsWithoutRef<"span">, "className"> & {
  className?: string | undefined;
};

/** The root of an empty state: a centred column. */
const Empty = React.forwardRef<HTMLDivElement, ViewProps>(({ className, ...props }, ref) => (
  <div
    ref={ref as React.Ref<HTMLDivElement>}
    data-slot="empty"
    className={cn(
      "cube-rn-view",
      "w-full min-w-0 items-center justify-center gap-3 rounded-lg border-dashed border-foreground/10 py-10",
      className,
    )}
    {...(props as React.ComponentPropsWithoutRef<"div">)}
  />
));
Empty.displayName = "Empty";

/** The block holding the media, the title and the description. */
const EmptyHeader = React.forwardRef<HTMLDivElement, ViewProps>(({ className, ...props }, ref) => (
  <div
    ref={ref as React.Ref<HTMLDivElement>}
    data-slot="empty-header"
    className={cn("cube-rn-view", "items-center", className)}
    {...(props as React.ComponentPropsWithoutRef<"div">)}
  />
));
EmptyHeader.displayName = "EmptyHeader";

/** How `EmptyMedia` is drawn: as given, or as an icon in a muted bubble. */
export type EmptyMediaVariant = "default" | "icon";

/** `icon` is the muted bubble `EmptyState` draws; `default` is a bare box for an avatar or image. */
const EMPTY_MEDIA = {
  default: "",
  icon: "rounded-full bg-foreground/10 p-3 text-foreground/60 [&_svg:not([class*='size-'])]:size-6",
} satisfies Record<EmptyMediaVariant, string>;

type EmptyMediaProps = ViewProps & {
  /** `icon` draws the child glyph in a muted bubble, sized and inked; `default` leaves it alone. */
  variant?: EmptyMediaVariant | null | undefined;
};

/** The icon or image above the title. */
const EmptyMedia = React.forwardRef<HTMLDivElement, EmptyMediaProps>(
  ({ className, variant, children, ...props }, ref) => {
    const box = cn(
      "mb-3 shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
      EMPTY_MEDIA[variant ?? "default"],
      className,
    );
    if (variant === "icon") {
      return (
        <div
          ref={ref as React.Ref<HTMLDivElement>}
          data-slot="empty-icon"
          className={cn("cube-rn-view", box)}
          {...(props as React.ComponentPropsWithoutRef<"div">)}
        >
          <IconClassContext.Provider value="h-6 w-6 text-foreground/60">
            {children}
          </IconClassContext.Provider>
        </div>
      );
    }
    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        data-slot="empty-icon"
        className={cn("cube-rn-view", box)}
        {...(props as React.ComponentPropsWithoutRef<"div">)}
      >
        {children}
      </div>
    );
  },
);
EmptyMedia.displayName = "EmptyMedia";

/** What is missing, in a few words. */
const EmptyTitle = React.forwardRef<HTMLSpanElement, TextProps>(({ className, ...props }, ref) => (
  <span
    ref={ref as React.Ref<HTMLSpanElement>}
    data-slot="empty-title"
    className={cn("cube-rn-text", "font-medium text-sm text-foreground", className)}
    {...(props as React.ComponentPropsWithoutRef<"span">)}
  />
));
EmptyTitle.displayName = "EmptyTitle";

/** The muted line under the title, saying what to do about it. */
const EmptyDescription = React.forwardRef<HTMLSpanElement, TextProps>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref as React.Ref<HTMLSpanElement>}
      data-slot="empty-description"
      className={cn(
        "cube-rn-text",
        "text-center text-sm text-foreground/60 [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-info",
        className,
      )}
      {...(props as React.ComponentPropsWithoutRef<"span">)}
    />
  ),
);
EmptyDescription.displayName = "EmptyDescription";

/** What to do about it: a button or two, under the words. */
const EmptyContent = React.forwardRef<HTMLDivElement, ViewProps>(({ className, ...props }, ref) => (
  <div
    ref={ref as React.Ref<HTMLDivElement>}
    data-slot="empty-content"
    className={cn("cube-rn-view", "w-full min-w-0 max-w-sm items-center gap-3", className)}
    {...(props as React.ComponentPropsWithoutRef<"div">)}
  />
));
EmptyContent.displayName = "EmptyContent";

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle };
