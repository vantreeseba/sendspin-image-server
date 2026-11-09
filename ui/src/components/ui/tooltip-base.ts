import { Children, isValidElement, type ReactNode } from "react";

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
 *
 * `max-w-xs`, so a long hint wraps into a short paragraph rather than running the width of the
 * screen in one line (#486).
 */
export const TOOLTIP_CONTENT_CLASS =
  "max-w-xs overflow-hidden rounded-md bg-foreground px-3 py-1.5 shadow-md";
/** The type of the tooltip's text: the page's background colour, on the swapped bubble. */
export const TOOLTIP_TEXT_CLASS = "text-sm text-background";

/**
 * Where the bubble goes on native, per side, when there is no layer to draw it in (no `OverlayHost`
 * or `ToastProvider` at the app's root): beside the trigger in the trigger's parent. There it is
 * clipped by a `ScrollView` around the trigger, takes no more room than the trigger has, and is not
 * kept on screen; {@link placeTooltip} is what a layer does instead.
 */
export const TOOLTIP_SIDE_CLASS = {
  top: "bottom-full mb-1 self-center",
  bottom: "top-full mt-1 self-center",
  left: "right-full mr-1 self-start",
  right: "left-full ml-1 self-start",
} as const satisfies Record<TooltipSide, string>;

/** A box in a layer: where the trigger is in the window, less where the layer is. */
export type TooltipBox = { x: number; y: number; width: number; height: number };

/** A width and a height: the bubble's own, or the layer's. */
export type TooltipSize = { width: number; height: number };

/** The gap between a device's bubble and its trigger, `mb-1` in {@link TOOLTIP_SIDE_CLASS}. */
export const TOOLTIP_GAP = 4;
/** How far a device's bubble keeps from the screen's edges, the web's `collisionPadding`. */
export const TOOLTIP_EDGE = 8;

const OPPOSITE = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
} as const satisfies Record<TooltipSide, TooltipSide>;

const HALF = 2;

/** `value`, moved into `[low, high]`; `low` when the range is empty. */
function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high));
}

/**
 * Where a device's bubble goes in its layer: on `side` of the trigger and centred on it, on the
 * other side when `side` has no room and the other has, and slid along to stay
 * {@link TOOLTIP_EDGE} clear of the screen's edges, as radix places the web's.
 */
export function placeTooltip(
  trigger: TooltipBox,
  bubble: TooltipSize,
  room: TooltipSize,
  side: TooltipSide,
): { x: number; y: number; side: TooltipSide } {
  const fits: Record<TooltipSide, boolean> = {
    top: trigger.y - TOOLTIP_GAP - bubble.height >= TOOLTIP_EDGE,
    bottom: trigger.y + trigger.height + TOOLTIP_GAP + bubble.height <= room.height - TOOLTIP_EDGE,
    left: trigger.x - TOOLTIP_GAP - bubble.width >= TOOLTIP_EDGE,
    right: trigger.x + trigger.width + TOOLTIP_GAP + bubble.width <= room.width - TOOLTIP_EDGE,
  };
  const chosen = fits[side] || fits[OPPOSITE[side]] === false ? side : OPPOSITE[side];
  const centreX = trigger.x + (trigger.width - bubble.width) / HALF;
  const centreY = trigger.y + (trigger.height - bubble.height) / HALF;
  const at = {
    top: { x: centreX, y: trigger.y - TOOLTIP_GAP - bubble.height },
    bottom: { x: centreX, y: trigger.y + trigger.height + TOOLTIP_GAP },
    left: { x: trigger.x - TOOLTIP_GAP - bubble.width, y: centreY },
    right: { x: trigger.x + trigger.width + TOOLTIP_GAP, y: centreY },
  }[chosen];
  return {
    x: clamp(at.x, TOOLTIP_EDGE, room.width - TOOLTIP_EDGE - bubble.width),
    y: clamp(at.y, TOOLTIP_EDGE, room.height - TOOLTIP_EDGE - bubble.height),
    side: chosen,
  };
}

/** The least time a device's bubble stays up after the finger lifts: long enough for a word. */
const MIN_VISIBLE_MS = 2500;
/**
 * The time a character adds: 60ms is about 170 words a minute, a slow reading pace, so a reader who
 * takes longer than most still reaches the end of a long hint (WCAG 2.2.1).
 */
const MS_PER_CHARACTER = 60;

/** How many characters of text a node holds, through any elements it is made of. */
function textLength(node: ReactNode): number {
  let length = 0;
  Children.forEach(node, (child) => {
    if (typeof child === "string" || typeof child === "number") {
      length += String(child).length;
    } else if (isValidElement<{ children?: ReactNode }>(child)) {
      length += textLength(child.props.children);
    }
  });
  return length;
}

/**
 * How long a device's tooltip stays up once the finger lifts: longer for a longer hint, and never
 * less than {@link MIN_VISIBLE_MS}. The web's stays while it is hovered or focused, and needs none.
 */
export function tooltipVisibleMs(content: ReactNode): number {
  return Math.max(MIN_VISIBLE_MS, textLength(content) * MS_PER_CHARACTER);
}
