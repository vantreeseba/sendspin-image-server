import {
  type ComponentPropsWithoutRef,
  type HTMLInputTypeAttribute,
  type KeyboardEventHandler,
  type MouseEvent,
  type Ref,
  useId,
} from "react";
import {
  INPUT_ADDON_BOX_CLASS,
  INPUT_ADDON_FIELD_CLASS,
  INPUT_ADDON_SLOT_CLASS,
  INPUT_ADDON_TEXT_CLASS,
  INPUT_CLASS,
  INPUT_LEADING_CLASS,
  INPUT_LEADING_PAD_CLASS,
  INPUT_TRAILING_CLASS,
  INPUT_TRAILING_PAD_CLASS,
  INPUT_WRAPPER_CLASS,
  type InputAutoComplete,
  type InputHandle,
  type InputKeyPressEvent,
  type InputKeyPressHandler,
  type InputType,
  type InputProps as SharedInputProps,
} from "@/components/ui/input-base";
import { cn } from "@/lib/utils";

/**
 * The shared contract, widened to everything a DOM `<input>` takes.
 *
 * `onBlur`, `min`/`max`, `value` and `defaultValue` take the DOM's wider types — a `() => void` is
 * still one, and a `string` is still a `string | number | readonly string[]` — and `type` is every
 * DOM input type, of which `InputType` is the cross-platform part. `onKeyPress` hands over the
 * React keyboard event, which is a shared handler's `{ nativeEvent: { key } }` and a shadcn call
 * site's `e.key` at once. `autoCapitalize` keeps the DOM's wider set, and `autoCorrect` is the
 * shared boolean or the DOM's `"on"` / `"off"`. `autoComplete` keeps the DOM's wider set too, of
 * which `InputAutoComplete` is the part a device also understands.
 */
export type InputProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "type" | "className" | "onKeyPress" | "autoCorrect"
> &
  Omit<
    SharedInputProps,
    | "type"
    | "ref"
    | "onBlur"
    | "min"
    | "max"
    | "step"
    | "inputMode"
    | "value"
    | "defaultValue"
    | "onKeyPress"
    | "aria-describedby"
    | "aria-invalid"
    | "autoCapitalize"
    | "autoCorrect"
    | "autoComplete"
  > & {
    autoCorrect?: boolean | "on" | "off" | undefined;
    type?: HTMLInputTypeAttribute | undefined;
    ref?: Ref<HTMLInputElement> | Ref<InputHandle> | undefined;
    onKeyPress?: KeyboardEventHandler<HTMLInputElement> | undefined;
  };

/** A one-line text box, with optional slots at its start and end. */
function Input({
  className,
  type = "text",
  onChange,
  onChangeText,
  onKeyDown,
  onKeyPress,
  onSubmitEditing,
  onEscape,
  autoCorrect,
  spellCheck,
  leadingSlot,
  trailingSlot,
  prefixText,
  suffixText,
  wrapperClassName,
  ref,
  // A device keyboard's concern: a DOM number box already takes a minus.
  signed: _signed,
  ...props
}: InputProps) {
  const addonId = useId();
  const addons = prefixText !== undefined || suffixText !== undefined;
  // The fixed text is read with the field, after whatever already describes it.
  const describedBy = addons
    ? [
        props["aria-describedby"],
        prefixText === undefined ? undefined : `${addonId}-prefix`,
        suffixText === undefined ? undefined : `${addonId}-suffix`,
      ]
        .filter((id) => id !== undefined)
        .join(" ")
    : props["aria-describedby"];
  const corrects = typeof autoCorrect === "string" ? autoCorrect === "on" : autoCorrect;
  const autoCorrectWord = { true: "on", false: "off" } as const;

  const field = (
    <input
      // The element is the handle: it has `focus` and `select`, which is all `InputHandle` asks.
      ref={ref as Ref<HTMLInputElement>}
      data-slot="input"
      type={type}
      // The DOM attribute is a word, not a boolean. Safari is the browser that reads it; the
      // others only have the spelling underline, so that follows it, as react-native-web's does.
      autoCorrect={corrects === undefined ? undefined : autoCorrectWord[`${corrects}`]}
      spellCheck={spellCheck ?? corrects}
      onChange={(e) => {
        onChange?.(e);
        onChangeText?.(e.target.value);
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        // `keydown`, not the DOM's `keypress`: that one is deprecated and never fires for Escape,
        // the key `onKeyPress` is most often passed to hear. react-native-web makes the same swap.
        onKeyPress?.(e);
        if (e.defaultPrevented) {
          return;
        }
        if (e.key === "Enter" && onSubmitEditing) {
          e.preventDefault();
          onSubmitEditing();
        } else if (e.key === "Escape" && onEscape) {
          // Held back from the browser, which would otherwise clear a `type="search"` box under
          // a caller that is putting the old value back.
          e.preventDefault();
          onEscape();
        }
      }}
      {...props}
      aria-describedby={describedBy}
      className={cn(
        INPUT_CLASS,
        "file:border-0 file:bg-transparent file:text-sm file:font-semibold disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-negative aria-invalid:focus:border-active",
        addons
          ? [
              INPUT_ADDON_FIELD_CLASS,
              // The box fades instead, so the text fades with the value.
              "disabled:opacity-100",
              (prefixText !== undefined || leadingSlot != null) && "pl-0",
              (suffixText !== undefined || trailingSlot != null) && "pr-0",
            ]
          : [
              leadingSlot != null && INPUT_LEADING_PAD_CLASS,
              trailingSlot != null && INPUT_TRAILING_PAD_CLASS,
              // A quiet fill as well as the fade, or a disabled field with a value reads like an
              // empty one with a placeholder. In the addon form the box carries it.
              "disabled:bg-foreground/10",
            ],
        className,
      )}
    />
  );

  if (addons) {
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: a pointer convenience, as a label's is: the input inside is the control, and a keyboard reaches it directly.
      <div
        data-slot="input-wrapper"
        className={cn(
          INPUT_ADDON_BOX_CLASS,
          "focus-within:border-active has-[:disabled]:cursor-not-allowed has-[:disabled]:bg-foreground/10 has-[:disabled]:opacity-50 has-[[aria-invalid=true]]:border-negative has-[[aria-invalid=true]]:focus-within:border-active",
          wrapperClassName,
        )}
        // A press on the fixed text puts the caret in the value, as a press anywhere in a box does.
        onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
          const input = event.currentTarget.querySelector("input");
          if (input === null || event.target === input || input.disabled) {
            return;
          }
          if ((event.target as Element).closest("button, a, [role=button]") === null) {
            event.preventDefault();
            input.focus();
          }
        }}
      >
        {leadingSlot != null ? (
          <span data-slot="input-leading" className={cn(INPUT_ADDON_SLOT_CLASS, SLOT_ICON)}>
            {leadingSlot}
          </span>
        ) : null}
        {prefixText !== undefined ? (
          <span
            id={`${addonId}-prefix`}
            data-slot="input-prefix"
            // Right to left, so an overflow is cut from the start; `<bdi>` keeps the text in order.
            className={cn(
              INPUT_ADDON_TEXT_CLASS,
              "cursor-text truncate whitespace-nowrap [direction:rtl]",
              leadingSlot == null && "pl-3",
            )}
          >
            <bdi>{prefixText}</bdi>
          </span>
        ) : null}
        {field}
        {suffixText !== undefined ? (
          <span
            id={`${addonId}-suffix`}
            data-slot="input-suffix"
            className={cn(
              INPUT_ADDON_TEXT_CLASS,
              "cursor-text truncate whitespace-nowrap",
              // Short, and the half a reader needs whole: only the prefix gives way.
              "shrink-0",
              trailingSlot == null && "pr-3",
            )}
          >
            {suffixText}
          </span>
        ) : null}
        {trailingSlot != null ? (
          <span data-slot="input-trailing" className={cn(INPUT_ADDON_SLOT_CLASS, SLOT_ICON)}>
            {trailingSlot}
          </span>
        ) : null}
      </div>
    );
  }

  if (leadingSlot == null && trailingSlot == null) {
    return field;
  }

  return (
    <div data-slot="input-wrapper" className={cn(INPUT_WRAPPER_CLASS, wrapperClassName)}>
      {leadingSlot != null ? (
        <span data-slot="input-leading" className={cn(INPUT_LEADING_CLASS, SLOT_ICON)}>
          {leadingSlot}
        </span>
      ) : null}
      {field}
      {trailingSlot != null ? (
        <span data-slot="input-trailing" className={cn(INPUT_TRAILING_CLASS, SLOT_ICON)}>
          {trailingSlot}
        </span>
      ) : null}
    </div>
  );
}

/**
 * On the web an `<svg>` takes `currentColor`, so the slot carries the ink and the icon only needs
 * its size — pinned to the child rather than set on it, so a bare `<Search />` fits. A trailing
 * button's own `hover:text-*` still wins, being on the button.
 */
const SLOT_ICON = "text-foreground/60 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

export type { InputAutoComplete, InputHandle, InputKeyPressEvent, InputKeyPressHandler, InputType };
export { Input };
