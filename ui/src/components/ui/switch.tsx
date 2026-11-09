import { Switch as SwitchPrimitive } from "radix-ui";
import { type ComponentPropsWithRef, useId } from "react";
import { SWITCH_THUMB_CLASS, SWITCH_TRACK_CLASS } from "@/components/ui/switch-base";
import type { TooltipSide } from "@/components/ui/tooltip-base";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type SwitchProps = Omit<ComponentPropsWithRef<typeof SwitchPrimitive.Root>, "className"> & {
  className?: string | undefined;
  /** shadcn's smaller track. Web only; the native switch is one size. */
  size?: "sm" | "default" | undefined;
  /**
   * The device half's name for the switch, taken so a call site shared across both halves still
   * names it — see `checkbox.web.tsx`. It becomes `aria-label`; an `aria-label` of its own wins.
   */
  accessibilityLabel?: string | undefined;
  /**
   * The switch's tooltip and description, as on `Button`. With it, `disabled` keeps the switch
   * focusable and refuses the press (`aria-disabled`), so the reason can still be read.
   */
  hint?: string | undefined;
  /** Which edge of the switch the tooltip sits on. The default is `top`. */
  side?: TooltipSide | undefined;
};

/** A control that is on or off. */
function Switch({
  className,
  size = "default",
  accessibilityLabel,
  "aria-label": ariaLabel,
  hint,
  side = "top",
  disabled,
  onClick,
  "aria-describedby": ariaDescribedBy,
  ...props
}: SwitchProps) {
  const hintId = useId();
  const hasHint = Boolean(hint);
  // As on `Button`: with a hint, a disabled switch keeps its focus and tooltip and refuses the press.
  const refuses = hasHint && Boolean(disabled);
  const describedBy = [ariaDescribedBy, hasHint ? hintId : undefined].filter(Boolean).join(" ");

  const root = (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      {...props}
      disabled={refuses ? false : disabled}
      {...(refuses ? { "aria-disabled": true } : {})}
      {...(describedBy === "" ? {} : { "aria-describedby": describedBy })}
      onClick={(event) => {
        onClick?.(event);
        // Radix skips its toggle for a click whose default is prevented.
        if (refuses) {
          event.preventDefault();
        }
      }}
      aria-label={ariaLabel ?? accessibilityLabel}
      className={cn(
        SWITCH_TRACK_CLASS,
        // On, `SWITCH_TRACK_ON_CLASS` under `data-[state=checked]:`, and off `SWITCH_TRACK_OFF_CLASS`
        // under `data-[state=unchecked]:`. Invalid is stacked on the on state as well: a
        // `data-[state]:` edge is emitted after an `aria-invalid:` one and would win, hiding a
        // refused on switch. An off one's `active` edge under the pointer and focused does win, as a
        // refused field's does, so it still shows where focus is.
        "peer group/switch inline-flex cursor-pointer transition-colors focus-visible:outline-none data-[state=unchecked]:hover:border-active data-[state=unchecked]:focus-visible:border-active data-[state=checked]:border-active data-[state=checked]:bg-active/40 data-[state=checked]:hover:bg-active/60 data-[state=checked]:focus-visible:bg-active/60 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-negative aria-invalid:data-[state=checked]:border-negative data-[state=unchecked]:bg-foreground/50 data-[size=sm]:h-4 data-[size=sm]:w-7",
        refuses && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          SWITCH_THUMB_CLASS,
          "pointer-events-none block ring-0 transition-transform motion-reduce:transition-none data-[state=checked]:bg-foreground data-[state=unchecked]:bg-background data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0 group-data-[size=sm]/switch:h-3 group-data-[size=sm]/switch:w-3 group-data-[size=sm]/switch:data-[state=checked]:translate-x-3",
        )}
      />
    </SwitchPrimitive.Root>
  );

  if (hasHint === false) {
    return root;
  }
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>{root}</TooltipTrigger>
        <TooltipContent side={side}>{hint}</TooltipContent>
      </Tooltip>
      <span id={hintId} className="sr-only">
        {hint}
      </span>
    </>
  );
}

export { Switch };
