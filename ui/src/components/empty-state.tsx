import type { ReactNode } from "react";
import { IconClassContext, type IconComponent } from "@/components/ui/icons-base";
import { cn, hasSlot, type SlotNode } from "@/lib/utils";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/**
 * The glyph, as an element, as every other shell takes it: `iconSlot={<Plug />}`. `icon`, the
 * component, is the older spelling, kept for one minor; a call site passes one or the other.
 */
type EmptyStateIcon =
  | {
      /**
       * The glyph over the title, as an element: `iconSlot={<Inbox />}`. The shell draws it in a
       * muted bubble and sizes and inks it, so pass a bare icon. Required for the centred block;
       * at `compact` it is optional, and drawn inline before the text.
       */
      iconSlot: SlotNode;
      /** @deprecated Pass the element as `iconSlot={<Plug />}`. */
      icon?: never;
    }
  | {
      iconSlot?: never;
      /** @deprecated Pass the element as `iconSlot={<Plug />}`. */
      icon: IconComponent;
    };

export type EmptyStateProps = {
  /**
   * What there is none of, as the reader would say it: "No agents yet". At `compact` it is the
   * whole line, so it can run on into what to do: "No servers yet. Add one to give the agent some
   * tools."
   */
  title: string;
  /**
   * What makes the first one: a New or an Add button. Under the text in the centred block, and
   * after it on the same line at `compact`.
   */
  actionSlot?: SlotNode;
  /** The root. Mostly for an inset: `px-2` lines the `compact` line up with a sidebar's rows. */
  className?: string | undefined;
} & (
  | ({
      /**
       * The one muted line that stands in for a short list *inside* something else — a card, a
       * sidebar section, a popover: "No labels yet." Off, it is the centred block that stands in
       * for a whole list or page. On, it keeps the left edge of what it sits in, draws no icon
       * bubble and no padding past a `py-2`, and takes no `description` and no `level`: a line
       * inside a region that already has its heading is never what a screen reader lands on. The
       * same word, for the same place, as `LoadState`'s `compact` — whose `emptySlot` it usually
       * is.
       */
      compact?: false | undefined;
      /**
       * One line under the title on what the list is for, or how it fills: "An agent runs the
       * lanes you give it."
       */
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
    } & EmptyStateIcon)
  | {
      compact: true;
      /** Optional here: drawn inline before the text, at the text's size, with no bubble. */
      iconSlot?: SlotNode;
      /** @deprecated Pass the element as `iconSlot={<Plug />}`. */
      icon?: IconComponent | undefined;
      description?: never;
      level?: never;
    }
);

// The web's descendant class; on device the context below sizes the glyph.
const COMPACT_ICON = "[&_svg]:size-4";

/**
 * The centred icon / title / description / action shown when a list is empty — or, at
 * `compact`, the one muted line shown when a short list inside a card or sidebar is.
 *
 * The block is drawn by `@cubeui/empty`'s parts, so shadcn's compound `Empty` and this one-line
 * form are the same empty state. The compact line is its own and uses none of their parts, but
 * its parts carry their names (`empty`, `empty-icon`, `empty-title`), so a selector reaching an
 * empty state from outside finds either form.
 *
 * The heading is `EmptyTitle`'s `level`: a heading on device, where VoiceOver and TalkBack
 * navigate by it, and an `<h1>`–`<h3>` on the web. With no `level` the title stays plain text on
 * both platforms.
 *
 * The compact line wraps rather than truncates: "No servers yet. Add one to give the agent some
 * tools." is a sentence someone has to read, and the action drops under it on a narrow column.
 */
export function EmptyState({
  icon: Icon,
  iconSlot,
  title,
  description,
  actionSlot,
  level,
  compact,
  className,
}: EmptyStateProps) {
  const glyph = iconSlot ?? (Icon ? <Icon /> : null);
  if (compact) {
    return (
      <div
        data-slot="empty"
        className={cn(
          "cube-rn-view",
          "w-full flex-row flex-wrap items-center gap-x-2 gap-y-1 py-2",
          className,
        )}
      >
        {hasSlot(glyph) === false ? null : (
          // At the text's size and ink: the context on device, the descendant class on the web,
          // where an icon takes `currentColor` and ignores the context.
          <div
            data-slot="empty-icon"
            aria-hidden
            className={cn("cube-rn-view", "shrink-0 text-foreground/60", COMPACT_ICON)}
          >
            <IconClassContext.Provider value="h-4 w-4 text-foreground/60">
              {glyph}
            </IconClassContext.Provider>
          </div>
        )}
        <span data-slot="empty-title" className="cube-rn-text shrink text-sm text-foreground/60">
          {title}
        </span>
        {actionSlot}
      </div>
    );
  }
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{glyph}</EmptyMedia>
        <EmptyTitle level={level}>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {actionSlot}
    </Empty>
  );
}
