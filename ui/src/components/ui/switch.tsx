import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentPropsWithRef } from "react";
import { SWITCH_THUMB_CLASS, SWITCH_TRACK_CLASS } from "@/components/ui/switch-base";
import { cn } from "@/lib/utils";

export type SwitchProps = Omit<ComponentPropsWithRef<typeof SwitchPrimitive.Root>, "className"> & {
  className?: string | undefined;
  /** shadcn's smaller track. Web only; the native switch is one size. */
  size?: "sm" | "default" | undefined;
  /**
   * The device half's name for the switch, taken so a call site shared across both halves still
   * names it — see `checkbox.web.tsx`. It becomes `aria-label`; an `aria-label` of its own wins.
   */
  "aria-label"?: string | undefined;
};

/** A control that is on or off. */
function Switch({
  className,
  size = "default",
  "aria-label": accessibilityLabel,
  "aria-label": ariaLabel,
  ...props
}: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      {...props}
      aria-label={ariaLabel ?? accessibilityLabel}
      className={cn(
        SWITCH_TRACK_CLASS,
        "peer group/switch inline-flex cursor-pointer shadow-xs transition-colors focus-visible:outline-none data-[state=unchecked]:focus-visible:bg-hover data-[state=checked]:focus-visible:bg-active/90 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-negative data-[state=checked]:bg-active data-[state=unchecked]:bg-foreground/15 data-[size=sm]:h-4 data-[size=sm]:w-7",
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          SWITCH_THUMB_CLASS,
          "pointer-events-none block shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0 group-data-[size=sm]/switch:h-3 group-data-[size=sm]/switch:w-3 group-data-[size=sm]/switch:data-[state=checked]:translate-x-3",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
