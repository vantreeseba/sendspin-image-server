import type { DeepKeys } from "@tanstack/react-form";
import { createFormHook, createFormHookContexts, useStore } from "@tanstack/react-form";
import type { ComponentProps, ComponentType, ReactNode } from "react";
import { useState } from "react";
import { messageOf } from "@/lib/error-message";
import {
  type BindableForm,
  type FormBinding,
  fieldOf,
  type NamesOfType,
  type ValuesOf,
} from "@/lib/form-binding";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import type { SelectEntry, SelectOption, SelectSeparatorEntry } from "@/components/option-select";
import { OptionSelect } from "@/components/option-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

/** TanStack Form's contexts, which the bound fields read their field and form from. */
export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

/** Everything `FormField` draws, minus the two parts a bound field works out for itself. */
export type FieldProps = Omit<ComponentProps<typeof FormField>, "controlSlot" | "error">;

/**
 * The keys above, as values, so a call site can spread control props and field props into one
 * flat list — `<field.InputField label="Title" placeholder="What needs to be done?" />` — and
 * still have both halves typed. The alternative is nesting one of them under a prop of its own,
 * which reads worse at every call site to save this list.
 *
 * A key added to `FormField` and forgotten here lands on the control instead, where React will
 * say so: `loadingClassName` is not an attribute of `<input>`.
 */
const FIELD_KEYS = new Set<string>([
  "label",
  "description",
  "required",
  "action",
  "loading",
  "htmlFor",
  "asGroup",
  "orientation",
  "className",
  "labelClassName",
  "descriptionClassName",
  "errorClassName",
  "loadingClassName",
]);

/**
 * Splits one flat prop list into the half `FormField` draws and the half the control takes.
 *
 * Exported for the same reason {@link bindToForm} is: a field this registry does not ship — a
 * colour picker, a currency box — should be written the way the ones here are.
 */
export function splitProps<T>(props: FieldProps & T): [FieldProps, T] {
  const field: Record<string, unknown> = {};
  const control: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (FIELD_KEYS.has(key)) {
      field[key] = value;
    } else {
      control[key] = value;
    }
  }
  return [field as FieldProps, control as T];
}

/**
 * The field's first error, or nothing — and *when* is most of what this does.
 *
 * A form that reports every empty required field the moment it renders is a form that opens
 * covered in red, so a message waits until the field has been touched or the form has been
 * submitted at least once. That rule is the same for every field in every form here, which is
 * exactly why it belongs in one place: it is the thing each hand-written field decided
 * differently, and the reason two fields on one screen disagree about when they turn red.
 */
export function useFieldError(): string | undefined {
  const field = useFieldContext();
  const errors = useStore(field.store, (state) => state.meta.errors);
  const isTouched = useStore(field.store, (state) => state.meta.isTouched);
  const attempts = useStore(field.form.store, (state) => state.submissionAttempts);

  if (isTouched === false && attempts === 0) {
    return undefined;
  }
  return messageOf(errors[0]);
}

type InputFieldProps = FieldProps &
  Omit<
    ComponentProps<typeof Input>,
    "id" | "value" | "defaultValue" | "onChange" | "onChangeText" | "onBlur"
  >;

/** A text input. For numbers see {@link NumberField}, which keeps the store numeric. */
function BoundInputField(props: InputFieldProps) {
  const [fieldProps, input] = splitProps(props);
  const field = useFieldContext<string | null>();
  const error = useFieldError();

  return (
    <FormField
      {...fieldProps}
      error={error}
      controlSlot={
        <Input
          {...input}
          value={field.state.value ?? ""}
          onBlur={field.handleBlur}
          onChangeText={(text) => field.handleChange(text)}
        />
      }
    />
  );
}

/**
 * What a number input's box says, as a number — or nothing, for empty and for the half-typed
 * states a person passes through on the way to one.
 *
 * `""`, `"-"` and `"1e"` are all "not a number yet", not zero: coercing them would make the
 * store say `0` while the box says `-`, and a required-field validator pass on an empty box.
 */
function parseNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

type NumberFieldProps = FieldProps &
  Omit<
    ComponentProps<typeof Input>,
    "id" | "value" | "defaultValue" | "onChange" | "onChangeText" | "onBlur" | "type"
  >;

/**
 * A number input whose store stays numeric.
 *
 * Two bugs live here, and both are in every hand-written copy across these projects. The first is
 * that `event.target.value` is a string, so `type="number"` without a cast puts `"25"` in the
 * store, and the row goes to the API as a string or gets `parseInt`ed at the call site by
 * whoever remembered.
 *
 * The second only shows up under the fingers: coercing on every keystroke and rendering the
 * result back makes `1.` unreachable — the store rounds it to `1`, React re-renders `"1"`, and
 * the decimal point is eaten as it is typed. `4.05` cannot be entered at all. So what was typed
 * is kept as a draft and shown while it still *means* the stored number; anything that replaces
 * the value from outside wins, because then it no longer does.
 */
function BoundNumberField(props: NumberFieldProps) {
  const [fieldProps, input] = splitProps(props);
  const field = useFieldContext<number | null>();
  const error = useFieldError();
  const [draft, setDraft] = useState<string | undefined>(undefined);

  const stored = field.state.value ?? null;
  // `String`, not the raw number: the DOM `<input>` this was written against took either, and
  // `TextInput` takes only a string — so the registry's `Input` does too, on both platforms.
  const storedText = stored === null ? "" : String(stored);
  const value = draft !== undefined && parseNumber(draft) === stored ? draft : storedText;

  return (
    <FormField
      {...fieldProps}
      error={error}
      controlSlot={
        <Input
          // `inputMode` is what gets a phone keypad; `type` is what gets the spinners and the
          // browser's own numeric parsing. They are not the same knob and both are wanted.
          inputMode="decimal"
          {...input}
          type="number"
          value={value}
          onBlur={() => {
            // The draft has served its purpose once focus leaves: `1.` should settle to `1`.
            setDraft(undefined);
            field.handleBlur();
          }}
          onChangeText={(text) => {
            setDraft(text);
            field.handleChange(parseNumber(text));
          }}
        />
      }
    />
  );
}

/**
 * The box a `<Textarea rows={n}>` rests at, as literal classes — a composed `h-[${…}px]` would
 * be a class name Tailwind never generated, because the scanner reads source text.
 *
 * Approximate on purpose: within a few pixels is all a skeleton needs to be, and a field wanting
 * exactness passes its own `loadingClassName`.
 */
const TEXTAREA_BOX: Record<number, string | undefined> = {
  2: "h-16",
  3: "h-20",
  4: "h-24",
  5: "h-30",
  6: "h-34",
};

type TextareaFieldProps = FieldProps &
  Omit<
    ComponentProps<typeof Textarea>,
    "id" | "value" | "defaultValue" | "onChange" | "onChangeText" | "onBlur"
  >;

function BoundTextareaField(props: TextareaFieldProps) {
  const [fieldProps, textarea] = splitProps(props);
  const field = useFieldContext<string>();
  const error = useFieldError();

  return (
    <FormField
      // A textarea is taller than the box `FormField` draws by default, and the field is the one
      // that knows its own `rows` — so the loading skeleton is sized here rather than at the
      // twenty call sites that would each have to remember.
      loadingClassName={TEXTAREA_BOX[textarea.rows ?? 0] ?? "h-16"}
      {...fieldProps}
      error={error}
      controlSlot={
        <Textarea
          {...textarea}
          value={field.state.value ?? ""}
          onBlur={field.handleBlur}
          onChangeText={(text) => field.handleChange(text)}
        />
      }
    />
  );
}

type SelectFieldProps = FieldProps & {
  options: readonly SelectEntry[];
  placeholder?: string | undefined;
  triggerClassName?: string | undefined;
  /** A search box above the list, for the long one. `OptionSelect`'s own prop, passed through. */
  searchable?: boolean | undefined;
  searchPlaceholder?: string | undefined;
  /**
   * Told when the menu opens, so a field whose list is fetched can ask for it then. Named here
   * as well as on the control because a form is where most fetched lists are, and a field that
   * had to drop to `FormField`'s function form to get one word through would be the hand-wiring
   * this component exists to end.
   */
  onOpenChange?: ((open: boolean) => void) | undefined;
};

/**
 * The one that needs `FormField`'s function form, because `OptionSelect` is a `Popover`-shaped control
 * whose root renders no DOM: the id and the aria attributes belong on the trigger, and the
 * control is what knows where that is. Every hand-written select field in these apps puts them
 * on the root instead, silently, leaving a trigger with no `aria-invalid` and an error message
 * nothing points at.
 */
function BoundSelectField({
  options,
  placeholder,
  triggerClassName,
  searchable,
  searchPlaceholder,
  onOpenChange,
  ...rest
}: SelectFieldProps) {
  const field = useFieldContext<string>();
  const error = useFieldError();

  return (
    <FormField
      {...rest}
      error={error}
      controlSlot={(wired) => (
        <OptionSelect
          {...wired}
          options={options}
          value={field.state.value ?? ""}
          onValueChange={field.handleChange}
          onBlur={field.handleBlur}
          placeholder={placeholder}
          searchable={searchable}
          searchPlaceholder={searchPlaceholder}
          onOpenChange={onOpenChange}
          className={triggerClassName}
        />
      )}
    />
  );
}

type CheckboxFieldProps = FieldProps &
  Omit<
    ComponentProps<typeof Checkbox>,
    "id" | "checked" | "defaultChecked" | "onCheckedChange" | "onBlur"
  >;

/** Horizontal by default: a 16px box on a line of its own above its caption is not a field. */
function BoundCheckboxField(props: CheckboxFieldProps) {
  const [fieldProps, checkbox] = splitProps(props);
  const field = useFieldContext<boolean>();
  const error = useFieldError();

  return (
    <FormField
      orientation="horizontal"
      {...fieldProps}
      error={error}
      controlSlot={
        <Checkbox
          {...checkbox}
          checked={field.state.value ?? false}
          onBlur={field.handleBlur}
          onCheckedChange={(checked) => field.handleChange(checked === true)}
        />
      }
    />
  );
}

type SwitchFieldProps = FieldProps &
  Omit<
    ComponentProps<typeof Switch>,
    "id" | "checked" | "defaultChecked" | "onCheckedChange" | "onBlur"
  >;

function BoundSwitchField(props: SwitchFieldProps) {
  const [fieldProps, control] = splitProps(props);
  const field = useFieldContext<boolean>();
  const error = useFieldError();

  return (
    <FormField
      orientation="horizontal"
      loadingClassName="h-5 w-8 rounded-full"
      {...fieldProps}
      error={error}
      controlSlot={
        <Switch
          {...control}
          checked={field.state.value ?? false}
          onBlur={field.handleBlur}
          onCheckedChange={(checked) => field.handleChange(checked)}
        />
      }
    />
  );
}

type SubmitButtonProps = Omit<
  ComponentProps<typeof Button>,
  "type" | "loading" | "loadingLabel"
> & {
  /** What it says mid-flight. The label is replaced, not appended to. */
  pendingLabel?: string | undefined;
};

/**
 * The submit, with the double-submit guard already in it.
 *
 * Every form in the source apps wrote `disabled={isSubmitting}` by hand and roughly half of them
 * forgot `canSubmit`, so an invalid form submitted anyway and failed at the server. Both come
 * off the form store, and there is one of these.
 *
 * `disabled` is a third reason, not a replacement for the two: it is OR-ed in, so a caller can
 * only ever *tighten* the guard. The reasons the store cannot know are real ones — a mutation in
 * flight on the other half of the screen, a settings form that is valid but unchanged — and
 * without a way to say them the whole component gets dropped for a hand-written
 * `<Button type="submit">` that re-derives `canSubmit` and `isSubmitting`, which is the
 * duplication this exists to remove.
 *
 * Inside a `<form>`, or naming one with `form="…"`, it is a submit control and the form's own
 * `onSubmit` runs. With no form to submit — a dialog's `footerActionsSlot`, a card's footer —
 * a `type="submit"` button does nothing at all, so there it calls `form.handleSubmit()` itself,
 * as the native `SubmitButton` always does.
 */
export function SubmitButton({
  content = "Save",
  pendingLabel = "Saving…",
  disabled,
  onClick,
  ...props
}: SubmitButtonProps) {
  const form = useFormContext();
  const canSubmit = useStore(form.store, (state) => state.canSubmit);
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

  // Ahead of the spread as well as OR-ed, so that neither a caller nor a future prop can put a
  // `disabled={false}` back over the store's answer.
  return (
    <Button
      type="submit"
      {...props}
      onClick={(event) => {
        onClick?.(event);
        // `button.form` is the form that owns it, by ancestry or by the `form` attribute.
        if (event.defaultPrevented === false && !event.currentTarget.form) {
          form.handleSubmit();
        }
      }}
      disabled={disabled || canSubmit === false}
      loading={isSubmitting}
      loadingLabel={pendingLabel}
      content={content}
    />
  );
}

/**
 * `useAppForm` — the hook a form calls, with these components hanging off its fields.
 *
 * This is TanStack's own arrangement, and it is still here because it is the one that handles
 * every case: a field that needs the `field` object itself — to read a sibling's value, to render
 * a list, to do something no prop covers — reaches for it.
 *
 * ```tsx
 * <form.AppField name="title">
 *   {(field) => <field.InputField label="Title" required />}
 * </form.AppField>
 * ```
 *
 * For the ninety percent of fields that need none of that, see {@link InputField} and the rest of
 * the exported fields, which are the same components with the render prop already written.
 */
export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    InputField: BoundInputField,
    NumberField: BoundNumberField,
    TextareaField: BoundTextareaField,
    SelectField: BoundSelectField,
    CheckboxField: BoundCheckboxField,
    SwitchField: BoundSwitchField,
  },
  formComponents: { SubmitButton },
});

/**
 * The control's props, minus the two names the binding needs for itself.
 *
 * `form` and `name` are both real HTML attributes on `<input>`, `<textarea>` and `<select>`, so
 * without this the intersection is `string & BindableForm` — a type nothing satisfies, and an
 * error message that points at the call site rather than at the collision. Neither is a loss:
 * the `form` attribute re-parents a control to a form elsewhere in the document, which is not
 * what a field inside its own form is doing, and `name` is the prop being taken over.
 */
type ControlPropsOf<TProps> = Omit<TProps, "form" | "name">;

/**
 * Writes the render prop, once, for a field that does not need one.
 *
 * The render prop is not ceremony for its own sake — it is how TanStack subscribes a field to the
 * store, and the `field` object it hands back is the whole API. But most fields never touch that
 * object: they were only ever going to pass a label through to the component underneath, and the
 * three lines and the closure around them are three lines and a closure per field, fifteen times
 * in one form. The components here are the same components, with the `form.Field` wrapper and the
 * context provider already written.
 *
 * The context is provided directly rather than by going through `form.AppField`, which is what
 * lets these work on a form that was never made with `useAppForm` at all.
 *
 * `TValue` narrows which fields the result will accept — see {@link NamesOfType}. It is exported
 * so a control this registry does not ship can be bound the same way:
 *
 * ```tsx
 * export const ColorField = bindToForm<ColorFieldProps, string>(BoundColorField, "ColorField");
 * ```
 */
export function bindToForm<TProps extends object, TValue = unknown>(
  Bound: ComponentType<TProps>,
  displayName: string,
): <TForm extends BindableForm, TName extends NamesOfType<ValuesOf<TForm>, TValue>>(
  props: ControlPropsOf<TProps> & FormBinding<TForm, TName>,
) => ReactNode {
  function FormBoundField<TForm extends BindableForm, TName extends DeepKeys<ValuesOf<TForm>>>({
    form,
    name,
    validators,
    asyncDebounceMs,
    listeners,
    ...rest
  }: ControlPropsOf<TProps> & FormBinding<TForm, TName>) {
    const Subscribe = fieldOf(form);

    return (
      <Subscribe
        name={name}
        validators={validators}
        asyncDebounceMs={asyncDebounceMs}
        listeners={listeners}
      >
        {(field) => (
          <fieldContext.Provider value={field}>
            <Bound {...(rest as TProps)} />
          </fieldContext.Provider>
        )}
      </Subscribe>
    );
  }

  FormBoundField.displayName = displayName;
  return FormBoundField;
}

/**
 * A text input, as one line.
 *
 * ```tsx
 * const form = useAppForm({ defaultValues: { title: "" }, onSubmit: ({ value }) => save(value) });
 *
 * <InputField form={form} name="title" label="Title" required />
 * ```
 *
 * `type="number"` writes a number back to the store, not a numeric string. `name` is checked
 * against the form's values, so a renamed field breaks the build rather than going quiet.
 */
export const InputField = bindToForm<InputFieldProps, string>(BoundInputField, "InputField");

/**
 * A number input, as one line — and only over a field that holds a number.
 *
 * ```tsx
 * <NumberField form={form} name="minutes" label="Duration" min={5} step={5} />
 * ```
 *
 * `<NumberField form={form} name="title">` over a string field is a type error, which is the
 * half a `type="number"` prop could never give. Empty is `null`, not `0`.
 */
export const NumberField = bindToForm<NumberFieldProps, number>(BoundNumberField, "NumberField");

/** A textarea, as one line. `rows` also sizes the loading skeleton. */
export const TextareaField = bindToForm<TextareaFieldProps, string>(
  BoundTextareaField,
  "TextareaField",
);

/** A select, as one line. Takes its choices as `options`, not as children. */
export const SelectField = bindToForm<SelectFieldProps, string>(BoundSelectField, "SelectField");

/** A checkbox and its caption, as one line. Horizontal, because a 16px box is not a row. */
export const CheckboxField = bindToForm<CheckboxFieldProps, boolean>(
  BoundCheckboxField,
  "CheckboxField",
);

/** A switch and its caption, as one line. */
export const SwitchField = bindToForm<SwitchFieldProps, boolean>(BoundSwitchField, "SwitchField");

export type { SelectEntry, SelectOption, SelectSeparatorEntry };
// Local bindings rather than `export … from`: the shadcn CLI rewrites import declarations on
// install and leaves re-export declarations alone, so the `from` form would ship a path into
// `control/` that does not exist in a consumer's tree. See AGENTS.md.
export { OptionSelect };
