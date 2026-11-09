import { hexToAccent } from "@/lib/color";
import { cn } from "@/lib/utils";
import { useSurfaceColors } from "@/components/ui/surface-colors";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * The registry's dot scale, two steps (#487). 8px is a dot inside something: a row of a menu, a
 * chip, and `Badge`'s own dots, the bare one and the soft one's. 10px is a dot standing beside the
 * label it stands for, the cap height of the 14px text next to it.
 */
const SIZES = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
} as const;

type ColorDotProps = {
  /**
   * The colour a tag or a category was given, which the palette does not hold. A hex is made just
   * light or dark enough to be 3:1 from the page and a card of the theme it is drawn in, as
   * `ColorBar`'s is, so a navy tag does not vanish in dark mode or a yellow one on white, and each
   * keeps its colour where it already shows. Any other CSS colour is drawn as given.
   */
  color: string;
  /**
   * `sm` (8px) for a dot inside a line of text, a menu row or a chip; `md` (10px), the default,
   * for one standing beside its label in a list or a legend.
   */
  size?: keyof typeof SIZES;
  /** On the dot itself: a margin to line it up with the first line of a label that wraps. */
  className?: string | undefined;
  /**
   * What the colour stands for: the accessible name, and on the web the tooltip under the pointer.
   * Without it the dot is decoration.
   */
  label?: string | undefined;
};

/**
 * A small round colour swatch standing in for a category, status or tag.
 *
 * A hex colour is drawn through `hexToAccent`, as `ColorBar` draws its stripe: a dot that means
 * something is a mark someone has to see, 3:1 from what it sits on (WCAG 1.4.11), and a picked
 * colour knows nothing about the theme it will be drawn in, so the dot reads the theme's page and
 * card where it is drawn (`useSurfaceColors`).
 *
 * A `View` rather than a `<span>`: react-native-web renders it as a `<div>` with
 * the same box, so one file serves both platforms. Without a `label` it is
 * decoration and is hidden from assistive tech rather than announced as an
 * unnamed image.
 *
 * With one, the web shows it under the pointer (#479): a colour is all a sighted
 * reader has otherwise, and two hues can be one colour to a reader with a
 * colour-vision deficiency. Not on device, where there is no hover and a dot is
 * too small to long-press.
 */
export function ColorDot({ color, size = "md", className, label }: ColorDotProps) {
  const named = label !== undefined && label !== "";
  const [drawnIn, surfaces] = useSurfaceColors();
  const dot = (
    <div
      ref={(node) => {
        drawnIn.current = node;
      }}
      className={cn("cube-rn-view", "shrink-0 rounded-full", SIZES[size], className)}
      style={{ backgroundColor: hexToAccent(color, surfaces) ?? color }}
      // `aria-describedby` is passed even when empty: radix points its trigger at the open bubble,
      // `Slot` lets the child's value win, and describing the dot with its own name reads it twice.
      {...(named
        ? ({ role: "img", "aria-label": label, "aria-describedby": undefined } as const)
        : ({ "aria-hidden": true } as const))}
    />
  );
  if (named === false) {
    return dot;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>{dot}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
