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
  /**
   * Told of a press beside the card; `preventDefault` keeps the dialog open. Pass `holdOpen` to
   * refuse every one, so the native backdrop is not announced as a Close button that does not
   * close.
   */
  onInteractOutside?: ((event: Event) => void) | undefined;
  /** `undefined` passed explicitly is how "nothing describes this" is said to radix. */
  "aria-describedby"?: string | undefined;
  /**
   * `alertdialog` for a question that interrupts — "Discard your changes?" — which assistive
   * technology announces as urgent rather than as a place to work. Default `dialog`.
   */
  role?: "dialog" | "alertdialog" | undefined;
};

/**
 * The handler that refuses a close: `onInteractOutside={holdOpen}` keeps the dialog open through a
 * press beside it, as `ConfirmDialog`, `AlertDialog` and a `dismissible={false}` `DialogLayout` do.
 *
 * It is one shared function, not a `preventDefault` each caller writes, because the native
 * backdrop has to know before the press whether it will close. A backdrop that will is a button
 * named Close for a screen reader; one passed this is no button at all, where it used to be read
 * out as Close and then do nothing (#486). A handler of the caller's own still refuses the press,
 * but native cannot tell it will, and reads the backdrop out as Close.
 */
export const holdOpen = (event: Event) => event.preventDefault();

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

/**
 * What counts as a field when a dialog opens: a control a person fills in. A dialog with one
 * focuses the first; a dialog with none focuses its own panel rather than its first button, which
 * then looked hovered — a primary that reads unfilled the moment it appears.
 */
const FIELD_SELECTOR = [
  "input:not([type=hidden])",
  "textarea",
  "select",
  "[contenteditable=true]",
  ...["textbox", "combobox", "checkbox", "switch", "radio", "slider", "spinbutton"].map(
    (role) => `[role=${role}]`,
  ),
].join(",");

/** Whether a field can take focus now: not disabled, drawn, and a stop in the tab order. */
function canFocus(element: HTMLElement): boolean {
  const disabled = element.matches(":disabled") || element.getAttribute("aria-disabled") === "true";
  return disabled === false && element.tabIndex >= 0 && element.getClientRects().length > 0;
}

/** Anything else a keyboard can land on, for an `alertdialog`'s first answer. */
const TABBABLE_SELECTOR = "button, [href], [tabindex]";

/**
 * Moves focus into a dialog that has just opened: to its first field, or to the panel itself when
 * it has none. An `alertdialog` with no field focuses its first answer instead, as radix's does,
 * which is the safe one. Web only, for radix's `onOpenAutoFocus` and for the native half under Expo
 * web; the panel has to be focusable from script (`tabIndex={-1}`) and draws no ring when focused.
 */
export function focusOnOpen(panel: HTMLElement, alert = false): void {
  const all = (selector: string) =>
    Array.from(panel.querySelectorAll<HTMLElement>(selector)).filter(canFocus);
  const target = all(FIELD_SELECTOR)[0] ?? (alert ? all(TABBABLE_SELECTOR)[0] : undefined) ?? panel;
  target.focus({ preventScroll: true });
}

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
 * (the main answer) on top — the same on both platforms (the web half adds `flex`). The row wraps,
 * so three buttons in a narrow dialog move the last down rather than run out of its left edge.
 * `ConfirmDialog` and `DialogLayout` both lay their buttons out with it.
 */
export const DIALOG_FOOTER_CLASS = "flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end";

/** The sentence under the title, on both platforms and in `alert-dialog`. */
export const DIALOG_DESCRIPTION_CLASS = "text-sm text-foreground/60";
