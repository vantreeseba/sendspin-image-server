import { Popover as PopoverPrimitive } from "radix-ui";
import type * as React from "react";
import type {
  PopoverAnchorProps,
  PopoverCloseProps,
  PopoverContentProps,
  PopoverProps,
  PopoverSectionProps,
  PopoverTriggerProps,
} from "@/components/ui/popover-base";
import { cn } from "@/lib/utils";

/** The shared contract, widened to what the radix part (or element) underneath accepts. */
type Wide<Base, Radix> = Base & Omit<Radix, keyof Base>;

/** The root of a popover: it holds the open state. */
function Popover({
  open,
  onOpenChange,
  defaultOpen,
  ...props
}: Wide<PopoverProps, React.ComponentProps<typeof PopoverPrimitive.Root>>) {
  // Spread rather than passed: radix switches to uncontrolled on `open === undefined`,
  // but only if the prop is absent, and `exactOptionalPropertyTypes` is what makes the
  // difference expressible.
  return (
    <PopoverPrimitive.Root
      data-slot="popover"
      {...props}
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
      {...(defaultOpen === undefined ? {} : { defaultOpen })}
    />
  );
}

/** The element that opens the popover. */
function PopoverTrigger({
  asChild,
  ...props
}: Wide<PopoverTriggerProps, React.ComponentProps<typeof PopoverPrimitive.Trigger>>) {
  return (
    <PopoverPrimitive.Trigger data-slot="popover-trigger" asChild={asChild ?? false} {...props} />
  );
}

/** The popover's card. */
function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: Wide<PopoverContentProps, React.ComponentProps<typeof PopoverPrimitive.Content>>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-72 rounded-md border bg-secondary p-4 text-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

/** An element the popover is placed against instead of its trigger. */
function PopoverAnchor({
  asChild,
  ...props
}: Wide<PopoverAnchorProps, React.ComponentProps<typeof PopoverPrimitive.Anchor>>) {
  return (
    <PopoverPrimitive.Anchor data-slot="popover-anchor" asChild={asChild ?? false} {...props} />
  );
}

/** An element that closes the popover when pressed. */
function PopoverClose({
  asChild,
  className,
  ...props
}: Wide<PopoverCloseProps, React.ComponentProps<typeof PopoverPrimitive.Close>>) {
  return (
    <PopoverPrimitive.Close
      data-slot="popover-close"
      asChild={asChild ?? false}
      {...(className === undefined ? {} : { className })}
      {...props}
    />
  );
}

/** The block holding the popover's title and description. */
function PopoverHeader({
  className,
  ...props
}: Wide<PopoverSectionProps, React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-1 text-sm", className)}
      {...props}
    />
  );
}

/** The popover's title. */
function PopoverTitle({
  className,
  ...props
}: Wide<PopoverSectionProps, React.ComponentProps<"div">>) {
  return <div data-slot="popover-title" className={cn("font-medium", className)} {...props} />;
}

/** The muted line under the popover's title. */
function PopoverDescription({
  className,
  ...props
}: Wide<PopoverSectionProps, React.ComponentProps<"p">>) {
  return (
    <p data-slot="popover-description" className={cn("text-foreground/60", className)} {...props} />
  );
}

export {
  Popover,
  PopoverAnchor,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
};
