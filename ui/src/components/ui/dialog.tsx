import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";
import type {
  DialogCloseProps,
  DialogContentProps,
  DialogFooterProps,
  DialogOverlayProps,
  DialogPortalProps,
  DialogProps,
  DialogSectionProps,
  DialogTriggerProps,
} from "@/components/ui/dialog-base";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { X } from "@/components/ui/icons";

/** The shared contract, widened to what the radix part (or element) underneath accepts. */
type Wide<Base, Radix> = Base & Omit<Radix, keyof Base>;

/** The root of a dialog: it holds the open state. */
function Dialog({
  open,
  onOpenChange,
  defaultOpen,
  ...props
}: Wide<DialogProps, React.ComponentProps<typeof DialogPrimitive.Root>>) {
  // Spread only when given: radix goes uncontrolled on `open === undefined` only when the prop is
  // absent, and `exactOptionalPropertyTypes` is what makes the difference expressible.
  return (
    <DialogPrimitive.Root
      data-slot="dialog"
      {...props}
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
      {...(defaultOpen === undefined ? {} : { defaultOpen })}
    />
  );
}

/** The element that opens the dialog. */
function DialogTrigger({
  asChild,
  ...props
}: Wide<DialogTriggerProps, React.ComponentProps<typeof DialogPrimitive.Trigger>>) {
  return (
    <DialogPrimitive.Trigger data-slot="dialog-trigger" asChild={asChild ?? false} {...props} />
  );
}

/** Where the dialog is mounted, outside the tree that opened it. */
function DialogPortal(
  props: Wide<DialogPortalProps, React.ComponentProps<typeof DialogPrimitive.Portal>>,
) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

/** An element that closes the dialog when pressed. */
function DialogClose({
  asChild,
  className,
  ...props
}: Wide<DialogCloseProps, React.ComponentProps<typeof DialogPrimitive.Close>>) {
  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      asChild={asChild ?? false}
      {...(className === undefined ? {} : { className })}
      {...props}
    />
  );
}

/** The dimmed backdrop behind the dialog. */
function DialogOverlay({
  className,
  ...props
}: Wide<DialogOverlayProps, React.ComponentProps<typeof DialogPrimitive.Overlay>>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-overlay/60",
        className,
      )}
      {...props}
    />
  );
}

/** The dialog's card. */
function DialogContent({
  className,
  showCloseButton = true,
  onEscapeKeyDown,
  onInteractOutside,
  "aria-describedby": describedBy,
  role,
  children,
  ...props
}: Wide<DialogContentProps, React.ComponentProps<typeof DialogPrimitive.Content>>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        {...props}
        {...(onEscapeKeyDown === undefined ? {} : { onEscapeKeyDown })}
        {...(onInteractOutside === undefined ? {} : { onInteractOutside })}
        // Spread only when given: radix sets its own `role="dialog"` and an explicit `undefined`
        // would land after it and take the role away.
        {...(role === undefined ? {} : { role })}
        aria-describedby={describedBy}
        className={cn(
          "bg-background text-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border p-6 shadow-lg duration-200 sm:rounded-lg",
          className,
        )}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="data-[state=open]:bg-hover data-[state=open]:text-foreground/60 absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none disabled:pointer-events-none"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

/** The block holding the title and the description. */
function DialogHeader({
  className,
  ...props
}: Wide<DialogSectionProps, React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5 text-center sm:text-left", className)}
      {...props}
    />
  );
}

/** The row of buttons at the bottom of the dialog. */
function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: Wide<DialogFooterProps, React.ComponentProps<"div">>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    >
      {children}
      {showCloseButton ? (
        <DialogPrimitive.Close asChild>
          <Button variant="outline" content="Close" />
        </DialogPrimitive.Close>
      ) : null}
    </div>
  );
}

/** The dialog's title, and its accessible name. */
function DialogTitle({
  className,
  ...props
}: Wide<DialogSectionProps, React.ComponentProps<typeof DialogPrimitive.Title>>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

/** The sentence under the title, read as the dialog's description. */
function DialogDescription({
  className,
  ...props
}: Wide<DialogSectionProps, React.ComponentProps<typeof DialogPrimitive.Description>>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-foreground/60 text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
