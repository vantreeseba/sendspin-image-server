import type { Ref } from "react";

/**
 * What a caller may do to the box imperatively: put the caret back after a send. On the web the
 * ref is the `<textarea>` itself, which has `focus`, as `InputHandle` is the `<input>` there.
 */
export type TextareaHandle = { focus: () => void };

/**
 * What `onKeyPress` hands over, as on `Input`: the key, as `nativeEvent.key`. The other two are
 * what Enter-to-send reads, and only a keyboard with a Shift to hold reports them, so they are
 * there on the web and absent on a device. Declared here and not taken from `input-base.ts`, so
 * this item installs without that one.
 */
export type TextareaKeyPressEvent = {
  nativeEvent: {
    key: string;
    shiftKey?: boolean | undefined;
    isComposing?: boolean | undefined;
  };
};

/** A handler of that event, as a method so a narrower native handler is still accepted. */
export type TextareaKeyPressHandler = {
  bivarianceHack(event: TextareaKeyPressEvent): void;
}["bivarianceHack"];

/**
 * Whether a key sends. Enter alone: Shift+Enter is a new line, and an Enter that only accepts
 * an input method's suggestion is still someone part-way through a word.
 */
export function isSubmitKey({
  key,
  shiftKey,
  isComposing,
}: TextareaKeyPressEvent["nativeEvent"]): boolean {
  return key === "Enter" && shiftKey !== true && isComposing !== true;
}

/** Where the caret is, as offsets into the text. A caret with nothing selected has the two equal. */
export type TextareaSelection = { start: number; end: number };

export type TextareaProps = {
  value?: string | undefined;
  /** Uncontrolled: where the text starts, when nothing above is holding `value`. */
  defaultValue?: string | undefined;
  onChangeText?: ((text: string) => void) | undefined;
  onBlur?: (() => void) | undefined;
  /**
   * Enter without Shift, which is what sends a chat message; Shift+Enter is still a new line.
   * Where there is a Shift to hold, that is: the web, an Expo app's web build included. On a
   * device the return key adds a line, as it does in every messaging app, and a send button is
   * the way out.
   */
  onSubmitEditing?: (() => void) | undefined;
  /**
   * Holds the caret, as `TextInput`'s does: the way to put it after a name a completion has just
   * inserted. Controlled, so keep it in step from `onSelectionChange` or it pins the caret.
   */
  selection?: TextareaSelection | undefined;
  /**
   * The caret moved, or the selection changed: by a key, a click, or the text changing under it.
   * What an `@mention` menu reads to find the word the caret is in, wherever in the note that is.
   */
  onSelectionChange?: ((selection: TextareaSelection) => void) | undefined;
  /** Every key as it goes down, as on `Input`. */
  onKeyPress?: TextareaKeyPressHandler | undefined;
  /** Escape, after any `onKeyPress`. A soft keyboard has no such key. */
  onEscape?: (() => void) | undefined;
  placeholder?: string | undefined;
  /**
   * Visible lines; the box grows no further and scrolls instead. With `maxRows` it is where the
   * box starts, one line when left out.
   */
  rows?: number | undefined;
  /**
   * Makes the box grow with its text: from `rows` up to this many lines, and scrolling past
   * them. A chat composer is `rows={1} maxRows={6}`. It shrinks again when the text does, so a
   * message that was sent leaves a one-line box behind.
   */
  maxRows?: number | undefined;
  maxLength?: number | undefined;
  disabled?: boolean | undefined;
  /** Takes focus when it mounts, as `Input`'s does: a reply box that opens ready to type in. */
  autoFocus?: boolean | undefined;
  className?: string | undefined;
  /** Web only: ties the control to its `<label>`. */
  id?: string | undefined;
  ref?: Ref<TextareaHandle> | undefined;
};

/** A line of `text-sm`, and the `py-2` above and below the text, in pixels. */
const LINE_HEIGHT = 20;
const PADDING = 16;

/** How tall the box is at a number of rows, border left out. */
export function rowsHeight(rows: number): number {
  return rows * LINE_HEIGHT + PADDING;
}

/** The part of a `<textarea>` that `fitRows` reads and writes. */
export type GrowingBox = {
  style: { height: string; overflowY: string };
  scrollHeight: number;
  offsetHeight: number;
  clientHeight: number;
};

/**
 * Sizes a `<textarea>` to its text, held between two numbers of rows.
 *
 * The height is let go first, because `scrollHeight` is never less than the box: a box left at
 * six lines would report six lines for ever, and never shrink after a send. The scrollbar is
 * only allowed once the cap is reached, so it does not flash in and out as a line is added.
 */
export function fitRows(box: GrowingBox, minRows: number, maxRows: number): void {
  const border = box.offsetHeight - box.clientHeight;
  box.style.height = "auto";
  const text = box.scrollHeight;
  const max = rowsHeight(Math.max(minRows, maxRows));
  const height = Math.min(Math.max(text, rowsHeight(minRows)), max);
  box.style.height = `${height + border}px`;
  box.style.overflowY = text > max ? "auto" : "hidden";
}

/**
 * The placeholder colour rides here as a `placeholder:` variant, the same way
 * `INPUT_CLASS` does it. NativeWind 4's `placeholderClassName` prop is gone in
 * 5; the variant compiles to `placeholderTextColor` on device and to a real
 * `::placeholder` rule on web.
 */
export const TEXTAREA_CLASS =
  "border-foreground/15 bg-background text-foreground placeholder:text-foreground/60 focus:border-active min-h-[80px] w-full rounded-md border px-3 py-2 text-sm focus:outline-none";
