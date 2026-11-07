import type { ReactNode } from "react";

export type TooltipProviderProps = {
  /** Hover time before a tooltip opens, in ms. Web only — see `tooltip.tsx`. */
  delayDuration?: number | undefined;
  /** Grace period during which a neighbouring tooltip opens instantly. Web only. */
  skipDelayDuration?: number | undefined;
  children: ReactNode;
};

/** Which edge of the trigger the bubble sits on. */
export type TooltipSide = "top" | "right" | "bottom" | "left";

export type TooltipProps = { children: ReactNode };

export type TooltipTriggerProps = {
  /** Hand the handlers to the single child rather than wrapping it. */
  asChild?: boolean | undefined;
  /** The wrapper's class, when not `asChild`. */
  className?: string | undefined;
  children: ReactNode;
};

export type TooltipContentProps = {
  side?: TooltipSide | undefined;
  className?: string | undefined;
  children: ReactNode;
};

/**
 * The tooltip's bubble: the page's colours swapped, so it stands apart from whatever it floats over.
 * It was `bg-secondary`, a raised surface, which in light is all but the page's own white: with
 * only a `/10` edge it melted into the row under it and read as see-through. `foreground` on
 * `background` is the page's own text contrast, in every palette.
 */
export const TOOLTIP_CONTENT_CLASS =
  "overflow-hidden rounded-md bg-foreground px-3 py-1.5 shadow-md";
/** The type of the tooltip's text: the page's background colour, on the swapped bubble. */
export const TOOLTIP_TEXT_CLASS = "text-sm text-background";

/**
 * Where the bubble goes on native, per side. Radix measures and flips; there is no
 * collision detection here, so a tooltip near an edge is the caller's `side` to get
 * right — which is the same thing the prop is for on web.
 */
export const TOOLTIP_SIDE_CLASS = {
  top: "bottom-full mb-1 self-center",
  bottom: "top-full mt-1 self-center",
  left: "right-full mr-1 self-start",
  right: "left-full ml-1 self-start",
} as const satisfies Record<TooltipSide, string>;
