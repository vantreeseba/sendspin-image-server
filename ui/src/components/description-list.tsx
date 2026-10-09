import type { ReactNode } from "react";
import * as React from "react";
import { cn, type SlotNode } from "@/lib/utils";

type Layout = "inline" | "stacked";

/**
 * The list's `layout`, handed to its rows. Context rather than a prop on every row, because a row
 * that disagreed with its neighbours would break the one column the labels line up in.
 */
const LayoutContext = React.createContext<Layout>("inline");

/**
 * The row, per layout. Literal class maps, because the scanner reads source text (conventions §3).
 *
 * `inline` is a wrapping row rather than a breakpoint: the label has a fixed width, so the labels
 * of every row line up, and the value a floor of its own, so when the two no longer fit side by
 * side the value wraps onto the next line and the row reads as `stacked`. That is plain flexbox, so
 * it is the same fallback on device (Yoga wraps the same way) and in the compiled DOM — and it
 * follows the width the list is actually given, where a viewport breakpoint would follow the
 * window and get a list in a narrow sidebar wrong.
 *
 * `items-baseline` lines the label up with the value's first line, whatever sits under the value
 * (a hint) or beside it (an action taller than the text).
 */
const ROWS = {
  inline: "flex-row flex-wrap items-baseline gap-x-4 gap-y-1",
  stacked: "gap-1",
} as const;

const LABELS = {
  inline: "w-40 shrink-0",
  stacked: "",
} as const;

const VALUES = {
  inline: "min-w-48 flex-1",
  stacked: "",
} as const;

/**
 * A wrapper around a caller's node, not layout of its own: a block box on the web, where a compiled
 * view would otherwise be a flex column and lay `<code>/data</code> (mounted)` out as two rows.
 */
const SLOT = "block";

const isText = (node: ReactNode) => typeof node === "string" || typeof node === "number";

/** A string on its own is a crash on device, so a string value gets a `Text` around it. */
function asText(node: ReactNode, className: string) {
  return isText(node) ? (
    <span className={cn("cube-rn-text", className)}>{node}</span>
  ) : (
    <div className={cn("cube-rn-view", "min-w-0", SLOT)}>{node}</div>
  );
}

type DescriptionListProps = {
  /**
   * The rows: `PropertyRow`s, as an array or a fragment. Nothing else belongs here — on the web
   * this is a `<dl>`, which may hold only term-and-description groups.
   */
  contentSlot?: SlotNode | undefined;
  /**
   * `inline` (the default) puts each label beside its value, and falls back to `stacked` on its own
   * when the list is too narrow for both. `stacked` puts the label above the value at every width.
   * Not `orientation`: `inline` is not horizontal below the width it wraps at, and a word that is
   * only true on a wide screen is the kind rule 11 renames later.
   */
  layout?: Layout | undefined;
  className?: string | undefined;
};

/**
 * Read-only facts, each a label, a value and an optional line under the value — the shape a
 * settings page and an "about this server" page are made of.
 *
 * Each app that had one picked its own semantics for it: a `<dl>`, a list, or a column of `div`s
 * that a screen reader reads as one run-on sentence. The semantics are the reason this is a shell:
 *
 * - On the web it is a `<dl>`; each row is a `<div>` holding a `<dt>` (the label) and a `<dd>`
 *   (the value, its hint and its action), which is the grouping HTML allows inside a `<dl>`.
 * - On device it is `role="list"` and each row `role="listitem"`, so VoiceOver and TalkBack say
 *   how many facts there are and read each label with its value.
 *
 * No state, no data, no `children` — the rows are `contentSlot`, like every other shell's body.
 */
export function DescriptionList({
  contentSlot,
  layout = "inline",
  className,
}: DescriptionListProps) {
  return (
    <LayoutContext.Provider value={layout}>
      <dl data-slot="description-list" className={cn("cube-rn-view", "min-w-0 gap-3", className)}>
        {contentSlot}
      </dl>
    </LayoutContext.Provider>
  );
}

type PropertyRowProps = {
  /** What the fact is called: "Embedder", "Docs folder". A `<dt>` on the web. */
  label: ReactNode;
  /**
   * The fact itself: a string, or a node — a `Badge`, a relative time. Not a control: a value the
   * user edits is a form field (`FormField`), and this row has no label for it.
   */
  value: ReactNode;
  /**
   * One muted line under the value, on where it comes from or what it means: "Set with
   * `RAGDOWN_EMBEDDER`". Part of the `<dd>`, so it is read with the value rather than as a fact
   * of its own.
   */
  hint?: ReactNode | undefined;
  /**
   * The row's far end: a copy button, an edit link. Inside the `<dd>`, after the value, because a
   * `<dl>`'s rows may hold nothing but terms and descriptions — and an action on the value is part
   * of what is said about it.
   */
  actionSlot?: SlotNode | undefined;
  className?: string | undefined;
  labelClassName?: string | undefined;
  /**
   * A string or number value's own `Text`, so a path, a version or an id is `value={path}
   * valueClassName="font-mono"` rather than a node written to carry the font. On the text and
   * not on the wrapper around it, because on device a `Text` inherits nothing: from the wrapper a
   * `font-mono` reached the string on the web, with the hint and the action, and none of them on
   * a phone.
   *
   * A node value is the caller's own text and takes its own classes, so there this is still the
   * value's half of the row — the `<dd>` — as `StatTile`'s is the wrapper round a node.
   */
  valueClassName?: string | undefined;
};

/**
 * One fact in a `DescriptionList`: a label, a value, a hint under the value, an action beside it.
 *
 * Only ever inside a `DescriptionList`, which is what gives it a layout and a parent list — a
 * `<dt>` with no `<dl>` around it is markup axe rejects, as is a list item with no list.
 *
 * The row is a `<div>` on the web, not an `<li>`: `webAs` names the element, and `role="listitem"`
 * is the device's, since a role on a `<dl>`'s group is exactly what makes the `<dl>` invalid.
 */
export function PropertyRow({
  label,
  value,
  hint,
  actionSlot,
  className,
  labelClassName,
  valueClassName,
}: PropertyRowProps) {
  const layout = React.useContext(LayoutContext);

  return (
    <div
      data-slot="property-row"
      className={cn("cube-rn-view", "min-w-0", ROWS[layout], className)}
    >
      <dt
        data-slot="property-row-label"
        className={cn(
          "cube-rn-text",
          "break-words text-foreground/60 text-sm",
          LABELS[layout],
          labelClassName,
        )}
      >
        {label}
      </dt>
      <dd
        data-slot="property-row-value"
        className={cn(
          "cube-rn-view",
          "min-w-0 flex-row items-center gap-2",
          VALUES[layout],
          // A string's class is on its `Text`, below. Left here as well, a `font-mono` would reach
          // the hint and the action on the web, by inheritance, and neither of them on device.
          isText(value) ? undefined : valueClassName,
        )}
      >
        <div className="cube-rn-view min-w-0 flex-1 gap-0.5">
          {asText(value, cn("break-words text-foreground text-sm", valueClassName))}
          {hint ? (
            <span data-slot="property-row-hint" className="cube-rn-text text-foreground/60 text-xs">
              {hint}
            </span>
          ) : null}
        </div>
        {actionSlot ? (
          <div
            data-slot="property-row-action"
            className="cube-rn-view shrink-0 flex-row items-center gap-1"
          >
            {actionSlot}
          </div>
        ) : null}
      </dd>
    </div>
  );
}
