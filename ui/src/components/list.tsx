import { Children, Fragment, isValidElement, type ReactElement, useContext } from "react";
import { CardBodyContext, cn, type SlotNode } from "@/lib/utils";

/**
 * A row's cell. The padding is the list's and not the row's, so a `ListItem`, a `CollapsibleRow` and
 * a row an app wrote itself sit the same distance from the rule above them.
 */
const ROW = "min-w-0 py-1";

/**
 * The rule over every row but the first: the hairline `ItemSeparator` draws, as a border, so it
 * takes no row of its own and a list of one row has none.
 */
const RULE = "border-foreground/10 border-t";

/**
 * In a card's body, the list reaches out by a row's own `px-3` (`Item` at `sm`), so a row's title
 * starts where the card's title, description and footer do and its end lines up with the card's
 * action. Inset by the card's padding as well, the rows' text sat 12px in from every other edge in
 * the card, and the eye read the list as a box set inside the card rather than as its body.
 */
const IN_CARD = "-mx-3";

/**
 * A nested row's indent, one step per level, and the guide down its start edge that shows which row
 * above it hangs from. Classes rather than a computed margin, so the steps are the spacing scale's;
 * past the last step a row sits at the last, since a tree that deep in a list wants a `FileTree`.
 */
const INDENT = ["", "ml-4", "ml-8", "ml-12", "ml-16", "ml-20", "ml-24"] as const;
const GUIDE = "border-foreground/10 border-l-2 pl-3";

/** `depth` as an index into `INDENT`: a whole number from 0 to the last step. */
function step(depth: number): number {
  return Math.min(Math.max(Math.floor(depth), 0), INDENT.length - 1);
}

type ListRowProps = {
  /** The row: a `ListItem`, a `CollapsibleRow`, a row of your own. */
  children: ReactElement;
  /**
   * How far down the tree the row is: 0 at the top, 1 under a row at 0, and so on. The list
   * indents it and draws a guide, and tells a screen reader the level.
   */
  depth?: number | undefined;
};

/**
 * One row of a `List` that says something about where it sits — today, how deep. The list reads it
 * and draws the row; on its own it is just its child.
 */
function ListRow({ children }: ListRowProps) {
  return children;
}

type ListProps = {
  /**
   * The rows: `ListItem`s, `CollapsibleRow`s, an array of them or a fragment. One cell each. Wrap a
   * row in `ListRow` to give it a `depth`.
   */
  contentSlot?: SlotNode;
  /** What the list is a list of, in the reader's words: "Workspaces". Its accessible name. */
  label?: string;
  /** A rule between rows. On unless turned off, for rows that are cards of their own. */
  divided?: boolean;
  /** On the list itself, the box its rows are drawn in. */
  className?: string;
};

/**
 * The list a row sits in: a `<ul>` whose `<li>`s it writes itself, on device `role="list"` and
 * `role="listitem"`, so a screen reader says "list, 4 items" and a row is "2 of 4".
 *
 * - Each element of `contentSlot` is one row. An array or a fragment is opened first, so
 *   `rows.map(...)` beside a fixed last row is that many rows and not two.
 * - The rule between rows and the padding around each are the list's. A row brings neither.
 * - A row in a `ListRow` with a `depth` is indented that many steps, with a guide rule, and its
 *   item carries `aria-level` (the depth plus one), so a step under a decision is read as nested.
 * - It has no empty and no loading state: those rungs are `LoadState`'s, above the list, and a
 *   list of no rows is not drawn at all rather than announced as "list, 0 items".
 * - In a card's body it reaches into the card's padding by a row's inset, so the rows' titles line
 *   up with the card's. A row of your own brings `ListItem`'s `px-3` to line up the same way.
 */
function List({ contentSlot, label, divided = true, className }: ListProps) {
  const inCard = useContext(CardBodyContext);
  const all = rows(contentSlot);
  if (all.length === 0) {
    return null;
  }

  return (
    <ul
      data-slot="list"
      aria-label={label}
      className={cn("cube-rn-view", "min-w-0", inCard && IN_CARD, className)}
    >
      {all.map(({ key, row, depth }, index) => {
        const level = depth === undefined ? 0 : step(depth);
        return (
          // biome-ignore lint/a11y/useAriaPropsSupportedByRole: ARIA 1.2 gives listitem aria-level; Biome's table lacks it
          <li
            key={key}
            data-slot="list-row"
            aria-level={depth === undefined ? undefined : level + 1}
            className={cn(
              "cube-rn-view",
              ROW,
              divided && index > 0 && RULE,
              level > 0 && [INDENT[level], GUIDE],
            )}
          >
            {row}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A slot's elements, one per row: arrays and fragments opened, the nothing values dropped. A row's
 * key is prefixed with its fragment's, since two opened fragments number their rows alike.
 */
function rows(
  slot: SlotNode,
  prefix = "",
): { key: string; row: ReactElement; depth: number | undefined }[] {
  return Children.toArray(slot).flatMap((child) => {
    if (isValidElement<{ children?: SlotNode }>(child) === false) {
      return [];
    }
    const key = `${prefix}${child.key}`;
    if (child.type === Fragment) {
      return rows(child.props.children, key);
    }
    if (child.type === ListRow) {
      const { children, depth } = child.props as ListRowProps;
      return [{ key, row: children, depth }];
    }
    return [{ key, row: child, depth: undefined }];
  });
}

/**
 * Whether a `List` handed this `contentSlot` would draw a row — it draws nothing when it would not.
 * For a shell with an `emptySlot`, which cannot see what a list it was handed will render.
 */
function hasRows(slot: SlotNode): boolean {
  return rows(slot).length > 0;
}

export type { ListProps, ListRowProps };
export { hasRows, List, ListRow };
