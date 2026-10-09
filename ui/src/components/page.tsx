import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import type { IconComponent } from "@/components/ui/icons-base";
import { cn, type SlotNode } from "@/lib/utils";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PageHeader, type PageHeaderProps } from "@/components/page-header";

type PageProps = {
  className?: string;
  /** The screen's body: the header, the grid, the rows, in the order they are drawn. */
  contentSlot: SlotNode;
  /**
   * Full-height flex column (`h-full min-h-0`) instead of the default `flex-1`.
   * For a view whose body scrolls internally rather than as a whole.
   */
  fill?: boolean;
  /** Whether the page itself scrolls. Off for views with an inner scroll area. */
  scroll?: boolean;
  /** `narrow` constrains content to `max-w-2xl` — a settings or detail form. */
  width?: "narrow";
};

/**
 * The page shell a route wraps its content in: a padded, centred column that scrolls unless told
 * not to.
 */
export function Page({ className, contentSlot, fill = false, scroll = true, width }: PageProps) {
  const content = cn("container mx-auto px-4 py-6", width === "narrow" && "max-w-2xl", className);
  const outer = fill ? "h-full min-h-0" : "flex-1";

  if (scroll === false) {
    return <div className={cn("cube-rn-view", outer, "flex-col", content)}>{contentSlot}</div>;
  }

  return (
    <div className={cn("cube-rn-view overflow-auto", outer)}>
      <div className={cn("cube-rn-view", content)}>{contentSlot}</div>
    </div>
  );
}

/**
 * The title row at the top of a page. There is one `PageHeader` in this set, and it lives in
 * `page-header`; it is re-exported here so a screen importing it from its page shell keeps
 * working. It took over from the small one this file used to carry, whose props were renamed on
 * the way: `subtitle` is `description`, `actions` is `actionSlot`, the heading is an `h1` unless
 * `level` says otherwise, and the `mb-4` under it is gone — space it with the page's own gap.
 */
export { PageHeader, type PageHeaderProps };

/**
 * The responsive card grid shared by list pages.
 *
 * `grid` has no native equivalent, so the columns come from flex wrapping plus
 * a percentage width on each cell. Each card is wrapped here rather than at the
 * call sites: the width has to sit on the cell, and a `Card` that carried it
 * would then only be layout-correct inside a grid.
 *
 * The cards are `contentSlot`, as an array or a fragment. Both are opened, so a
 * fragment of three cards is three cells and not one.
 */
export function CardGrid({
  className,
  contentSlot,
}: {
  className?: string;
  contentSlot: SlotNode;
}) {
  return (
    <div className={cn("cube-rn-view", "flex-row flex-wrap gap-4", className)}>
      {cells(contentSlot).map(({ key, cell }) => (
        // The basis is a fraction of the row minus its share of the `gap-4`
        // above, which flex-basis percentages do not account for.
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
 * card's key is prefixed with its fragment's, since two opened fragments number their cards alike.
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

type EmptyStateProps = {
  title: string;
  actionSlot?: SlotNode;
  /** The root. Mostly for an inset: `px-2` lines the `compact` line up with a sidebar's rows. */
  className?: string | undefined;
} & (
  | {
      /**
       * The one muted line that stands in for a short list *inside* something else — a card, a
       * sidebar section, a popover: "No labels yet." Off, it is the centred block that stands in
       * for a whole list or page. On, it keeps the left edge of what it sits in, draws no icon
       * bubble and no padding past a `py-2`, and takes no `description` and no `level`: a line
       * inside a region that already has its heading is never what a screen reader lands on. The
       * same word, for the same place, as `QueryState`'s `compact` — whose `emptySlot` it usually
       * is.
       */
      compact?: false | undefined;
      icon: IconComponent;
      description?: ReactNode;
      /**
       * Makes the title a heading of this rank. Leave it off for an empty list inside a page that
       * already has its heading. Set it when the empty state *is* the page — a first run, a
       * record that was not found, a link that did not work — so a screen reader has a heading to
       * land on: `1` for a whole screen, `2` or `3` under a title that is already there. The text
       * is the same size at every level, as on `Section`: pick the rank by where it sits, not by
       * how it looks.
       */
      level?: 1 | 2 | 3 | undefined;
    }
  | {
      compact: true;
      /** Optional here: drawn inline before the text, at the text's size, with no bubble. */
      icon?: IconComponent | undefined;
      description?: never;
      level?: never;
    }
);

/**
 * The centred icon / title / description / action shown when a list is empty — or, at
 * `compact`, the one muted line shown when a short list inside a card or sidebar is.
 *
 * The block is drawn by `@cubeui/empty`'s parts, so shadcn's compound `Empty` and this one-line
 * form are the same empty state. The compact line is its own: it has none of their parts.
 *
 * The heading is `role="heading"` + `aria-level`, the same as `Section`'s: a heading on device,
 * where VoiceOver and TalkBack navigate by it, and on the web a `<span>` carrying the rank, since
 * the rank is a prop and the compiler writes the tag once. Two arms rather than a spread `role`,
 * so a title with no `level` stays plain text on both platforms.
 *
 * The compact line wraps rather than truncates: "No servers yet. Add one to give the agent some
 * tools." is a sentence someone has to read, and the action drops under it on a narrow column.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionSlot,
  level,
  compact,
  className,
}: EmptyStateProps) {
  if (compact) {
    return (
      <div
        className={cn(
          "cube-rn-view",
          "w-full flex-row flex-wrap items-center gap-x-2 gap-y-1 py-2",
          className,
        )}
      >
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-foreground/60" aria-hidden /> : null}
        <span className="cube-rn-text shrink text-sm text-foreground/60">{title}</span>
        {actionSlot}
      </div>
    );
  }
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        {level === undefined ? (
          <EmptyTitle>{title}</EmptyTitle>
        ) : (
          <EmptyTitle role="heading" aria-level={level}>
            {title}
          </EmptyTitle>
        )}
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {actionSlot}
    </Empty>
  );
}
