import { Dialog as DialogPrimitive } from "radix-ui";
import type * as React from "react";
import { useEffect } from "react";
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
import {
  DIALOG_CONTENT_CLASS,
  DIALOG_DESCRIPTION_CLASS,
  DIALOG_DISMISS_CLASS,
  DIALOG_FOOTER_CLASS,
  DIALOG_HEADER_CLASS,
  DIALOG_TITLE_CLASS,
  focusOnOpen,
} from "@/components/ui/dialog-base";
import { FrameFocusGuard } from "@/lib/frame-focus-guard";
import { bridgePress, CardBodyContext, cn } from "@/lib/utils";
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
  children,
  ...props
}: Wide<DialogTriggerProps, React.ComponentProps<typeof DialogPrimitive.Trigger>>) {
  return (
    <DialogPrimitive.Trigger data-slot="dialog-trigger" asChild={asChild ?? false} {...props}>
      {asChild ? bridgePress(children) : children}
    </DialogPrimitive.Trigger>
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
  children,
  ...props
}: Wide<DialogCloseProps, React.ComponentProps<typeof DialogPrimitive.Close>>) {
  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      asChild={asChild ?? false}
      {...(className === undefined ? {} : { className })}
      {...props}
    >
      {asChild ? bridgePress(children) : children}
    </DialogPrimitive.Close>
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

/**
 * The toast stack, by its `data-slot`. It is drawn above dialogs so its Undo and its ✕ can be
 * pressed while one is open (#477), and radix reads a press there as one beside the dialog.
 */
const TOAST_STACK = '[data-slot="toast-viewport"]';

/** Whether a press or a focus radix calls "outside" landed on a toast. */
function isOnToast(event: Event): boolean {
  return event.target instanceof Element && event.target.closest(TOAST_STACK) !== null;
}

/**
 * Lets focus into the toast stack while the dialog is open (#500), drawn inside the card so it is
 * there only then. Radix's trap listens for focus
 * on the document and sends anything that lands outside the card back into it, so F8, which moves
 * focus to the newest toast, would be undone at once, and so would a press on its Undo. A focus
 * into the stack is stopped at `<body>`, after the app's own handlers have had it and before the
 * trap's. Tab past the stack lands outside the card, and the trap brings it back.
 */
function FocusIntoToasts() {
  useEffect(() => {
    const keep = (event: FocusEvent) => {
      const into = event.type === "focusin" ? event.target : event.relatedTarget;
      if (into instanceof Element && into.closest(TOAST_STACK) !== null) {
        event.stopPropagation();
      }
    };
    document.body.addEventListener("focusin", keep);
    document.body.addEventListener("focusout", keep);
    return () => {
      document.body.removeEventListener("focusin", keep);
      document.body.removeEventListener("focusout", keep);
    };
  }, []);
  return null;
}

/** The dialog's card. */
function DialogContent({
  className,
  showCloseButton = true,
  onEscapeKeyDown,
  onInteractOutside,
  onOpenAutoFocus,
  role,
  children,
  ...props
}: Wide<DialogContentProps, React.ComponentProps<typeof DialogPrimitive.Content>>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        // `aria-describedby` stays in `props`, so it is spread only when the caller wrote it: radix
        // links its own `DialogDescription`, and an `undefined` written here would unlink it.
        {...props}
        {...(onEscapeKeyDown === undefined ? {} : { onEscapeKeyDown })}
        // Pressing Undo on a toast neither closes the dialog nor asks the caller's guard whether
        // it may: the press was not meant for the dialog at all.
        onInteractOutside={(event) => {
          if (isOnToast(event)) {
            event.preventDefault();
            return;
          }
          onInteractOutside?.(event);
        }}
        // Radix focuses the first thing it can tab to, which in a dialog with no field is a button,
        // and focused a filled button looks hovered: the primary read unfilled on open. So the
        // first field takes focus, or with none the panel does. A caller's own handler can still
        // prevent it, and an `alertdialog` keeps radix's, whose first button is the safe answer.
        onOpenAutoFocus={(event) => {
          onOpenAutoFocus?.(event);
          if (event.defaultPrevented || role === "alertdialog") {
            return;
          }
          event.preventDefault();
          focusOnOpen(event.currentTarget as HTMLElement);
        }}
        // Spread only when given: radix sets its own `role="dialog"` and an explicit `undefined`
        // would land after it and take the role away.
        {...(role === undefined ? {} : { role })}
        className={cn(
          DIALOG_CONTENT_CLASS,
          // Native gets its gutter from the backdrop's padding; here the card is fixed in the
          // viewport, so it keeps 1rem clear of each edge until there is room for the full width.
          "max-w-[calc(100%-2rem)] sm:max-w-lg",
          // The panel takes focus when there is no field, and shows nothing for it.
          "outline-none",
          "text-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] fixed left-[50%] top-[50%] z-50 grid translate-x-[-50%] translate-y-[-50%] duration-200",
          className,
        )}
      >
        <CardBodyContext.Provider value={false}>{children}</CardBodyContext.Provider>
        {/* A framed app focusing itself would take the focus, and the typing, out of the dialog. */}
        <FrameFocusGuard />
        <FocusIntoToasts />
        {showCloseButton ? (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className={cn(DIALOG_DISMISS_CLASS, "transition-colors disabled:pointer-events-none")}
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
      className={cn("flex", DIALOG_HEADER_CLASS, className)}
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
      className={cn("flex", DIALOG_FOOTER_CLASS, className)}
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
      className={cn(DIALOG_TITLE_CLASS, className)}
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
      className={cn(DIALOG_DESCRIPTION_CLASS, className)}
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
