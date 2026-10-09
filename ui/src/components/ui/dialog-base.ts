import type { ReactNode } from "react";

export type DialogProps = {
  /**
   * Controlled when passed. Leave `open` out and the dialog keeps its own state, opened by a
   * `DialogTrigger` and shut by a `DialogClose` — shadcn's uncontrolled form.
   */
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  defaultOpen?: boolean | undefined;
  children?: ReactNode;
};

export type DialogTriggerProps = {
  /**
   * Hand the press handler to the single child rather than wrapping it. Always
   * pass it, for the reason `popover-base.ts` gives: a `Pressable` wrapping a
   * `Button` never fires on native, because the inner pressable claims the touch.
   */
  asChild?: boolean | undefined;
  children: ReactNode;
};

/**
 * `DialogContent` takes three things the section slots do not.
 *
 * `onEscapeKeyDown` and `onInteractOutside` are the two ways a dialog closes without
 * the caller asking, and a form dialog with unsaved edits needs to intercept both.
 * Native has one of each — the hardware back button and the backdrop press — so they
 * are honoured there too rather than being web-only.
 */
export type DialogContentProps = DialogSectionProps & {
  /** Draw the corner close button. Default `true`. */
  showCloseButton?: boolean | undefined;
  onEscapeKeyDown?: ((event: Event) => void) | undefined;
  onInteractOutside?: ((event: Event) => void) | undefined;
  /** `undefined` passed explicitly is how "nothing describes this" is said to radix. */
  "aria-describedby"?: string | undefined;
  /**
   * `alertdialog` for a question that interrupts — "Discard your changes?" — which assistive
   * technology announces as urgent rather than as a place to work. Default `dialog`.
   */
  role?: "dialog" | "alertdialog" | undefined;
};

/** Closes the dialog it is inside. `asChild` hands the press to a `Button` rather than wrapping it. */
export type DialogCloseProps = {
  asChild?: boolean | undefined;
  className?: string | undefined;
  children?: ReactNode;
};

/**
 * `DialogPortal` and `DialogOverlay` are shadcn's parts for assembling a custom content pane.
 * On native the `Modal` is already the portal, so the portal is a pass-through and the overlay is
 * the same dimmed layer `DialogContent` draws.
 */
export type DialogPortalProps = { children?: ReactNode };
export type DialogOverlayProps = { className?: string | undefined };

export type DialogFooterProps = DialogSectionProps & {
  /** Append an outline "Close" button that shuts the dialog. Default `false`. */
  showCloseButton?: boolean | undefined;
};

/** Every part inside a `Dialog` — content, header, footer, title, description. */
export type DialogSectionProps = {
  className?: string | undefined;
  children?: ReactNode;
};
