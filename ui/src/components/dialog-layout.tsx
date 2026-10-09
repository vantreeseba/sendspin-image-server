import type { ReactNode } from "react";
import { useState } from "react";
import { cn, type SlotNode } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { HeaderContentFooter } from "@/components/header-content-footer";

/** How wide the dialog wants to be, past the phone width every size shares. */
const SIZES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
  full: "sm:max-w-[calc(100vw-4rem)]",
} as const;

/**
 * What turns `DialogContent` into a column that can be divided: `flex` replaces the web
 * primitive's `grid` so the body can be handed the leftover height, and `overflow-hidden` takes
 * the scroll off the dialog so the chassis can put it on the body. The cap is the web primitive's
 * own, restated for the styles that ship without one; on device the `Modal` is the screen.
 */
const COLUMN = "flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden";

/**
 * The chassis inside it. `flex-1` on the web, where it sizes from content in a box of no set
 * height; Yoga's `flex: 1` starts from nothing, so on device it starts from its content and
 * shrinks under the cap instead.
 */
const CHASSIS = "min-h-0 flex-1 gap-4";

/** Off the screen and still read. `sr-only` is a clip, which the device does not have. */
const SR_ONLY = "sr-only";

/**
 * The `footerActionsSlot` row: shrinks to the footer and wraps, right-aligned, rather than running
 * its buttons past the dialog's edge on a narrow screen — the same row `CardLayout` draws.
 */
const ACTIONS = "min-w-0 shrink flex-row flex-wrap items-center justify-end gap-2";

export type DialogLayoutProps = {
  /** The body. It is the only part that scrolls. */
  contentSlot: SlotNode;
  /**
   * Required, because a dialog without a title is one no screen reader can announce. A dialog
   * whose design has no room for a heading passes `hideTitle` and keeps this.
   */
  title: ReactNode;
  /** Read to the same people the title is. Absent, the dialog is described by its body. */
  description?: ReactNode | undefined;
  /** Keeps the title for assistive technology and takes it off the screen. */
  hideTitle?: boolean | undefined;
  /**
   * What opens it, wrapped in `DialogTrigger asChild` — pass a `<Button>`, not a bare string.
   * With a trigger and no `open`, the dialog owns its own state and the caller holds none.
   */
  triggerSlot?: SlotNode | undefined;
  /** Controlled open state. Omit both this and `onOpenChange` to let the trigger drive it. */
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  size?: keyof typeof SIZES | undefined;
  /** The footer's start. A destructive action, or a word on why the confirm is refusing. */
  footerSlot?: SlotNode | undefined;
  /**
   * The footer's end. Cancel and confirm. Given alone, the footer is simply right-aligned.
   *
   * Pass a **function** to get the dialog's own close, guarded the same way Escape and the
   * overlay are. A Cancel wired to the caller's `setOpen(false)` goes around the shell entirely,
   * and `hasUnsavedChanges` then covers three of the four ways out — the fourth being the one
   * people click. Taking `close` from here is the same close the other three doors use, so
   * unsaved work asks on the way through it too.
   *
   * ```tsx
   * footerActionsSlot={(close) => (
   *   <>
   *     <Button variant="outline" onClick={close} content="Cancel" />
   *     <Button onClick={save} content="Save" />
   *   </>
   * )}
   * ```
   *
   * Only this slot takes the function. `footerSlot` is the other end — a destructive action, or a
   * word on why the confirm is refusing — and nothing there closes the dialog on the way out.
   */
  footerActionsSlot?: SlotNode | ((close: () => void) => SlotNode) | undefined;
  /**
   * Whether Escape and a click on the overlay close it. Off refuses to leave; prefer
   * `hasUnsavedChanges`, which asks on the way out instead.
   */
  dismissible?: boolean | undefined;
  /**
   * There is work in the body that closing would throw away. Escape, a click on the overlay, the
   * close button and a `footerActionsSlot` Cancel then ask first, and the dialog stays open if the
   * answer is no.
   *
   * Asked for, never computed — only the caller knows what its fields are.
   *
   * **Pass a function when the answer is not something you render.** The question is asked once,
   * at a click: nothing here draws the answer, there is no dirty dot and no Save reading off it.
   * A boolean makes the caller maintain, in render, a value only a handler consumes — which for
   * a TanStack form means `useStore(form.store, …)` and a re-render on the transition to keep a
   * boolean this looks at once, and for work that is *not* a form field means lifting a knowable
   * fact into state as a second source of truth. The thunk runs at the click, so neither is
   * needed:
   *
   * ```tsx
   * hasUnsavedChanges={() => !form.state.isDefaultValue || picker.hasEdits()}
   * ```
   *
   * `isDefaultValue` and not `isDirty`, when it is a form. `isDirty` stays true for a field
   * typed into and then typed back out of, so the dialog asks whether to throw away changes to a
   * form identical to how it opened.
   */
  hasUnsavedChanges?: boolean | (() => boolean) | undefined;
  /** The question that asks. Defaulted, because this one really is the same everywhere. */
  discardTitle?: ReactNode | undefined;
  discardDescription?: ReactNode | undefined;
  /** The verb that throws the work away, and the one that goes back to it. */
  discardLabel?: ReactNode | undefined;
  keepLabel?: ReactNode | undefined;
  showCloseButton?: boolean | undefined;
  className?: string | undefined;
  headerClassName?: string | undefined;
  contentClassName?: string | undefined;
  footerClassName?: string | undefined;
};

/**
 * A dialog with its slots already placed, and a body that scrolls under a header and above a
 * footer that do not. The scrolling shape is {@link HeaderContentFooter}'s, composed here.
 *
 * `hasUnsavedChanges` is a prop and not a hook, because a hook is a thing a caller can forget to
 * wire into closing. Padding stays with `DialogContent`, which differs between shadcn styles, so
 * this overrides only `display` and `overflow`.
 */
export function DialogLayout({
  contentSlot,
  title,
  description,
  hideTitle = false,
  triggerSlot,
  open,
  onOpenChange,
  size = "md",
  footerSlot,
  footerActionsSlot,
  dismissible = true,
  hasUnsavedChanges = false,
  discardTitle = "Discard your changes?",
  discardDescription = "What you have typed here will not be saved.",
  discardLabel = "Discard",
  keepLabel = "Keep editing",
  showCloseButton = true,
  className,
  headerClassName,
  contentClassName,
  footerClassName,
}: DialogLayoutProps) {
  const stop = dismissible ? undefined : (event: Event) => event.preventDefault();

  // Radix is handed an `open` either way, so one `requestClose` covers Escape, the overlay and
  // the close button alike. Uncontrolled, the state simply lives here instead of in the
  // primitive; a caller who passes `open` still owns it, and still hears every change.
  const [selfOpen, setSelfOpen] = useState(false);
  const isOpen = open ?? selfOpen;

  const setOpenState = (next: boolean) => {
    if (open === undefined) {
      setSelfOpen(next);
    }
    onOpenChange?.(next);
  };

  const [askingToDiscard, setAskingToDiscard] = useState(false);

  const requestOpenChange = (next: boolean) => {
    // Evaluated here and nowhere else, which is the whole of what the function form buys: it runs
    // on the paths that can close and never during a render, so a caller can read a store or ask
    // a child without subscribing to either.
    const unsaved =
      typeof hasUnsavedChanges === "function" ? hasUnsavedChanges() : hasUnsavedChanges;
    if (next === false && unsaved) {
      setAskingToDiscard(true);
      return;
    }
    setOpenState(next);
  };

  const closeFromFooter = () => requestOpenChange(false);

  const discard = () => {
    setAskingToDiscard(false);
    setOpenState(false);
  };

  // The same close Escape, the overlay and the close button go through, handed to the footer so
  // a Cancel there is guarded by the thing that guards them.
  const actions =
    typeof footerActionsSlot === "function"
      ? footerActionsSlot(closeFromFooter)
      : footerActionsSlot;

  // Asked of what the footer actually rendered: a function that returns nothing should leave the
  // dialog with no footer, not with an empty one taking up a row.
  const hasFooter = Boolean(footerSlot || actions);

  // Keeping the question's answer from being given by accident: a click on the overlay does not
  // answer "discard?", which is what the web-only `alert-dialog` refused as well.
  const holdOpen = (event: Event) => event.preventDefault();

  const discardQuestion = (
    <Dialog open={askingToDiscard} onOpenChange={setAskingToDiscard}>
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        onInteractOutside={holdOpen}
        className="sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>{discardTitle}</DialogTitle>
          <DialogDescription>{discardDescription}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {/* First, so it is where focus lands: the safe answer is the one a stray Enter gives. */}
          <Button variant="outline" onClick={() => setAskingToDiscard(false)} content={keepLabel} />
          <Button variant="destructive" onClick={discard} content={discardLabel} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      <Dialog open={isOpen} onOpenChange={requestOpenChange}>
        {triggerSlot ? <DialogTrigger asChild>{triggerSlot}</DialogTrigger> : null}

        <DialogContent
          showCloseButton={showCloseButton}
          onEscapeKeyDown={stop}
          onInteractOutside={stop}
          // Radix warns when nothing describes the content. Without a description that is the
          // intent, and an explicit `undefined` is how it is said — spread only in that case,
          // because the prop is applied after the primitive's own and would unlink a real one.
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cn(COLUMN, SIZES[size], className)}
        >
          <HeaderContentFooter
            scroll
            className={CHASSIS}
            headerSlot={
              <DialogHeader
                // The close button is positioned against the dialog, not the header, so a long
                // title runs under it without this.
                className={cn(showCloseButton && "pr-6", headerClassName)}
              >
                <DialogTitle className={cn(hideTitle && SR_ONLY)}>{title}</DialogTitle>
                {description ? <DialogDescription>{description}</DialogDescription> : null}
              </DialogHeader>
            }
            // Four pixels of room either side, given back as padding: a focus ring is drawn
            // outside the element that owns it, and a scroll container clips at its edge.
            contentClassName={cn("-mx-1 px-1", contentClassName)}
            contentSlot={contentSlot}
            footerSlot={
              hasFooter ? (
                <DialogFooter
                  className={cn(
                    footerSlot && footerActionsSlot && "sm:justify-between",
                    footerClassName,
                  )}
                >
                  {footerSlot}
                  {actions ? <div className={cn("cube-rn-view", ACTIONS)}>{actions}</div> : null}
                </DialogFooter>
              ) : null
            }
          />

          {/* On device the question is a `Modal` presented over this one, and iOS presents a
              second modal only from inside the first. */}
          {null}
        </DialogContent>
      </Dialog>

      {/* On the web, a sibling of the dialog rather than a child of it: two modals nested in the
          DOM fight over the focus trap, and the question has to be able to take focus from the
          form it is about. */}
      {discardQuestion}
    </>
  );
}
