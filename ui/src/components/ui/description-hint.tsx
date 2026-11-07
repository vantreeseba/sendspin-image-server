import type { ReactNode } from "react";
import type { SlotNode } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CircleQuestionMark } from "@/components/ui/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Where a description is drawn: under what it describes, or behind a button beside its title. */
type DescriptionPlacement = "inline" | "popover";

type DescriptionHintProps = {
  /** The sentence the pane shows. */
  description: ReactNode;
  /**
   * What the description is about: the field's label, the card's title. A string names the
   * button and the pane "About <label>"; anything else falls back to `fallbackName`.
   */
  label?: ReactNode | undefined;
  /** The name when `label` is not a string: "About this field", "About this card". */
  fallbackName: string;
  /** The button's glyph. A question mark by default. */
  iconSlot?: SlotNode | undefined;
  /** The button's `testID` / `data-slot`, so each shell's trigger can be told apart. */
  "data-slot"?: string | undefined;
};

/** The button and the pane it opens. Place it beside the title, never inside the title's text. */
function DescriptionHint({
  description,
  label,
  fallbackName,
  iconSlot,
  "data-slot": testID,
}: DescriptionHintProps) {
  // One name for both: the web pane is a `dialog`, and a dialog with no name is announced as
  // just that. The paragraph inside it is the description, not the name.
  const name = typeof label === "string" ? `About ${label}` : fallbackName;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          data-slot={testID}
          variant="ghost"
          size="icon-xs"
          aria-label={name}
          // The row is as tall as its title, not as tall as a button: the margin gives back what
          // the button's box adds, so a title with a hint and one without sit on the same line.
          className="-my-1 shrink-0 rounded-full text-foreground/60"
          iconSlot={iconSlot ?? <CircleQuestionMark aria-hidden />}
        />
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={name} className="max-w-xs">
        <span className="cube-rn-text text-foreground text-sm leading-relaxed">{description}</span>
      </PopoverContent>
    </Popover>
  );
}

type DescriptionHintTextProps = {
  /** The id the control's `aria-describedby` points at. */
  id?: string | undefined;
  children: ReactNode;
};

/**
 * The description, off the screen and still read, for `aria-describedby` to reach while the
 * pane is shut: a popover's content is unmounted on close, so a description living only there is
 * one a screen reader never meets. Web only. A device has no `aria-describedby` to resolve, and
 * hidden text there is text VoiceOver stops on between the label and the control.
 */
function DescriptionHintText({ id, children }: DescriptionHintTextProps) {
  return (
    <span data-slot="description-hint-text" id={id} className="cube-rn-text sr-only">
      {children}
    </span>
  );
}

/**
 * Whether a description folds behind a button: only when asked to, and only when there is a title
 * to put the button beside.
 *
 * @param title - What the description is about.
 * @param description - The sentence that would fold.
 * @param placement - Where the caller asked for it.
 * @returns `true` when the description goes behind a `DescriptionHint`.
 */
function foldsDescription(
  title: ReactNode,
  description: ReactNode,
  placement: DescriptionPlacement,
): boolean {
  return Boolean(title && description) && placement === "popover";
}

type DescribedTitleProps = {
  /** The heading the shell draws: a `CardTitle`, an overline. Absent, nothing is drawn for it. */
  titleSlot: SlotNode;
  /** The title's words, which name the button "About <label>". */
  label: ReactNode;
  /** Drawn before the title in the same row: a card's icon. */
  leadingSlot?: SlotNode | undefined;
  /** The sentence behind the button when folded. */
  description: ReactNode;
  /** The inline description the shell draws when it is not folded. */
  descriptionSlot?: SlotNode | undefined;
  /** The id the shell's `aria-describedby` points at, while folded. */
  descriptionId?: string | undefined;
  /** Whether the description is behind the button. {@link foldsDescription} decides it. */
  folded: boolean;
  /** The button's name when `label` is not a string: "About this card". */
  fallbackName: string;
  /** The button's glyph. A question mark by default. */
  iconSlot?: SlotNode | undefined;
  /** The button's `testID` / `data-slot`. */
  triggerTestID?: string | undefined;
  /** The title row's `testID` / `data-slot`. */
  rowTestID?: string | undefined;
};

/**
 * A shell's title with its description, folded or not. Folded, the button sits beside the title
 * in one row and the text is left where the inline description would be, off the screen; not
 * folded, the shell's own inline description is drawn there instead.
 */
function DescribedTitle({
  titleSlot,
  label,
  leadingSlot,
  description,
  descriptionSlot,
  descriptionId,
  folded,
  fallbackName,
  iconSlot,
  triggerTestID,
  rowTestID,
}: DescribedTitleProps) {
  const hasRow = Boolean(titleSlot) && Boolean(folded || leadingSlot);
  return (
    <>
      {hasRow ? (
        // Beside the title and not inside it: a heading is a `Text`, and a view inside a `Text`
        // is not something the device lays out.
        <div data-slot={rowTestID} className="cube-rn-view min-w-0 flex-row items-center gap-2">
          {leadingSlot}
          {titleSlot}
          {folded ? (
            <DescriptionHint
              data-slot={triggerTestID}
              label={label}
              fallbackName={fallbackName}
              description={description}
              iconSlot={iconSlot}
            />
          ) : null}
        </div>
      ) : (
        titleSlot
      )}
      {folded ? <DescriptionHintText id={descriptionId}>{description}</DescriptionHintText> : null}
      {folded ? null : descriptionSlot}
    </>
  );
}

export type {
  DescribedTitleProps,
  DescriptionHintProps,
  DescriptionHintTextProps,
  DescriptionPlacement,
};
export { DescribedTitle, DescriptionHint, DescriptionHintText, foldsDescription };
