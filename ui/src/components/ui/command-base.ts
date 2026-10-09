import { Children, isValidElement, type ReactNode } from "react";
import type { DialogProps } from "@/components/ui/dialog-base";

/**
 * How much an item matches the search: above `0` is shown, `0` is hidden. cmdk's own signature,
 * so one function serves both halves. `value` is the item's `value` (or its text), `keywords` its
 * `keywords`.
 */
export type CommandFilter = (value: string, search: string, keywords?: string[]) => number;

export type CommandProps = {
  /**
   * The search box's accessible name. cmdk renders it as a hidden `<label>` for its input; on
   * native it is the input's `aria-label`. A placeholder is not a name.
   */
  label?: string | undefined;
  /** Replaces the default match. See {@link CommandFilter}. */
  filter?: CommandFilter | undefined;
  /** Off, every item is drawn whatever is typed — for a caller filtering the list itself. */
  shouldFilter?: boolean | undefined;
  className?: string | undefined;
  children?: ReactNode;
};

export type CommandInputProps = {
  /** Controlled when passed: the search is this, and typing only calls `onValueChange`. */
  value?: string | undefined;
  onValueChange?: ((search: string) => void) | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  autoFocus?: boolean | undefined;
  className?: string | undefined;
};

export type CommandListProps = {
  /** The list's accessible name, as cmdk's `label`. Default {@link COMMAND_LIST_LABEL}. */
  label?: string | undefined;
  className?: string | undefined;
  children?: ReactNode;
};

/** Drawn only while no item matches the search. */
export type CommandEmptyProps = {
  className?: string | undefined;
  children?: ReactNode;
};

export type CommandGroupProps = {
  /** Drawn above the group's items, muted. A string is also the group's accessible name. */
  heading?: ReactNode;
  /** Draw the group even when none of its items match. Its items still filter themselves. */
  forceMount?: boolean | undefined;
  className?: string | undefined;
  children?: ReactNode;
};

export type CommandItemProps = {
  /**
   * What the filter matches and what `onSelect` is handed. Without it the item's text is used —
   * cmdk reads `textContent`, native the string children, however deeply nested. Pass it
   * whenever the row holds more than its name, or the badge beside the name is searched too.
   */
  value?: string | undefined;
  /** More words the filter matches — a synonym, an old name, a code. Never drawn. */
  keywords?: string[] | undefined;
  disabled?: boolean | undefined;
  /** Draw the item whatever the search is — a "Create …" row that must survive the filter. */
  forceMount?: boolean | undefined;
  /** The item was chosen: pressed on native; clicked, or Enter on the highlight, on the web. */
  onSelect?: ((value: string) => void) | undefined;
  className?: string | undefined;
  "aria-label"?: string | undefined;
  /** For a row that toggles — a multi-select's ✓. cmdk leaves it alone; see `MultiSelect`. */
  "aria-checked"?: boolean | undefined;
  "aria-describedby"?: string | undefined;
  children?: ReactNode;
};

/**
 * A rule between groups. Hidden from assistive technology on both halves: a `listbox` may hold
 * only options and groups, so cmdk's `role="separator"` inside one is an axe failure, and a line
 * between two headed groups says nothing the headings do not.
 */
export type CommandSeparatorProps = {
  /** Keep the rule while there is a search. By default it hides, as cmdk's does. */
  alwaysRender?: boolean | undefined;
  className?: string | undefined;
};

export type CommandShortcutProps = {
  className?: string | undefined;
  children?: ReactNode;
};

/** A `Command` in a `Dialog`: the palette. `title` and `description` name it and are not drawn. */
export type CommandDialogProps = DialogProps & {
  title?: string | undefined;
  description?: string | undefined;
  className?: string | undefined;
  showCloseButton?: boolean | undefined;
};

/** cmdk's own default name for its list. */
export const COMMAND_LIST_LABEL = "Suggestions";
/** The accessible name `CommandDialog` has unless it is given one. */
export const COMMAND_DIALOG_TITLE = "Command Palette";
/** The accessible description `CommandDialog` has unless it is given one. */
export const COMMAND_DIALOG_DESCRIPTION = "Search for a command to run...";

/**
 * The native half's default filter: every whitespace-separated word of the search appears
 * somewhere in the value or the keywords, ignoring case. `1` or `0`, because the native list is
 * not re-sorted — the order is the caller's.
 *
 * The same test `MultiSelect` hands cmdk, so a multi-select filters alike on both halves.
 */
export function matchesEveryWord(value: string, search: string, keywords?: string[]): number {
  const words = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return 1;
  }
  const target = [value, ...(keywords ?? [])].join(" ").toLocaleLowerCase();
  return words.every((word) => target.includes(word)) ? 1 : 0;
}

/**
 * An item's text, for when it has no `value`: its string and number children, however deeply
 * they sit, joined as `textContent` would join them. What cmdk reads from the DOM, read from the
 * element tree instead, because on native there is no DOM to read.
 */
export function commandItemText(children: ReactNode): string {
  const parts: string[] = [];
  const walk = (node: ReactNode) => {
    for (const child of Children.toArray(node)) {
      if (typeof child === "string" || typeof child === "number") {
        parts.push(String(child));
      } else if (isValidElement<{ children?: ReactNode }>(child)) {
        walk(child.props.children);
      }
    }
  };
  walk(children);
  return parts.join("").trim();
}
