import { Select as SelectPrimitive } from "radix-ui";
import type { ComponentPropsWithRef, ElementType } from "react";
import {
  SELECT_ITEM_CLASS,
  SELECT_ITEM_TEXT_CLASS,
  SELECT_LABEL_CLASS,
  SELECT_SEPARATOR_CLASS,
  SELECT_TRIGGER_CLASS,
  SELECT_TRIGGER_TEXT_CLASS,
} from "@/components/ui/select-base";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronUp } from "@/components/ui/icons";

// Each part's props are radix's, with `className` re-declared: radix types it `className?: string`,
// which under `exactOptionalPropertyTypes` rejects the `cond ? "x" : undefined` call sites pass.
type Props<T extends ElementType> = Omit<ComponentPropsWithRef<T>, "className"> & {
  className?: string | undefined;
};

type RootProps = ComponentPropsWithRef<typeof SelectPrimitive.Root>;

/**
 * radix's root props, each also taking an explicit `undefined` — the shared contract's spelling,
 * and what a wrapper forwarding its own optional `open` or `value` passes.
 */
type SelectProps = { [K in keyof RootProps]?: RootProps[K] | undefined };

/** The root of a select: it holds the chosen value and the open state. */
function Select(props: SelectProps) {
  // An explicit `undefined` is dropped rather than passed on: radix reads the presence of `open`
  // and `value` as the switch between controlled and uncontrolled, and a caller forwarding an
  // unset `open` means "not controlled", not "closed".
  const defined = Object.fromEntries(
    Object.entries(props).filter(([, value]) => value !== undefined),
  ) as RootProps;
  const { onValueChange } = defined;
  // Inside a `<form>` radix mirrors the value into a hidden native `<select>` and reports that
  // element's `change` back. A value whose item has not rendered yet — a list still being fetched,
  // an option just created — has no `<option>` there, so the element reads `""` and radix hands
  // that back as if it had been picked. No item can carry `""` (radix refuses one), so it is never
  // a choice: dropping it keeps the value until its option arrives.
  if (onValueChange) {
    defined.onValueChange = (next) => {
      if (next !== "") {
        onValueChange(next);
      }
    };
  }
  return <SelectPrimitive.Root data-slot="select" {...defined} />;
}

/** A set of options under a `SelectLabel`. */
function SelectGroup(props: Props<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

/** The chosen option's label, or the placeholder, inside the trigger. */
function SelectValue(props: Props<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

/** The button that shows the chosen value and opens the options. */
function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: Props<typeof SelectPrimitive.Trigger> & {
  /** shadcn's shorter trigger. Web only. */
  size?: "sm" | "default" | undefined;
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      {...props}
      className={cn(
        SELECT_TRIGGER_CLASS,
        SELECT_TRIGGER_TEXT_CLASS,
        "flex focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-negative aria-invalid:focus:border-active focus:border-active data-[placeholder]:text-foreground/60 data-[size=sm]:h-8 [&>span]:line-clamp-1",
        className,
      )}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

/** The list of options. */
function SelectContent({
  className,
  children,
  position = "item-aligned",
  align = "center",
  ...props
}: Props<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        align={align}
        {...props}
        className={cn(
          "bg-secondary text-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border shadow-md",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className,
        )}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1",
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

/** One option. */
function SelectItem({ className, children, ...props }: Props<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      {...props}
      className={cn(
        SELECT_ITEM_CLASS,
        SELECT_ITEM_TEXT_CLASS,
        "focus:bg-hover focus:text-foreground relative flex cursor-default select-none outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

/** The heading over a group of options. */
function SelectLabel({ className, ...props }: Props<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      {...props}
      className={cn(SELECT_LABEL_CLASS, className)}
    />
  );
}

/** A rule between groups of options. */
function SelectSeparator({ className, ...props }: Props<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      {...props}
      className={cn(SELECT_SEPARATOR_CLASS, "pointer-events-none", className)}
    />
  );
}

/** The arrow shown at the top of a list that has scrolled. */
function SelectScrollUpButton({
  className,
  ...props
}: Props<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      {...props}
      className={cn("flex cursor-default items-center justify-center py-1", className)}
    >
      <ChevronUp className="h-4 w-4" />
    </SelectPrimitive.ScrollUpButton>
  );
}

/** The arrow shown at the bottom of a list with more below. */
function SelectScrollDownButton({
  className,
  ...props
}: Props<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      {...props}
      className={cn("flex cursor-default items-center justify-center py-1", className)}
    >
      <ChevronDown className="h-4 w-4" />
    </SelectPrimitive.ScrollDownButton>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
