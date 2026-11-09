import type { ReactNode } from "react";
import * as React from "react";
import {
  cn,
  HEADING_BODY_GAP,
  HEADING_DESCRIPTION,
  HEADING_TITLE,
  hasSlot,
  type SlotNode,
} from "@/lib/utils";
import { type ActionPlacement, HeadingRow } from "@/components/card-layout";
import { DescribedTitle, type DescriptionPlacement, foldsDescription } from "@/components/ui/description-hint";
import { SectionHeading } from "@/components/section-heading";

type SectionProps = {
  /** The body: the fields, the rows, whatever the heading is over. */
  contentSlot?: SlotNode | undefined;
  /**
   * What the group is called: a short noun phrase — "Pomodoro", "Danger zone", "Notifications".
   * Drawn as a card's title is, 14px semibold in full ink.
   */
  title?: ReactNode | undefined;
  /** One line under the title, in sentence case, on what the group is for. */
  description?: ReactNode | undefined;
  /**
   * Where the description is drawn. `inline` (the default) puts it under the title; `popover`
   * puts it behind a small button beside the title, named "About <title>", and on the web the
   * section is still described by it. A section with no title has nothing to put the button
   * beside, so its description stays inline.
   */
  descriptionPlacement?: DescriptionPlacement | undefined;
  /** The `popover` button's glyph. A question mark by default. */
  descriptionIconSlot?: SlotNode | undefined;
  /** The heading row's far end: an add button, a count, a switch that disables the group. */
  actionSlot?: SlotNode | undefined;
  /**
   * Where the action goes when the title and the action do not both fit on one line. `wrap` (the
   * default) moves the action under the title; `inline` keeps it beside the title and cuts the
   * title short with an ellipsis instead. `CardLayout`'s, so a section and a card agree.
   */
  actionPlacement?: ActionPlacement | undefined;
  /** A hairline under the heading. Off by default; on, the group reads as one block. */
  divider?: boolean | undefined;
  /**
   * The title's heading rank. `2` by default, because a page's `PageHeader` owns the one `h1` and
   * these are the sections under it. A section nested in a section is `3`; a section in a dialog
   * whose title is the `h2` is `3` as well. Pick it by where the section sits, never by how big
   * the text should look — the text is the same size at every level.
   */
  level?: 1 | 2 | 3 | 4 | 5 | 6 | undefined;
  /** On the whole section, the heading and its content together. */
  className?: string | undefined;
  /** On the title's own `Text`: its size, its colour. */
  titleClassName?: string | undefined;
  /** On the box that holds `contentSlot`, under the heading. */
  contentClassName?: string | undefined;
};

/**
 * The title held to one line on device, for an `inline` action: `truncate` is the ellipsis on the
 * web, and on device it is `numberOfLines`, which is what `line-clamp-1` becomes.
 */
const ONE_LINE_ON_DEVICE = undefined;

/**
 * A heading over a group of fields or rows, with the body in `contentSlot`. It draws no surface: a
 * titled group on a card is a `CardLayout`.
 *
 * The title is a heading of rank `level`, and on the web the root is a `<section>` named by it,
 * which makes it a `region` landmark. An untitled section has no name and is not a landmark. The
 * heading row is `CardLayout`'s and wraps: the action sits beside the text, level with the title's
 * top, while both fit, and drops under it when they do not, unless `actionPlacement` is `inline`.
 */
export function Section({
  contentSlot,
  title,
  description,
  descriptionPlacement = "inline",
  descriptionIconSlot,
  actionSlot,
  actionPlacement = "wrap",
  divider = false,
  level = 2,
  className,
  titleClassName,
  contentClassName,
}: SectionProps) {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const folded = foldsDescription(title, description, descriptionPlacement);
  const titleNode = title ? (
    <SectionHeading
      data-slot="section-title"
      id={titleId}
      level={level}
      title={title}
      className={cn(
        // The heading rhythm's title, as a card's is (#473): it was a 12px caps overline, a third
        // type scale beside the card's and the rows'. Weight and ink lead the description under
        // it, which is the same size.
        HEADING_TITLE,
        "truncate",
        (folded || actionPlacement === "inline") && "min-w-0 shrink",
        actionPlacement === "inline" && ONE_LINE_ON_DEVICE,
        titleClassName,
      )}
    />
  ) : null;
  const hasText = hasSlot(title) || hasSlot(description);
  const hasHeading = hasText || hasSlot(actionSlot);

  return (
    <section
      data-slot="section"
      {...(title ? { "aria-labelledby": titleId } : {})}
      {...(folded ? { "aria-describedby": descriptionId } : {})}
      // The heading's 24px over the body, as a card's, past the 16px between the rows in it.
      className={cn("cube-rn-view", "min-w-0", HEADING_BODY_GAP, className)}
    >
      {hasHeading ? (
        // `CardLayout`'s heading row, so a section's heading and a card's line up the same way.
        <HeadingRow
          data-slot="section-heading"
          actionTestID="section-action"
          actionPlacement={actionPlacement}
          className={divider ? "border-b border-foreground/10 pb-1" : undefined}
          textSlot={
            hasText ? (
              <DescribedTitle
                titleSlot={titleNode}
                label={title}
                description={description}
                descriptionSlot={
                  description ? (
                    <p
                      data-slot="section-description"
                      className={cn("cube-rn-text", HEADING_DESCRIPTION)}
                    >
                      {description}
                    </p>
                  ) : null
                }
                descriptionId={descriptionId}
                folded={folded}
                fallbackName="About this section"
                iconSlot={descriptionIconSlot}
                triggerTestID="section-description-trigger"
                rowTestID="section-title-row"
              />
            ) : null
          }
          actionSlot={actionSlot}
        />
      ) : null}

      {hasSlot(contentSlot) ? (
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
