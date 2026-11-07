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

/** The dialog's card, on both platforms. `bg-secondary`, as a `Card` is, so it stands off the page behind the overlay. */
export const DIALOG_CONTENT_CLASS =
  "w-full max-w-lg gap-4 rounded-lg border border-foreground/10 bg-secondary p-6 shadow-lg";

/**
 * The dialog's title, on both platforms and in `alert-dialog`. It names `text-foreground` itself:
 * on the web the card is portalled out of the themed tree, and a title that inherited its colour
 * there was the browser's black on a dark card. `leading-tight`, not `leading-none`: a title that
 * wraps at phone width set its lines touching.
 */
export const DIALOG_TITLE_CLASS =
  "text-lg font-semibold leading-tight tracking-tight text-foreground";

/**
 * The ✕ in the card's corner, on both platforms. `p-1` makes it a 24px target on the web rather
 * than the bare 16px icon, and `right-3 top-3` with it keeps the icon where it was. Under the
 * pointer, the keyboard and a finger it looks the same: hovered.
 */
export const DIALOG_DISMISS_CLASS =
  "absolute right-3 top-3 rounded-sm p-1 text-foreground/60 hover:bg-hover hover:text-foreground focus-visible:bg-hover focus-visible:text-foreground active:bg-hover focus:outline-none";

/** The title and description, left-aligned on both platforms (the web half adds `flex`). */
export const DIALOG_HEADER_CLASS = "flex-col gap-1";

/**
 * The buttons: a right-aligned row, and below `sm` a stack of full-width buttons with the last
 * (the main answer) on top — the same on both platforms (the web half adds `flex`).
 */
export const DIALOG_FOOTER_CLASS = "flex-col-reverse gap-2 sm:flex-row sm:justify-end";

/** The sentence under the title, on both platforms and in `alert-dialog`. */
export const DIALOG_DESCRIPTION_CLASS = "text-sm text-foreground/60";
