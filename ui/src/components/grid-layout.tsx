import { Children, Fragment, isValidElement, type ReactElement } from "react";
import { cn, type SlotNode } from "@/lib/utils";

export type GridLayoutProps = {
  /**
   * The cells, as an array or a fragment: cards, tiles, anything of one kind. Both are opened, so
   * a fragment of three cards is three cells and not one.
   */
  contentSlot: SlotNode;
  className?: string | undefined;
};

/** Lays `contentSlot` out as equal cells, 1 to 4 to a row by the window's width. */
export function GridLayout({ contentSlot, className }: GridLayoutProps) {
  return (
    <div className={cn("cube-rn-view", "flex-row flex-wrap gap-4", className)}>
      {cells(contentSlot).map(({ key, cell }) => (
        // A fraction of the row minus its share of the `gap-4`, which a percentage width does not
        // account for.
        <div
          key={key}
          className="cube-rn-view w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)] xl:w-[calc(25%-0.75rem)]"
        >
          {cell}
        </div>
      ))}
    </div>
  );
}

/**
 * A slot's elements, one per cell: arrays and fragments opened, the nothing values dropped. A
 * cell's key is prefixed with its fragment's, since two opened fragments number their cells alike.
 */
function cells(slot: SlotNode, prefix = ""): { key: string; cell: ReactElement }[] {
  return Children.toArray(slot).flatMap((child) => {
    if (isValidElement<{ children?: SlotNode }>(child) === false) {
      return [];
    }
    const key = `${prefix}${child.key}`;
    return child.type === Fragment ? cells(child.props.children, key) : [{ key, cell: child }];
  });
}
