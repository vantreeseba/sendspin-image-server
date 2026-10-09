import { cva } from "class-variance-authority";
import { Children, type ReactNode } from "react";

/** The meanings a badge can carry, which pick its colours. */
export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "ghost"
  | "link"
  | "positive"
  | "warning"
  | "info";

export type BadgeProps = {
  variant?: BadgeVariant | undefined;
  /**
   * Overrides the variant's background with a literal colour — for a badge
   * standing in for a user-chosen tag or category. Passing it also drops the
   * variant's label colour, since the caller's background is unknown and
   * `text-neutral-foreground` would be a guess. Pair it with `readableTextColor`
   * when the label has to stay legible on an arbitrary hue.
   */
  backgroundColor?: string | undefined;
  /**
   * Overrides the label's colour, for the same case as `backgroundColor`: with an
   * arbitrary hue behind it, neither the variant's label colour nor the
   * `text-foreground` fallback is guaranteed to be legible. `readableTextColor`
   * is what computes the value to pass.
   */
  textColor?: string | undefined;
  className?: string | undefined;
  /**
   * What the dot stands for, exposed as its accessible name. In the pill form
   * the text is already the name, so there it only feeds `removeLabel`'s default
   * when the children hold no text of their own.
   */
  label?: string | undefined;
  /**
   * Draws a trailing ✕, a button of its own, that calls this — a tag or a filter
   * chip the user can take off. The ✕ is in the label's colour, and pressing it
   * reaches nothing else on the badge. Ignored by the dot, which has no room for
   * it, and by the web half's `asChild`, whose one child is the whole badge.
   */
  onRemove?: (() => void) | undefined;
  /** The ✕'s accessible name. Defaults to `Remove <text>`, the badge's own text. */
  removeLabel?: string | undefined;
  /**
   * The label: text, a number, or elements such as an icon beside text. Absent —
   * including an empty string — collapses the badge to a dot.
   */
  children?: ReactNode;
};

/** Whether `children` holds anything to show, which is what decides pill or dot. */
export function badgeHasLabel(children: ReactNode): boolean {
  return children !== undefined && children !== null && children !== false && children !== "";
}

/**
 * The ✕'s default name: `Remove` and the badge's text — its string and number
 * children — or `label` when the children are all elements.
 */
export function badgeRemoveLabel(children: ReactNode, label?: string | undefined): string {
  const text = Children.toArray(children)
    .filter((child) => typeof child === "string" || typeof child === "number")
    .join("")
    .trim();
  const name = text || label;
  return name ? `Remove ${name}` : "Remove";
}

/**
 * No `align-self` here: a badge beside a select or a button takes the row's `items-center` like
 * everything else in it. Keeping it from stretching down a column is each half's job — `w-fit`
 * on the web, `self-start` on native, where Yoga has no fit-content.
 *
 * The container: shape and background. `shape` is derived from whether a label
 * was passed, not taken as a prop — a dot is what a badge with nothing to say
 * already is, and making it a second axis would allow the two states that mean
 * nothing: a dot with a label it cannot show, and an empty pill.
 */
export const badgeContainerVariants = cva("shrink-0 rounded-full border border-transparent", {
  variants: {
    variant: {
      default: "bg-neutral",
      secondary: "bg-foreground/10",
      destructive: "bg-negative",
      outline: "border-foreground/10 bg-transparent",
      ghost: "bg-transparent",
      link: "bg-transparent",
      positive: "bg-positive",
      warning: "bg-warning",
      info: "bg-info",
    },
    shape: {
      pill: "flex-row items-center justify-center gap-1 px-2 py-0.5",
      dot: "h-2 w-2",
    },
  },
  defaultVariants: { variant: "default", shape: "pill" },
});

/** The label's colour and nothing else, per variant. */
const BADGE_INK = {
  default: "text-neutral-foreground",
  secondary: "text-foreground",
  destructive: "text-negative-foreground",
  outline: "text-foreground",
  ghost: "text-foreground",
  link: "text-info",
  positive: "text-positive-foreground",
  warning: "text-warning-foreground",
  info: "text-info-foreground",
} satisfies Record<BadgeVariant, string>;

/** The label's type and colour, per variant. */
export const badgeTextVariants = cva("text-xs font-medium", {
  variants: {
    variant: { ...BADGE_INK, link: "text-info underline-offset-4" },
  },
  defaultVariants: { variant: "default" },
});

/**
 * The ✕'s colour on native, where nothing inherits: the label's ink without its
 * type, which an `<Svg>` has no use for. The web ✕ takes `currentColor` instead.
 */
export const badgeInkVariants = cva("", {
  variants: { variant: BADGE_INK },
  defaultVariants: { variant: "default" },
});

/** The label's class when `backgroundColor` replaced the variant's own. */
export const badgeTextFallback = "text-xs font-medium text-foreground";

/** `badgeInkVariants`' counterpart, for when `backgroundColor` replaced the variant's own. */
export const badgeInkFallback = "text-foreground";

/**
 * The badge's icon size — the one the web half gives an `<svg>` child — and so the ✕'s. It is
 * shorter than the label's line, so the ✕ never makes the pill taller.
 */
export const badgeIconClass = "size-3 shrink-0";

/**
 * shadcn's `badgeVariants`: the whole pill's classes, container and label together, for dressing
 * something else — a link, a button — as a badge. The two class maps never touch the same
 * property, so they join without merging.
 */
export function badgeVariants({
  variant,
  shape,
}: {
  variant?: BadgeVariant | null | undefined;
  shape?: "pill" | "dot" | null | undefined;
} = {}): string {
  return `${badgeContainerVariants({ variant, shape })} ${badgeTextVariants({ variant })}`;
}
