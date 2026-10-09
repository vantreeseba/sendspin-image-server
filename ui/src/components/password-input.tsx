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
