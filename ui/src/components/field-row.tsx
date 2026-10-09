import type { ReactNode } from "react";
import { Children, Fragment, isValidElement } from "react";
import { cn, type SlotNode } from "@/lib/utils";

/**
 * The floor a cell holds, which is the whole component: it is what decides when the row wraps
 * rather than squeezing. Two 45% cells fit and a third cannot, so it drops to the next line at
 * its full width instead of three fields sharing one line at a third each — which is where a
 * `<Select>`'s value and an `<Input>`'s placeholder start being clipped.
 *
 * Percentages rather than a `grid-cols-*`, because a grid keeps its columns at every width: the
 * same row that reads well on a settings page is two 140px fields inside a dialog.
 */
const CELL_FLOOR = {
  2: "min-w-[45%]",
  3: "min-w-[30%]",
} as const;

type FieldRowProps = {
  /**
   * The fields. Each one is given a cell of its own, so they share the row evenly however many
   * there are, and a `{cond && <FormField/>}` that renders nothing leaves no empty cell behind.
   */
  contentSlot?: SlotNode | undefined;
  /**
   * How many fit on a line before the row wraps. `2` is nearly always right — it is the shape a
   * form reaches for when two values belong together, a priority beside a duration, a start date
   * beside an end date.
   */
  perRow?: keyof typeof CELL_FLOOR | undefined;
  className?: string | undefined;
  cellClassName?: string | undefined;
};

/**
 * Fields side by side on one row, wrapping when they no longer fit.
 *
 * This is a component rather than a class string because the class string is the part that gets
 * written wrong. Every hand-written version of this row is `grid grid-cols-2 gap-4`, which is
 * right until the row is inside a dialog or a pane of a split, where two columns of 140px cut
 * off the thing the fields are for. The floor is what makes it wrap, and a floor is not
 * something anyone remembers to add to a grid they wrote in a hurry.
 *
 * It holds no opinion about what is in a cell: a `FormField`, a pair of them, a button. It sizes
 * the cell and stays out of the way — the field inside keeps its own `className`, which is why
 * the cell exists at all rather than an `[&>*]` variant on the row.
 */
/**
 * The fields, one entry each, keyed.
 *
 * `Children.toArray` counts a fragment as one child, and a fragment is exactly how `contentSlot`
 * arrives — `contentSlot={<><FormField …/><FormField …/></>}` is the natural way to write a slot
 * that holds several things. Unwrapped, the whole fragment landed in a single cell and the row
 * had one column. So a fragment at the top is opened, once; anything else is a field.
 *
 * `toArray` also drops `null`, `undefined` and `false`, so `{isEdit && <FormField …/>}` leaves
 * no empty cell behind — and it keys what it keeps by position, which is the key the cell
 * wrapping it should carry.
 */
function fieldsOf(content: ReactNode): Array<{ key: string; node: ReactNode }> {
  const flat = Children.toArray(content).flatMap((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment
      ? Children.toArray(child.props.children)
      : [child],
  );
  return flat.map((node, position) => ({
    key: isValidElement(node) && node.key ? node.key : `cell-${position}`,
    node,
  }));
}

/** A row of form fields that wraps a field to the next line rather than squeezing it. */
export function FieldRow({ contentSlot, perRow = 2, className, cellClassName }: FieldRowProps) {
  return (
    <div data-slot="field-row" className={cn("flex flex-wrap gap-4", className)}>
      {fieldsOf(contentSlot).map(({ key, node }) => (
        <div
          key={key}
          data-slot="field-row-cell"
          className={cn("flex-1", CELL_FLOOR[perRow], cellClassName)}
        >
          {node}
        </div>
      ))}
    </div>
  );
}
