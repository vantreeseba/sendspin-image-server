import type { AnyFieldApi, DeepKeys, DeepValue } from "@tanstack/react-form";
import type { ComponentType, ReactNode } from "react";

/**
 * What a bound field needs off a form, and nothing else. Structural, so a plain `useForm` binds as
 * well as `useAppForm` does.
 */
export type BindableForm = {
  state: { values: unknown };
  // Not `=> ReactNode`: a function component may return a promise, and TanStack types `Field`
  // that way, so narrowing here rejects every real form.
  Field: (props: never) => ReactNode | Promise<ReactNode>;
};

/** The shape of a form's values, recovered from the form itself, so `name` can be checked. */
export type ValuesOf<TForm extends BindableForm> = TForm extends {
  state: { values: infer TValues };
}
  ? TValues
  : never;

/**
 * A validator, with `value` narrowed to the field's own type. Anything falsy passes; a string is
 * the message, and `messageOf` reads an object's `message`, so a schema issue can be returned whole.
 */
export type Validate<TValue> = (context: {
  value: TValue;
  fieldApi: AnyFieldApi;
  signal: AbortSignal;
}) => unknown;

/**
 * The validators a field call site writes, spelled out rather than imported: TanStack's own
 * `FieldValidators` takes twenty-three type parameters. Anything beyond these seven belongs on
 * `form.AppField`, which has the real type in full.
 */
export type Validators<TValues, TName extends DeepKeys<TValues>> = {
  onMount?: Validate<DeepValue<TValues, TName>> | undefined;
  onChange?: Validate<DeepValue<TValues, TName>> | undefined;
  onChangeAsync?: Validate<DeepValue<TValues, TName>> | undefined;
  onBlur?: Validate<DeepValue<TValues, TName>> | undefined;
  onBlurAsync?: Validate<DeepValue<TValues, TName>> | undefined;
  onSubmit?: Validate<DeepValue<TValues, TName>> | undefined;
  onSubmitAsync?: Validate<DeepValue<TValues, TName>> | undefined;
};

/** A listener: what the field does once its value has changed, where a validator says whether it may. */
export type Listen<TValue> = (context: { value: TValue; fieldApi: AnyFieldApi }) => void;

/**
 * The listeners a field call site writes, spelled out for the reason {@link Validators} is.
 * `onGroupSubmit` is left out: it belongs to TanStack's field groups, which nothing here builds.
 */
export type Listeners<TValues, TName extends DeepKeys<TValues>> = {
  onMount?: Listen<DeepValue<TValues, TName>> | undefined;
  onUnmount?: Listen<DeepValue<TValues, TName>> | undefined;
  onChange?: Listen<DeepValue<TValues, TName>> | undefined;
  /** How long to wait after the last change before running `onChange`, in milliseconds. */
  onChangeDebounceMs?: number | undefined;
  onBlur?: Listen<DeepValue<TValues, TName>> | undefined;
  /** How long to wait after the last blur before running `onBlur`, in milliseconds. */
  onBlurDebounceMs?: number | undefined;
  onSubmit?: Listen<DeepValue<TValues, TName>> | undefined;
};

/**
 * The names of the fields whose value is a `TValue`, which is how a number field refuses a string
 * field's name at compile time. `NonNullable` so a `string | null` column still counts as a string
 * field. With `unknown` this is every key.
 */
export type NamesOfType<TValues, TValue> = {
  [TName in DeepKeys<TValues>]: NonNullable<DeepValue<TValues, TName>> extends TValue
    ? TName
    : never;
  // Intersected back so the result is provably a `DeepKeys`, which `Validators` requires.
}[DeepKeys<TValues>] &
  DeepKeys<TValues>;

/** The props a bound field takes beside its control's own. */
export type FormBinding<TForm extends BindableForm, TName extends DeepKeys<ValuesOf<TForm>>> = {
  form: TForm;
  /** A key of the form's values. Checked: `naem` is a type error, not a field that stays empty. */
  name: TName;
  validators?: Validators<ValuesOf<TForm>, TName> | undefined;
  /** How long to wait before running the async validators, in milliseconds. */
  asyncDebounceMs?: number | undefined;
  listeners?: Listeners<ValuesOf<TForm>, TName> | undefined;
};

/** `form.Field` as a bound field renders it: the binding's own props, unchecked, and the render prop. */
type LooseField = ComponentType<{
  name: unknown;
  validators?: unknown | undefined;
  asyncDebounceMs?: number | undefined;
  listeners?: unknown | undefined;
  children: (field: AnyFieldApi) => ReactNode;
}>;

/**
 * The form's `Field`, loosely typed. The generic one cannot be described without repeating the
 * twenty-three type parameters already correct on `form`, so the cast is here, once; the `name` a
 * {@link FormBinding} checks is what it protects.
 *
 * @param form - The form a field is bound to.
 * @returns Its `Field` component, taking the binding's props as given.
 */
export function fieldOf(form: BindableForm): LooseField {
  return form.Field as LooseField;
}
