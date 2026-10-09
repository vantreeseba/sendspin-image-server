import type { ComponentProps } from "react";
import {
  bindToForm,
  type FieldProps,
  splitProps,
  useFieldContext,
  useFieldError,
} from "@/components/app-form";
import { FormField } from "@/components/form-field";
import { PasswordInput } from "@/components/password-input";

type PasswordFieldProps = FieldProps &
  Omit<ComponentProps<typeof PasswordInput>, "id" | "value" | "onChangeText" | "onBlur">;

function BoundPasswordField(props: PasswordFieldProps) {
  const [fieldProps, input] = splitProps(props);
  const field = useFieldContext<string | null>();
  const error = useFieldError();

  return (
    <FormField
      {...fieldProps}
      error={error}
      // The function form: the props belong on the `Input` inside the wrapper, not on the
      // `<div>` that positions the eye. Cloning would put the label's target on the wrapper —
      // the same blind spot `SelectField` has, and just as quiet.
      controlSlot={(wired) => (
        <PasswordInput
          {...input}
          {...wired}
          value={field.state.value ?? ""}
          onBlur={field.handleBlur}
          onChangeText={(text) => field.handleChange(text)}
        />
      )}
    />
  );
}

/**
 * A password, as one line.
 *
 * ```tsx
 * <PasswordField form={form} name="password" label="Password" autoComplete="current-password" />
 * ```
 *
 * It is not `<InputField type="password">`, and the difference is the reveal button — see
 * {@link PasswordInput}. A field whose only difference from `InputField` were the `type` would be
 * a variant wearing a component's clothes, and this registry has a rule about that.
 */
export const PasswordField = bindToForm<PasswordFieldProps, string>(
  BoundPasswordField,
  "PasswordField",
);

// Re-exported as a local binding rather than `export … from`: the shadcn CLI rewrites import
// declarations on install and leaves re-export declarations alone, so the `from` form would ship
// a path into `control/` that does not exist in a consumer's tree. See AGENTS.md.
export { PasswordInput };
