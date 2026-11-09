import { hexToAccent } from "@/lib/color";
import { cn } from "@/lib/utils";
import { useSurfaceColors } from "@/components/ui/surface-colors";

type ColorBarProps = {
  /** Nullable so callers can pass an optional field; renders nothing without it. */
  color?: string | null | undefined;
  /** What the colour stands for, exposed as the bar's accessible name. */
  label?: string | undefined;
  className?: string | undefined;
};

/**
 * A full-height accent bar pinned to the left edge of a card.
 *
 * The colour is drawn through `hexToAccent`, which keeps its hue and moves its
 * lightness only as far as it must to be 3:1 from the page and the card of the
 * theme the stripe is in, read where it is drawn (`useSurfaceColors`): a yellow
 * stays yellow on a dark card and darkens on a light one, and a navy stays navy
 * on a light card (#504). Where no theme can be read, it takes the band that is
 * 3:1 in every theme `@cubeui/tokens` ships. `label` is the accessible name
 * only — a `title` tooltip has no native counterpart, so it was dropped rather
 * than made web-only.
 *
 * Prefer `<Card accentColor accentLabel>`, which owns the positioning this
 * needs. Used directly, the parent must be `relative` and `overflow-hidden` so
 * the bar follows the rounded corners.
 */
export function ColorBar({ color, label, className }: ColorBarProps) {
  const [drawnIn, surfaces] = useSurfaceColors();
  if (!color) {
    return null;
  }
  return (
    <div
      ref={(node) => {
        drawnIn.current = node;
      }}
      className={cn("cube-rn-view", "absolute inset-y-0 left-0 w-2.5", className)}
      style={{ backgroundColor: hexToAccent(color, surfaces) }}
      {...(label
        ? ({ role: "img", "aria-label": label } as const)
        : ({ "aria-hidden": true } as const))}
    />
  );
}
