import type { ReactNode } from "react";

/** One choice in a select. */
export type SelectOption = {
  label: ReactNode;
  value: string;
  /**
   * The heading this option is drawn under. Options sharing one are drawn together beneath it,
   * in the order they were given rather than sorted — a board's lanes are ordered, and
   * alphabetical would be wrong.
   */
  group?: string | undefined;
  /**
   * The row's class, on the `SelectItem` itself. The only way in before this was to wrap the
   * label, which styles the text and leaves the row's padding, tick and highlight in the body
   * face — and model ids, SHA prefixes and file paths are `font-mono` because they are
   * identifiers. `llama3.1:8b` beside `gpt-4o-mini` in prose is a list of sentences.
   */
  className?: string | undefined;
  /**
   * Extra words a `searchable` select matches — a synonym, an old name, a provider. A label that
   * is not a string cannot be searched, so an option with one is found by these and its `value`.
   */
  keywords?: string[] | undefined;
  /** The row cannot be chosen. Say why in `hint`: a greyed row on its own reads as a bug. */
  disabled?: boolean | undefined;
  /**
   * A CSS colour: a dot on the row, and the fill of the chip in a `multiple` combobox. The text
   * on the chip is chosen for contrast, not hardcoded. Read by `Combobox`'s search menu.
   */
  color?: string | undefined;
  /**
   * The end of the row: a status badge, a count, a date. Drawn beside the label, never on the
   * chip. Read by `Combobox`'s search menu.
   *
   * A description rather than a name, so a row still announces as what it is called and the
   * badge is read after it. `color` cannot do this job: it is the chip's colour, and pointing it
   * at a status would mint a second colour vocabulary beside the app's own.
   */
  meta?: ReactNode | undefined;
  /**
   * Why this option is the way it is, most often why it is unavailable. Read by `Combobox`'s
   * search menu.
   *
   * Drawn under the label and read after it, so it survives the case it is for: a `disabled` row
   * fires no hover, so a tooltip on it is text nobody can reach. The reason is knowable when the
   * options are built and unreachable by the time somebody wonders.
   */
  hint?: ReactNode | undefined;
};

/** A rule across the list. An entry that is not an option, so it has no `value`. */
export type SelectSeparatorEntry = { separator: true };

/**
 * A row that says something about the list rather than offering a choice: *Loading…*, or why
 * the fetch failed.
 *
 * **It is not a disabled option.** That is the workaround every hand-written version reaches for,
 * and it is a row the keyboard still walks onto and a reader still hears as a choice — one they
 * are told they may not have — when it was never a choice at all.
 *
 * So the row itself is `aria-hidden`, because a listbox may own only options and groups and axe
 * is right to say so; it is radix's own reason for hiding its separator. The words are announced
 * from an `sr-only` live region beside the control instead, always mounted — a live region added
 * to the document in the same breath as its text is announced unreliably or not at all, and the
 * whole case here is that the menu opens *before* the list exists. Same argument as
 * `Button`'s `hint`.
 *
 * `className` because the two of these are rarely the same colour — a wait is muted and a
 * failure is not.
 */
export type SelectNoteEntry = { note: ReactNode; className?: string | undefined };

/**
 * What `options` holds: the options, and the rules between them.
 *
 * A list of peers is still a list of peers — nothing here is written until an option is not one.
 * The case that asked for it: a picker answering "where does this card go when it passes" with
 * *stay here*, then the other lanes, then *archive it*, which is not a lane at all. Without a
 * rule the last row sits flush against the lane names and reads as one of them, and the
 * workaround is a sentence doing a divider's job — `"Archive it — off the board"`.
 *
 * A note is the same argument for a row that is not a choice: once `{ separator: true }` proved
 * the list can hold an entry that is not an option, a menu that is still loading has somewhere
 * to say so.
 */
export type SelectEntry = SelectOption | SelectSeparatorEntry | SelectNoteEntry;

/**
 * Tells a rule from the other entries.
 *
 * @typeParam T - The entry, so the same test sorts a raw list and the blocks built from one.
 * @param entry - An entry of the list, or a block built from it.
 * @returns true for `{ separator: true }`.
 */
export function isSeparator<T extends object>(entry: T): entry is T & SelectSeparatorEntry {
  return "separator" in entry;
}

/**
 * Tells a note from the other entries.
 *
 * @typeParam T - The entry, as on {@link isSeparator}.
 * @param entry - An entry of the list, or a block built from it.
 * @returns true for a `{ note }` row.
 */
export function isNote<T extends object>(entry: T): entry is T & SelectNoteEntry {
  return "note" in entry;
}

/** One run of the list as a menu draws it: a rule, a note, or the options under one heading. */
export type SelectBlock =
  | SelectSeparatorEntry
  | SelectNoteEntry
  | { group?: string | undefined; options: SelectOption[] };

/**
 * Walks the flat list into the runs a menu draws.
 *
 * @param entries - The list, in the caller's order.
 * @returns A block per rule and per note, and one per run of options sharing a `group`.
 *
 * @remarks
 * Walked rather than bucketed, because the order is the caller's and a group that reappears
 * later is a caller who meant it. Options with no `group` are a block with no heading, which is
 * every list that has not asked for one.
 */
export function blocksOf(entries: readonly SelectEntry[]): SelectBlock[] {
  const blocks: SelectBlock[] = [];
  for (const entry of entries) {
    if (isSeparator(entry) || isNote(entry)) {
      blocks.push(entry);
      continue;
    }
    const last = blocks.at(-1);
    // `"options" in last` rather than two negations: it is the shape being asked for.
    if (last && "options" in last && last.group === entry.group) {
      last.options.push(entry);
    } else {
      blocks.push({ group: entry.group, options: [entry] });
    }
  }
  return blocks;
}

/**
 * An option as words: what a search matches, what a chip says, and what a typed name is compared
 * with. A label that is a node has none, so its value stands in.
 *
 * @param option - The option.
 * @returns The label when it is a string, and the value otherwise.
 */
export function optionText(option: SelectOption): string {
  return typeof option.label === "string" ? option.label : option.value;
}

/**
 * The list to draw, with an option synthesised for every held value nothing covers.
 *
 * @typeParam T - The list's entries.
 * @param options - The caller's list.
 * @param value - The values held.
 * @returns The list, followed by one option per value it does not have, labelled with the value.
 *
 * @remarks
 * A row loaded from the server holds ids; the options come from a query that may not have
 * finished, may be paged, or may no longer contain a tag someone deleted. Without this the chip
 * for that value is not drawn at all: invisible, still submitted, and unremovable.
 */
export function withOrphanOptions<T extends SelectEntry>(
  options: readonly T[],
  value: readonly string[],
): (T | SelectOption)[] {
  const known = new Set(
    options.flatMap((entry) => ("value" in entry ? [(entry as SelectOption).value] : [])),
  );
  const orphans = value.filter((held) => known.has(held) === false);
  return [...options, ...orphans.map((held) => ({ value: held, label: held }))];
}

/**
 * Whether a typed name is worth offering to create.
 *
 * @param name - What was typed.
 * @param options - The list it would be added to.
 * @returns false for an empty name and for one an option already has.
 *
 * @remarks
 * Exact match only, ignoring case and surrounding space. Not a substring test: "Work" must stay
 * addable while "Workshop" exists.
 */
export function isAddableOptionName(name: string, options: readonly SelectEntry[]): boolean {
  const folded = name.trim().toLocaleLowerCase();
  if (folded === "") {
    return false;
  }
  return options.every(
    (entry) =>
      "value" in entry === false ||
      optionText(entry as SelectOption)
        .trim()
        .toLocaleLowerCase() !== folded,
  );
}

/**
 * What the row for "nothing" carries inside a menu. A menu's rows are told apart by a string, and
 * radix refuses an item whose value is `""`, so the row needs one of its own. It stays in this
 * file: a field translates on the way in and on the way out, and a caller only ever sees `null`.
 */
const UNSET = "__cubeui_unset__";

/**
 * Puts the row for "nothing" at the top of a list.
 *
 * @typeParam T - The list's entries, so a list without notes stays one.
 * @param options - The caller's list.
 * @param emptyLabel - What that row says, and so what the trigger reads while nothing is chosen.
 * @returns The list with the row ahead of it, in a run of its own unless the list opens ungrouped.
 */
export function withEmptyOption<T extends SelectEntry>(
  options: readonly T[],
  emptyLabel: string,
): readonly (T | SelectOption)[] {
  return [{ label: emptyLabel, value: UNSET }, ...options];
}

/**
 * The stored value, as the menu of a clearable select holds it.
 *
 * @param value - What the field holds.
 * @returns The row to mark chosen: the one for "nothing" for `null`, `undefined` and `""`.
 */
export function menuValueOf(value: string | null | undefined): string {
  return value === null || value === undefined || value === "" ? UNSET : value;
}

/**
 * The row a clearable select's menu reported, as the value to store.
 *
 * @param menuValue - The value of the row chosen.
 * @returns `null` for the row for "nothing", and the option's own value for the rest.
 */
export function storedValueOf(menuValue: string): string | null {
  return menuValue === UNSET ? null : menuValue;
}
