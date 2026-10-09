import type { Ref } from "react";
import type { SlotNode } from "@/lib/utils";

/**
 * Everything but `text`, `number`, `password` and the four keyboard types falls back to plain text
 * entry off web.
 *
 * `password` is here because it is the one non-web type native implements properly:
 * `secureTextEntry` masks the field and tells the platform keyboard to leave it out of
 * autocorrect and the suggestion strip. `email`, `search`, `url` and `tel` raise the matching
 * keyboard on device — they are `inputMode`s there and real input types on web. `time`,
 * `datetime-local`, `date` and `color` are real DOM controls with no native counterpart, and
 * degrade to a text box.
 *
 * The web half takes every DOM input type on top of these (`input.web.tsx`), so a shadcn call site
 * with `type="checkbox"` or `type="file"` still compiles there; this list is the part that means
 * something on both platforms.
 */
export type InputType =
  | "text"
  | "number"
  | "password"
  | "email"
  | "search"
  | "url"
  | "tel"
  | "time"
  | "date"
  | "datetime-local"
  | "color";

/** The keyboard each type raises on native when the caller has not chosen one with `inputMode`. */
export const NATIVE_INPUT_MODE: Partial<Record<InputType, NonNullable<InputProps["inputMode"]>>> = {
  number: "numeric",
  email: "email",
  search: "search",
  url: "url",
  tel: "tel",
};

/**
 * What a caller may do to an input imperatively. `select` is web-only —
 * `TextInput` has no equivalent — so callers must treat it as optional.
 *
 * On web the ref is the `<input>` itself rather than an object built to this shape: an
 * `HTMLInputElement` already has both methods, so a `Ref<InputHandle>` is served by it, and a
 * shadcn call site holding a `useRef<HTMLInputElement>` gets the element it asked for.
 */
export type InputHandle = {
  focus: () => void;
  select?: () => void;
};

/**
 * What `onKeyPress` hands over: the key, as `nativeEvent.key`. React Native's
 * `TextInputKeyPressEvent` is this shape, and so is a React DOM keyboard event, whose
 * `nativeEvent` is the browser's `KeyboardEvent` — so one handler reads the key the same way on
 * both halves. Spelled structurally because this file ships to the web too, where there is no
 * react-native to import the type from.
 */
export type InputKeyPressEvent = { nativeEvent: { key: string } };

/**
 * A handler of that event, declared as a method so its parameter is checked bivariantly — the
 * trick React's own event handler types use. A native handler annotated
 * `(e: TextInputKeyPressEvent) => void` names a narrower event than this one and would otherwise
 * be refused, though it reads nothing that is not here.
 */
export type InputKeyPressHandler = {
  bivarianceHack(event: InputKeyPressEvent): void;
}["bivarianceHack"];

/**
 * What a field holds, said to the browser's autofill, a password manager and the keyboard's
 * suggestion strip. These are the names HTML's `autocomplete` and React Native's `autoComplete`
 * share, so one value means the same thing on both halves. The web half takes every DOM token on
 * top of them.
 */
export type InputAutoComplete =
  | "off"
  | "name"
  | "given-name"
  | "additional-name"
  | "family-name"
  | "honorific-prefix"
  | "honorific-suffix"
  | "nickname"
  | "username"
  | "email"
  | "current-password"
  | "new-password"
  | "one-time-code"
  | "organization"
  | "organization-title"
  | "street-address"
  | "address-line1"
  | "address-line2"
  | "postal-code"
  | "country"
  | "tel"
  | "url"
  | "cc-name"
  | "cc-number"
  | "cc-exp"
  | "cc-exp-month"
  | "cc-exp-year"
  | "cc-csc";

export type InputProps = {
  value?: string | undefined;
  /** Uncontrolled: where the text starts, when nothing above is holding `value`. */
  defaultValue?: string | undefined;
  onChangeText?: ((text: string) => void) | undefined;
  onBlur?: (() => void) | undefined;
  /** Enter on web, the return key on native. */
  onSubmitEditing?: (() => void) | undefined;
  /**
   * Every key as it goes down: React Native's `onKeyPress`. On device that is a hardware keyboard
   * and whatever the soft one reports; on the web half it fires from `keydown`, as
   * react-native-web's does, so it hears Escape and the arrows, which a DOM `keypress` never does.
   */
  onKeyPress?: InputKeyPressHandler | undefined;
  /**
   * Escape — the key a field answers with "put it back the way it was". Fires after any
   * `onKeyPress`, on both halves. A soft keyboard has no Escape key, so a touch-only screen still
   * needs its own way out (a blur, a cancel button).
   */
  onEscape?: (() => void) | undefined;
  placeholder?: string | undefined;
  type?: InputType | undefined;
  /**
   * Which keyboard to raise. Not the same knob as `type`: `type="number"` is what
   * gets the DOM spinners and the browser's numeric parsing, `inputMode="decimal"`
   * is what gets a phone keypad, and a number field wants both.
   */
  inputMode?: "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url" | undefined;
  /**
   * What the keyboard capitalises by itself. `none` for what is typed as written: a URL, a model
   * id, a shell command. Left out, the platform decides, which on a phone is `sentences`.
   */
  autoCapitalize?: "none" | "sentences" | "words" | "characters" | undefined;
  /**
   * Whether the keyboard rewrites what was typed. Off for an identifier, which it would "correct"
   * into a word. On the web it also switches the spelling underline, unless `spellCheck` says
   * otherwise there.
   */
  autoCorrect?: boolean | undefined;
  /**
   * What the field holds, so a saved address, a password manager's entry or a texted code is
   * offered for it: `email` on a sign-in, `one-time-code`, `street-address`. `type="email"` alone
   * does not say it. `off` asks for no suggestions.
   */
  autoComplete?: InputAutoComplete | undefined;
  maxLength?: number | undefined;
  /** Web only; the native keyboard has no equivalent constraint. */
  min?: number | undefined;
  max?: number | undefined;
  disabled?: boolean | undefined;
  /**
   * Shown and focusable, but not editable: the value is on its way somewhere. Unlike `disabled` it
   * keeps the focus it has, so the caret is still there when the field opens again.
   */
  readOnly?: boolean | undefined;
  className?: string | undefined;
  /**
   * Ties the control to its `<label>` on the web. React Native takes `id` as its `nativeID`, so on
   * device it is only a target for another element's `aria-labelledby`.
   */
  id?: string | undefined;
  /**
   * The accessible name, for an input no `<label>` points at — the time box beside
   * a date trigger. `TextInput` takes it on device, and react-native-web renders it.
   */
  "aria-label"?: string | undefined;
  /**
   * The accessible name by reference. The web honours a list of ids; Android reads one, and iOS
   * none, so a native caller that needs the name everywhere passes `aria-label` too.
   */
  "aria-labelledby"?: string | undefined;
  /**
   * What says more about the field — its hint, its error — by id. Web only: React Native has no
   * description relation, so on device the error is read where it is drawn.
   */
  "aria-describedby"?: string | undefined;
  /** The value was refused: a validator's error, a save that failed. Web only, as above. */
  "aria-invalid"?: boolean | "true" | "false" | undefined;
  autoFocus?: boolean | undefined;
  /**
   * An icon drawn inside the field at its start — a `<Search />`, a `<Clock />` — with the text
   * padded past it. Pass it bare: the input sizes it and mutes it, and it takes no pointer, so a
   * press on it lands in the field. Thirteen search boxes wrote this by hand as an absolute icon
   * and a `pl-8`, each with its own offset.
   */
  leadingSlot?: SlotNode | undefined;
  /**
   * The far end of the field, inside it: one icon-sized control, such as a clear button. The text
   * stops short of it. Unlike `leadingSlot` it is pressable, so give a button its own name.
   */
  trailingSlot?: SlotNode | undefined;
  /**
   * The class of the box that holds the field and its `leadingSlot` / `trailingSlot`, which only
   * exists when one of them is passed. `className` stays on the field itself, as it is on every
   * input, so size the pair here: `wrapperClassName="w-64"`.
   */
  wrapperClassName?: string | undefined;
  ref?: Ref<InputHandle> | undefined;
};

/**
 * The box a `leadingSlot` or `trailingSlot` is positioned in. Full width, as the field is on its
 * own.
 */
export const INPUT_WRAPPER_CLASS = "relative w-full min-w-0";

/**
 * Where `leadingSlot` sits: an icon-wide cell at the field's start, muted, never the press target.
 */
export const INPUT_LEADING_CLASS =
  "pointer-events-none absolute inset-y-0 left-0 flex w-9 flex-row items-center justify-center";

/** Where `trailingSlot` sits: the same cell at the far end, which does take a press. */
export const INPUT_TRAILING_CLASS =
  "absolute inset-y-0 right-0 flex w-9 flex-row items-center justify-center";

/** The icon inside either slot, handed down through `IconClassContext`: on device nothing inherits. */
export const INPUT_SLOT_ICON_CLASS = "size-4 shrink-0 text-foreground/60";

/** The text's padding past a slot, so it never runs under the icon. */
export const INPUT_LEADING_PAD_CLASS = "pl-9";
/** The text's padding before a trailing slot, so it never runs under the icon. */
export const INPUT_TRAILING_PAD_CLASS = "pr-9";

/** The input's box: border, background, height and type. */
export const INPUT_CLASS =
  "border-foreground/15 bg-background text-foreground placeholder:text-foreground/60 focus:border-active flex h-10 w-full rounded-md border px-3 py-2 text-sm focus:outline-none";
