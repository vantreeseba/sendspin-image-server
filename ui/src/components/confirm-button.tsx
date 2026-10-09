import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";
import { ActionButton } from "@/components/action-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/*
 * Both press names, because the compiler renames a prop where it is declared or passed and not a
 * key written as a string: `"onPress"` alone would leave the compiled half's `onClick` in the type,
 * accepted and then dropped. The press is what opens the question, so neither half takes one.
 */
type ConfirmButtonProps = Omit<ComponentProps<typeof ActionButton>, "onPress" | "onClick"> & {
  /** The question, as a heading. "Delete this workspace?" */
  title: ReactNode;
  /**
   * What is lost if they say yes. Required, and it is the reason the component is worth
   * installing — see the note below.
   */
  description: ReactNode;
  /** The verb on the button that does it. */
  confirmLabel?: ReactNode | undefined;
  cancelLabel?: ReactNode | undefined;
  /**
   * The text to type before the confirm button unlocks — the name of the folder, the
   * repository, the workspace. Matched exactly. For a delete that is big and cannot be undone;
   * left out, the dialog asks with one click.
   */
  requireText?: string | undefined;
  /** The input's label. Defaults to "Type **{requireText}** to confirm". */
  requireTextLabel?: ReactNode | undefined;
  onConfirm: () => void;
};

/**
 * A button that asks first: an {@link ActionButton} that opens `ConfirmDialog`, the same card
 * `confirm()` raises. Destructive only; a confirm that is not destructive is a question, and a
 * question is `DialogLayout`.
 *
 * `description` is required because it says what is lost, which is the sentence that gets skipped
 * when it is optional. The open state is held here rather than through `DialogTrigger asChild`,
 * since the trigger is already a `TooltipTrigger asChild` and two `Slot`s over one button fight
 * over the ref. `requireText` is the type-the-name mode, and the box empties each time the dialog
 * opens.
 */
export function ConfirmButton({
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  requireText,
  requireTextLabel,
  onConfirm,
  ...props
}: ConfirmButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ActionButton {...props} onClick={() => setOpen(true)} />
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        requireText={requireText}
        requireTextLabel={requireTextLabel}
        // `ConfirmDialog` leaves closing to its caller, for the button and for Enter alike.
        onConfirm={() => {
          setOpen(false);
          onConfirm();
        }}
      />
    </>
  );
}
