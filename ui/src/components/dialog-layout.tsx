import type { ReactNode } from "react";
import { useState } from "react";
import { cn, type SlotNode } from "@/lib/utils";
import { CardLayout, type FloatingSurface, FloatingSurfaceContext } from "@/components/card-layout";
import { ConfirmDialog, DISCARD_QUESTION } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

/** Off the screen and still read. `sr-only` is a clip, which the device does not have. */
const SR_ONLY = "sr-only";

/**
 * The chassis on the panel. `flex-1` on the web, where it sizes from content in a box of no set
 * height; Yoga's `flex: 1` starts from nothing, so on device it starts from its content and
 * shrinks under the panel's cap instead.
 */
const CHASSIS = "min-h-0 flex-1 gap-4";

/**
 * What `wrapperSlot`'s element takes on the panel, so it stands where the chassis stood: the same
 * share of the panel's height, passed on to the chassis inside it. Without it the wrapper is a box
 * of its content's height and the body stops scrolling.
 */
const WRAPPER = "flex min-h-0 flex-1 flex-col";

/**
 * The dialog's parts, handed to the `CardLayout` on its panel: the title names the dialog, the
 * description describes it, the body is the one part that scrolls, and the footer stacks below
 * `sm`. They live here rather than in the card so that a card installed alone carries no dialog.
 */
const DIALOG_SURFACE: FloatingSurface = {
  drawTitle: (title, className) => <DialogTitle className={className}>{title}</DialogTitle>,
  drawDescription: (description) => <DialogDescription>{description}</DialogDescription>,
  drawParts: ({
    headerSlot,
    contentSlot,
    contentClassName,
    footerSlot,
    footerClassName,
    wrapperSlot,
  }) => {
    const chassis = (
      <HeaderContentFooter
        scroll
        className={CHASSIS}
        headerSlot={headerSlot}
        // Four pixels of room either side, given back as padding: a focus ring is drawn outside
        // the element that owns it, and a scroll container clips at its edge.
        contentClassName={cn("-mx-1 min-w-0 px-1", contentClassName)}
        contentSlot={contentSlot}
        footerSlot={
          footerSlot ? <DialogFooter className={footerClassName}>{footerSlot}</DialogFooter> : null
        }
      />
    );
    return wrapperSlot ? wrapperSlot(chassis, { className: WRAPPER }) : chassis;
  },
};

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
   * Sits before the title. On the web it is sized to the text — pass a bare `<Plus />`. On device
   * an icon cannot be sized from outside it, so pass it at the size you want.
   */
  iconSlot?: SlotNode | undefined;
  /** The header's far end, clear of the close button: a menu, a status badge, a switch. */
  actionSlot?: SlotNode | undefined;
  /**
   * Shown instead of `contentSlot` when there is nothing in it: no element, or a `List` with no
   * rows — `CardLayout`'s rule.
   */
  emptySlot?: SlotNode | undefined;
  /**
   * Whether the body is still being fetched. On, a skeleton stands in for it and `emptySlot` is
   * not consulted. The title and the footer stay.
   */
  loading?: boolean | undefined;
  /**
   * What opens it, wrapped in `DialogTrigger asChild` — pass a `<Button>`, not a bare string.
   * With a trigger and no `open`, the dialog owns its own state and the caller holds none.
   */
  triggerSlot?: SlotNode | undefined;
  /** Controlled open state. Omit both this and `onOpenChange` to let the trigger drive it. */
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  size?: keyof typeof SIZES | undefined;
  /**
   * The footer's start. A destructive action, or a word on why the confirm is refusing. Several
   * elements sit together in one row with a small gap; `footerActionsSlot` stays at the far end.
   */
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
   * Wraps the header, the body and the footer together, inside the dialog. Its use is a form:
   * with the fields and the submit button under one `<form>`, Enter in a field submits it and the
   * footer's submit button is a real one. A `<form>` around the body alone leaves the button
   * outside it, where the browser does not count it, and Enter in a form of two fields does
   * nothing.
   *
   * A function of the parts, called rather than mounted, so the fields inside it keep their
   * state from one render to the next — a component written inline here would be a new type
   * every render, and React would rebuild everything under it. The element it returns takes
   * `className`, which keeps the body scrolling under a header and above a footer that do not.
   *
   * ```tsx
   * wrapperSlot={(parts, { className }) => (
   *   <form.AppForm>
   *     <FormElement onSubmit={() => form.handleSubmit()} className={className}>
   *       {parts}
   *     </FormElement>
   *   </form.AppForm>
   * )}
   * ```
   */
  wrapperSlot?: ((parts: SlotNode, wrapper: { className: string }) => SlotNode) | undefined;
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
  /**
   * The question that asks: "Discard your changes?". Defaulted, because this one really is the
   * same everywhere.
   */
  discardTitle?: ReactNode | undefined;
  /** The line under it: "What you have typed here will not be saved." */
  discardDescription?: ReactNode | undefined;
  /** The verb that throws the work away: "Discard". */
  discardLabel?: ReactNode | undefined;
  /** The verb that goes back to it: "Keep editing". Also what Escape answers. */
  keepLabel?: ReactNode | undefined;
  showCloseButton?: boolean | undefined;
  className?: string | undefined;
  headerClassName?: string | undefined;
  contentClassName?: string | undefined;
  footerClassName?: string | undefined;
};

/**
 * A dialog with its slots already placed, and a body that scrolls under a header and above a
 * footer that do not. The parts are a {@link CardLayout} on the dialog's panel: the panel draws
 * the border, fill, shadow and inset, and the card draws no surface of its own.
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
  iconSlot,
  actionSlot,
  emptySlot,
  loading = false,
  triggerSlot,
  open,
  onOpenChange,
  size = "md",
  footerSlot,
  footerActionsSlot,
  wrapperSlot,
  dismissible = true,
  hasUnsavedChanges = false,
  discardTitle = DISCARD_QUESTION.title,
  discardDescription = DISCARD_QUESTION.description,
  discardLabel = DISCARD_QUESTION.discardLabel,
  keepLabel = DISCARD_QUESTION.keepLabel,
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

  // The card draws on the panel: `DialogContent` is the surface, and the card's parts sit at its
  // inset. A function `footerActionsSlot` that returns nothing leaves the card with no footer.
  const card = (
    <FloatingSurfaceContext.Provider value={DIALOG_SURFACE}>
      <CardLayout
        title={title}
        description={description}
        iconSlot={iconSlot}
        actionSlot={actionSlot}
        contentSlot={contentSlot}
        emptySlot={emptySlot}
        loading={loading}
        footerSlot={footerSlot}
        footerActionsSlot={actions}
        wrapperSlot={wrapperSlot}
        // The close button is positioned against the dialog, not the header, so a long title or
        // a header action runs under it without this.
        headerClassName={cn(showCloseButton && "pr-6", headerClassName)}
        titleClassName={cn(hideTitle && SR_ONLY)}
        contentClassName={contentClassName}
        footerClassName={footerClassName}
      />
    </FloatingSurfaceContext.Provider>
  );

  // ConfirmDialog holds the overlay click (it does not answer "discard?") and puts the safe
  // answer first, where focus lands. The labels are passed: its own defaults are Confirm/Cancel.
  const discardQuestion = (
    <ConfirmDialog
      open={askingToDiscard}
      onOpenChange={setAskingToDiscard}
      title={discardTitle}
      description={discardDescription}
      confirmLabel={discardLabel}
      cancelLabel={keepLabel}
      onConfirm={discard}
    />
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
          {/* Inside `DialogContent`, so a wrapper is in the dialog's focus trap and under its
              role, and the close button stays outside it. */}
          {card}

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
