import type { ReactNode } from "react";
import * as React from "react";
import { cn, type SlotNode } from "@/lib/utils";
import { HeadingRow } from "@/components/card-layout";
import { DescribedTitle, type DescriptionPlacement, foldsDescription } from "@/components/ui/description-hint";
import { SectionHeading } from "@/components/section-heading";

type SectionProps = {
  /** The body: the fields, the rows, whatever the heading is over. */
  contentSlot?: SlotNode | undefined;
  /** The overline. A short noun phrase — "Pomodoro", "Danger zone", "Notifications". */
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
  /** A hairline under the heading. Off by default; on, the group reads as one block. */
  divider?: boolean | undefined;
  /**
   * The title's heading rank. `2` by default, because a page's `PageHeader` owns the one `h1` and
   * these are the sections under it. A section nested in a section is `3`; a section in a dialog
   * whose title is the `h2` is `3` as well. Pick it by where the section sits, never by how big
   * the text should look — the text is the same size at every level.
   */
  level?: 1 | 2 | 3 | 4 | 5 | 6 | undefined;
  className?: string | undefined;
  titleClassName?: string | undefined;
  contentClassName?: string | undefined;
};

/**
 * A heading over a group of fields or rows, with the body in `contentSlot`. It draws no surface: a
 * titled group on a card is a `CardLayout`.
 *
 * The title is a heading of rank `level`, and on the web the root is a `<section>` named by it,
 * which makes it a `region` landmark. An untitled section has no name and is not a landmark. The
 * heading row is `CardLayout`'s and wraps: the action sits beside the text, level with the title's
 * top, while both fit, and drops under it when they do not.
 */
export function Section({
  contentSlot,
  title,
  description,
  descriptionPlacement = "inline",
  descriptionIconSlot,
  actionSlot,
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
      variant="overline"
      level={level}
      className={cn(
        // An overline in full ink: grey, it was outranked by the larger grey description under it.
        // Weight, caps and ink lead; the size stays small.
        "truncate text-foreground",
        folded && "min-w-0 shrink",
        titleClassName,
      )}
    >
      {title}
    </SectionHeading>
  ) : null;
  const hasText = Boolean(title || description);
  const hasHeading = Boolean(hasText || actionSlot);

  return (
    <section
      data-slot="section"
      {...(title ? { "aria-labelledby": titleId } : {})}
      {...(folded ? { "aria-describedby": descriptionId } : {})}
      className={cn("cube-rn-view", "min-w-0 gap-3", className)}
    >
      {hasHeading ? (
        // `CardLayout`'s heading row, so a section's heading and a card's line up the same way.
        <HeadingRow
          data-slot="section-heading"
          actionTestID="section-action"
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
                      className="cube-rn-text text-foreground/60 text-sm"
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
