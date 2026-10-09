import type { ReactNode } from "react";

export type SelectProps = {
  /** Controlled when passed; otherwise the select holds its own, starting at `defaultValue`. */
  value?: string | undefined;
  defaultValue?: string | undefined;
  onValueChange?: ((value: string) => void) | undefined;
  disabled?: boolean | undefined;
  /**
   * Whether the menu is open, and being told when that changes.
   *
   * Uncontrolled unless `open` is passed, so `onOpenChange` on its own is a caller who wants to
   * *know* rather than to drive — which is the case that asked for this. A list the server owns
   * should be fetched when the menu opens rather than when the screen mounts, and the opening is
   * the one thing only this component knows.
   */
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  children: ReactNode;
};

/**
 * The trigger takes the wiring a bound field hands its control.
 *
 * This is the subset that means the same thing on both platforms: React Native takes
 * `id` and the `aria-*` props as cross-platform props. The web half's trigger is radix's,
 * a real `<button>`, and takes every attribute one does plus shadcn's `size`.
 */
export type SelectTriggerProps = {
  id?: string | undefined;
  disabled?: boolean | undefined;
  "aria-labelledby"?: string | undefined;
  "aria-describedby"?: string | undefined;
  "aria-invalid"?: boolean | undefined;
  "aria-required"?: boolean | undefined;
  "aria-label"?: string | undefined;
  className?: string | undefined;
  onBlur?: (() => void) | undefined;
  children: ReactNode;
};

export type SelectValueProps = {
  placeholder?: string | undefined;
  children?: ReactNode;
};

export type SelectContentProps = {
  className?: string | undefined;
  children: ReactNode;
};

export type SelectItemProps = {
  value: string;
  /** Shown, and skipped: it cannot be chosen. */
  disabled?: boolean | undefined;
  className?: string | undefined;
  children: ReactNode;
};

/** `SelectScrollUpButton` and `SelectScrollDownButton`. Web only in effect: see above. */
export type SelectScrollButtonProps = {
  className?: string | undefined;
  children?: ReactNode;
};

export type SelectGroupProps = {
  children: ReactNode;
};

export type SelectLabelProps = {
  className?: string | undefined;
  children: ReactNode;
};

export type SelectSeparatorProps = {
  className?: string | undefined;
};

/** The select trigger's box, which matches an input's. */
export const SELECT_TRIGGER_CLASS =
  "border-foreground/15 bg-background h-10 w-full flex-row items-center justify-between rounded-md border px-3 py-2";
/** The type of the chosen value in the trigger. */
export const SELECT_TRIGGER_TEXT_CLASS = "text-foreground text-sm";
/** One option's row, with room at its start for the tick. */
export const SELECT_ITEM_CLASS = "w-full flex-row items-center rounded-sm py-1.5 pl-8 pr-2";
/** The type of an option's label. */
export const SELECT_ITEM_TEXT_CLASS = "text-sm text-foreground";
/** The heading over a group of options. */
export const SELECT_LABEL_CLASS = "px-2 py-1.5 text-foreground/60 text-xs";
/** The rule between groups of options. */
export const SELECT_SEPARATOR_CLASS = "-mx-1 my-1 h-px bg-foreground/10";
