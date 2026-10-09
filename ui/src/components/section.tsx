import type { ReactNode } from "react";
import * as React from "react";
import { cn, type SlotNode } from "@/lib/utils";

type SectionProps = {
  /** The body: the fields, the rows, whatever the heading is over. */
  contentSlot?: SlotNode | undefined;
  /** The overline. A short noun phrase — "Pomodoro", "Danger zone", "Notifications". */
  title?: ReactNode | undefined;
  /** One line under the title, in sentence case, on what the group is for. */
  description?: ReactNode | undefined;
  /** The heading row's far end: an add button, a count, a switch that disables the group. */
  actionSlot?: SlotNode | undefined;
  /** A hairline under the heading. Off by default; on, the group reads as one block. */
  divider?: boolean | undefined;
  /**
   * The title's heading rank. `2` by default, because a page's `PageHeader` owns the one `h1` and
   * these are the sections under it. A section nested in a section is `3`; a section in a dialog
   * whose title is the `h2` is `3` as well. Pick it by where the section sits, never by how big
   * the text should look — the text is the same size at every level.
   */
  level?: 1 | 2 | 3 | 4 | 5 | 6 | undefined;
  /**
   * `card` draws the group on a card: the border, background and shadow `Card` has, with the
   * padding inside it. `none` (the default) is a label and a gap and nothing else.
   */
  surface?: "none" | "card" | undefined;
  className?: string | undefined;
  titleClassName?: string | undefined;
  contentClassName?: string | undefined;
};

/**
 * The title and description. `basis-48` is the floor the heading row wraps on: the text asks for
 * 12rem — `SettingRow`'s number, for the same two sizes of type — and an action that cannot sit
 * beside that much drops to its own line. A basis rather than a `min-w`, so in a column narrower
 * than the floor the text still shrinks to it instead of running out of the section.
 */
const TEXT = "min-w-0 flex-1 basis-48";

/**
 * The action. It never shrinks, which is what keeps one button or a badge at its own width and
 * where it always sat. `max-w-full` is for the action wider than the section: on a line of its
 * own it is held to the section's width, so what is in it wraps — a fragment of buttons on this
 * row, a caller's own row inside it — rather than running out past the edge.
 */
const ACTION = "max-w-full shrink-0 flex-row flex-wrap items-center gap-2";

/**
 * What makes the caller's own row wrap in a browser. A flex item's width there starts from its
 * content, and a react-native-web view does not shrink, so a `flex-row flex-wrap` view handed in
 * as the action stayed as wide as its buttons and ran out of the section. Yoga measures a child
 * against the width its parent has, so the device needs nothing — and NativeWind has no child
 * selector to give it.
 */
const ACTION_FIT = "[&>*]:max-w-full";

/**
 * A heading over a group of fields or rows, with the body in `contentSlot`. The surface is a prop
 * rather than a wrapper, so an app that puts every section on a card does not rewrite this one.
 *
 * The title is a heading of rank `level`, and on the web the root is a `<section>` named by it,
 * which makes it a `region` landmark. An untitled section has no name and is not a landmark. The
 * heading row wraps: the action sits beside the text while both fit and drops under it when they
 * do not.
 */
export function Section({
  contentSlot,
  title,
  description,
  actionSlot,
  divider = false,
  level = 2,
  surface = "none",
  className,
  titleClassName,
  contentClassName,
}: SectionProps) {
  const titleId = React.useId();
  const hasText = Boolean(title || description);
  const hasHeading = Boolean(hasText || actionSlot);

  return (
    <section
      data-slot="section"
      {...(title ? { "aria-labelledby": titleId } : {})}
      className={cn(
        "cube-rn-view",
        "min-w-0 gap-3",
        surface === "card" &&
          "rounded-lg border border-foreground/10 bg-secondary p-4 text-foreground shadow-sm",
        className,
      )}
    >
      {hasHeading ? (
        <div
          data-slot="section-heading"
          className={cn(
            "cube-rn-view",
            "min-w-0 flex-row flex-wrap items-center gap-2",
            // With no text there is no column to push the action along, so the row does it.
            hasText === false && "justify-end",
            divider && "border-b border-foreground/10 pb-1",
          )}
        >
          {hasText ? (
            <div className={cn("cube-rn-view", TEXT)}>
              {title ? (
                // biome-ignore lint/a11y/useSemanticElements: React Native has no heading element; role="heading" is the cross-platform form
                <span
                  data-slot="section-title"
                  id={titleId}
                  role="heading"
                  aria-level={level}
                  className={cn(
                    "cube-rn-text",
                    "truncate font-semibold text-foreground/60 text-xs uppercase tracking-wider",
                    titleClassName,
                  )}
                >
                  {title}
                </span>
              ) : null}
              {description ? (
                <p
                  data-slot="section-description"
                  className="cube-rn-text mt-1 text-foreground/60 text-sm"
                >
                  {description}
                </p>
              ) : null}
            </div>
          ) : null}
          {actionSlot ? (
            <div data-slot="section-action" className={cn("cube-rn-view", ACTION, ACTION_FIT)}>
              {actionSlot}
            </div>
          ) : null}
        </div>
      ) : null}

      {contentSlot ? (
        <div
          data-slot="section-content"
          className={cn("cube-rn-view", "min-w-0 gap-4", contentClassName)}
        >
          {contentSlot}
        </div>
      ) : null}
    </section>
  );
}
