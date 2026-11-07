import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "@/components/ui/icons";
import { Input, type InputProps } from "@/components/ui/input";

export type PasswordInputProps = Omit<InputProps, "type" | "trailingSlot"> & {
  /** The reveal button's name while the value is hidden. */
  showLabel?: string | undefined;
  /** And while it is showing. Both are announced; the icon alone says nothing. */
  hideLabel?: string | undefined;
  /** Off, this is a plain `<Input type="password">` with no button. */
  revealable?: boolean | undefined;
};

/**
 * The reveal button's two names for a field with this label: "Show API key", "Hide API key".
 *
 * @param label - The field's label. Only a string can be read into a name.
 * @returns Both names, or neither for a label that is not a string.
 *
 * @remarks
 * Most secrets in a form are not passwords, and a bound field knows what its own is called.
 */
export function revealLabelsFor(
  label: unknown,
): Pick<PasswordInputProps, "showLabel" | "hideLabel"> {
  if (typeof label !== "string") {
    return {};
  }
  return { showLabel: `Show ${label}`, hideLabel: `Hide ${label}` };
}

/** A password box with a button that shows and hides what was typed. */
export function PasswordInput({
  showLabel = "Show password",
  hideLabel = "Hide password",
  revealable = true,
  disabled,
  ...props
}: PasswordInputProps) {
  const [shown, setShown] = useState(false);
  const visible = revealable && shown;

  return (
    <Input
      {...props}
      type={visible ? "text" : "password"}
      disabled={disabled}
      trailingSlot={
        revealable ? (
          <Button
            variant="secondary"
            size="icon-xs"
            aria-label={visible ? hideLabel : showLabel}
            disabled={disabled}
            onClick={() => setShown((was) => was === false)}
            content={visible ? <EyeOff /> : <Eye />}
          />
        ) : undefined
      }
    />
  );
}
