import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  /**
   * The words of the label: "Upcoming", "Workspaces". The component puts the `Text` around them,
   * as every shell does with a `title`.
   */
  title?: ReactNode;
  /** `overline` is the smaller uppercase label; `default` is a plain section label. */
  variant?: "default" | "overline" | undefined;
  /**
   * The heading rank, when the label heads a section. `role="heading"` + `aria-level` on both
   * platforms: VoiceOver and TalkBack navigate by it on device, and on the web it is the same
   * heading to assistive technology — a `<span role="heading">` rather than an `<hN>`, because the
   * rank is a prop and the compiler writes the tag once.
   *
   * Left out, the label is plain text, which is what it was before this prop existed. A label over
   * a group of rows that a screen reader should be able to jump to wants one; a caption does not.
   */
  level?: 1 | 2 | 3 | 4 | 5 | 6 | undefined;
  /** The id a landmark's `aria-labelledby` points at, when the heading names one. */
  id?: string | undefined;
  /** The heading's `testID` / `data-slot`, so the shell drawing it can tell its own apart. */
  "data-slot"?: string | undefined;
  /** On the label's own `Text`: its size, a `truncate`. */
  className?: string | undefined;
  /** @deprecated Use `title`; this name goes in the next release. `title` wins. */
  children?: ReactNode;
};

/**
 * A small label over a group of content: a sidebar's group of rows, a run of cards.
 *
 * It is grey, the `/60` step, in both variants. It labels a group rather than titling a block, so
 * it stays quieter than the titles of the rows under it, which are in full ink (the heading
 * rhythm, #473). `Section` draws its title through this component and gives it the rhythm's
 * full-ink title instead.
 */
export function SectionHeading({
  title,
  variant = "default",
  level,
  id,
  "data-slot": testID,
  className,
  children,
}: SectionHeadingProps) {
  const label = title ?? children;
  const classes = cn(
    "font-semibold text-foreground/60",
    variant === "overline" ? "text-xs uppercase tracking-wide" : "text-sm",
    className,
  );

  // Two elements written out rather than one with a conditional role: a `role="heading"` with no
  // rank is not a heading the web can express, and the compiler refuses it for exactly that.
  if (level === undefined) {
    return (
      <span data-slot={testID} id={id} className={cn("cube-rn-text", classes)}>
        {label}
      </span>
    );
  }
  return (
    // biome-ignore lint/a11y/useSemanticElements: React Native has no heading element; role="heading" is the cross-platform form
    <span
      data-slot={testID}
      id={id}
      role="heading"
      aria-level={level}
      className={cn("cube-rn-text", classes)}
    >
      {label}
    </span>
  );
}
