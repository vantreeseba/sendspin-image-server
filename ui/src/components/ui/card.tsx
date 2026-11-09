import * as React from "react";
import { CardBodyContext, cn, HEADING_DESCRIPTION, HEADING_GAP, HEADING_TITLE } from "@/lib/utils";
import { ColorBar } from "@/components/ui/color-bar";

// `className` is re-declared rather than inherited: nativewind types it as
// `className?: string`, which under `exactOptionalPropertyTypes` rejects the
// conditional `cond ? 'x' : undefined` several call sites pass.
type ViewProps = Omit<React.ComponentPropsWithoutRef<"div">, "className"> & {
  className?: string | undefined;
};
type TextProps = Omit<React.ComponentPropsWithoutRef<"span">, "className"> & {
  className?: string | undefined;
};

type CardProps = ViewProps & {
  /** Renders a left-edge ColorBar along with the positioning it requires. */
  accentColor?: string | null | undefined;
  /** What the accent colour stands for, for anyone who cannot see it. */
  accentLabel?: string | undefined;
  /**
   * Makes the whole card a target. A card that takes this renders a
   * `Pressable` instead of a `View` — a `View` has no press handling on
   * native, and an `onClick` on a plain `div` is not reachable by keyboard.
   */
  onClick?: React.ComponentPropsWithoutRef<"button">["onClick"] | undefined;
};

/**
 * The card's surface: its edge, fill and ink. Exported for a component that is a card but must
 * render its own element, so it wears this rather than a copy of it that drifts.
 */
const CARD_SURFACE_CLASS = "rounded-lg border border-foreground/10 bg-secondary text-foreground";

/**
 * What a pressable card adds: it looks hovered under the pointer, focused and pressed, and draws
 * no ring. On the web a compiled `Pressable` is a `<button>`, which centres its text.
 */
const CARD_PRESSABLE_CLASS =
  "text-left transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none active:bg-hover";

/** A bordered surface for one thing, pressable when given `onPress`. */
const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, accentColor, accentLabel, onClick: onPress, children, ...props }, ref) => {
    const classes = cn(
      CARD_SURFACE_CLASS,
      onPress && CARD_PRESSABLE_CLASS,
      accentColor && "relative overflow-hidden",
      className,
    );
    const inner = (
      <>
        <ColorBar color={accentColor} label={accentLabel} />
        {children}
      </>
    );

    // The two containers are written out rather than picked with `const Container = onPress ?
    // Pressable : View`. They do not actually share a prop list — only one of them takes a press
    // handler — and `rn2web` refuses an element chosen at runtime, because the tag it emits, the
    // reset class it carries and the role it infers all follow from knowing which one it is.
    if (onPress) {
      return (
        <button
          type="button"
          ref={ref as React.Ref<HTMLButtonElement>}
          onClick={onPress}
          className={cn("cube-rn-view cube-rn-pressable", classes)}
          {...(props as React.ComponentPropsWithoutRef<"button">)}
        >
          {inner}
        </button>
      );
    }
    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        className={cn("cube-rn-view", classes)}
        {...(props as React.ComponentPropsWithoutRef<"div">)}
      >
        {inner}
      </div>
    );
  },
);
Card.displayName = "Card";

/** The top of a card, holding its title and description. */
const CardHeader = React.forwardRef<HTMLDivElement, ViewProps>(({ className, ...props }, ref) => (
  <div
    ref={ref as React.Ref<HTMLDivElement>}
    className={cn("cube-rn-view", "flex flex-col p-4", HEADING_GAP, className)}
    {...(props as React.ComponentPropsWithoutRef<"div">)}
  />
));
CardHeader.displayName = "CardHeader";

type CardTitleProps = TextProps & {
  /**
   * Which heading the title is, `1 | 2 | 3`. The default, 3, is shadcn's and every card's that sits
   * under a page title; a card that *is* the page — a sign-in, a token gate — is the page's `1`.
   * The size does not follow it: the rank says where the card sits, not how big its title looks.
   */
  level?: 1 | 2 | 3 | undefined;
};

// The heading rhythm's title (#473): the size of the description under it and of a row's title,
// so a card of rows reads as one type scale, and never bigger than the page's title (#249). It
// keeps `text-sm`'s 20px line where shadcn's is `leading-none`, which clipped a truncated title's
// descenders.
const CARD_TITLE = HEADING_TITLE;

// One arm per level because the compiler emits `<h1>`–`<h3>` from a *literal* `aria-level`; a level
// held in a variable would be a tag chosen at runtime, which it refuses (see `page-header.tsx`).
/** The card's title, a heading of rank `level`. */
const CardTitle = React.forwardRef<HTMLSpanElement, CardTitleProps>(
  ({ className, level = 3, ...props }, ref) => {
    if (level === 1) {
      return (
        <h1
          ref={ref as React.Ref<HTMLHeadingElement>}
          className={cn("cube-rn-text", CARD_TITLE, className)}
          {...(props as React.ComponentPropsWithoutRef<"h1">)}
        />
      );
    }
    if (level === 2) {
      return (
        <h2
          ref={ref as React.Ref<HTMLHeadingElement>}
          className={cn("cube-rn-text", CARD_TITLE, className)}
          {...(props as React.ComponentPropsWithoutRef<"h2">)}
        />
      );
    }
    return (
      <h3
        ref={ref as React.Ref<HTMLHeadingElement>}
        className={cn("cube-rn-text", CARD_TITLE, className)}
        {...(props as React.ComponentPropsWithoutRef<"h3">)}
      />
    );
  },
);
CardTitle.displayName = "CardTitle";

/** The muted line under the card's title. */
const CardDescription = React.forwardRef<HTMLSpanElement, TextProps>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref as React.Ref<HTMLSpanElement>}
      className={cn("cube-rn-text", HEADING_DESCRIPTION, className)}
      {...(props as React.ComponentPropsWithoutRef<"span">)}
    />
  ),
);
CardDescription.displayName = "CardDescription";

/**
 * The card's body. A `List` or a `Table` inside it reaches into its padding, so the rows line up
 * with the card's title: see `CardBodyContext`.
 */
const CardContent = React.forwardRef<HTMLDivElement, ViewProps>(({ className, ...props }, ref) => (
  <CardBodyContext.Provider value={true}>
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      className={cn("cube-rn-view", "p-4 pt-0", className)}
      {...(props as React.ComponentPropsWithoutRef<"div">)}
    />
  </CardBodyContext.Provider>
));
CardContent.displayName = "CardContent";

/** The row at the bottom of a card, for its actions. */
const CardFooter = React.forwardRef<HTMLDivElement, ViewProps>(({ className, ...props }, ref) => (
  <div
    ref={ref as React.Ref<HTMLDivElement>}
    className={cn("cube-rn-view", "flex flex-row items-center p-4 pt-0", className)}
    {...(props as React.ComponentPropsWithoutRef<"div">)}
  />
));
CardFooter.displayName = "CardFooter";

/**
 * The header's trailing slot — a menu button, a status chip.
 *
 * shadcn's web `CardHeader` is a grid and `CardAction` places itself in its second
 * column with `col-start-2 row-span-2 self-start justify-self-end`. Yoga has no grid,
 * so the same position is a self-aligned absolute box: the header already reserves its
 * right padding, and the action is the only thing that sits there.
 */
const CardAction = React.forwardRef<HTMLDivElement, ViewProps>(({ className, ...props }, ref) => (
  <div
    ref={ref as React.Ref<HTMLDivElement>}
    className={cn("cube-rn-view", "absolute right-4 top-4 items-end", className)}
    {...(props as React.ComponentPropsWithoutRef<"div">)}
  />
));
CardAction.displayName = "CardAction";

export {
  CARD_SURFACE_CLASS,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
};
