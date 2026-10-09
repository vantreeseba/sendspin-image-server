import {
  type ComponentPropsWithoutRef,
  type KeyboardEventHandler,
  type Ref,
  useLayoutEffect,
  useRef,
} from "react";
import {
  fitRows,
  isSubmitKey,
  type TextareaProps as SharedTextareaProps,
  TEXTAREA_CLASS,
  type TextareaHandle,
  type TextareaKeyPressEvent,
  type TextareaKeyPressHandler,
  type TextareaSelection,
} from "@/components/ui/textarea-base";
import { cn } from "@/lib/utils";

/**
 * The shared contract, widened to everything a DOM `<textarea>` takes. `onKeyPress` hands over
 * the React keyboard event, which is a shared handler's `{ nativeEvent: { key } }` and a shadcn
 * call site's `e.key` at once, and the ref is the element, which is a `TextareaHandle` too.
 */
export type TextareaProps = Omit<ComponentPropsWithoutRef<"textarea">, "className" | "onKeyPress"> &
  Omit<SharedTextareaProps, "onBlur" | "value" | "onKeyPress" | "ref"> & {
    value?: ComponentPropsWithoutRef<"textarea">["value"];
    onKeyPress?: KeyboardEventHandler<HTMLTextAreaElement> | undefined;
    ref?: Ref<HTMLTextAreaElement> | Ref<TextareaHandle> | undefined;
  };

/** A multi-line text box. */
function Textarea({
  onChange,
  onChangeText,
  onSelect,
  selection,
  onSelectionChange,
  onKeyDown,
  onKeyPress,
  onSubmitEditing,
  onEscape,
  rows,
  maxRows,
  className,
  ref,
  ...props
}: TextareaProps) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const grows = maxRows !== undefined;
  const minRows = rows ?? 1;
  const refit = () => {
    if (grows && inner.current) {
      fitRows(inner.current, minRows, maxRows);
    }
  };
  // After every render and not only a changed `value`: the text can also arrive as a new
  // `defaultValue`, and the box can change width under it.
  useLayoutEffect(refit);

  // The caret is the element's own, so a held `selection` is written to it after each render,
  // once the new text is in the box and there is somewhere to put it.
  const start = selection?.start;
  const end = selection?.end;
  useLayoutEffect(() => {
    const box = inner.current;
    if (!box || start === undefined || end === undefined) {
      return;
    }
    if (box.selectionStart !== start || box.selectionEnd !== end) {
      box.setSelectionRange(start, end);
    }
  });

  // Told once per change. React's `select` covers the keys and the pointer but arrives a keyup
  // after the text, and a menu reading both would see the new text with the old caret between.
  const reported = useRef<TextareaSelection | null>(null);
  const report = (box: HTMLTextAreaElement) => {
    if (!onSelectionChange) {
      return;
    }
    const next = { start: box.selectionStart, end: box.selectionEnd };
    if (reported.current?.start === next.start && reported.current.end === next.end) {
      return;
    }
    reported.current = next;
    onSelectionChange(next);
  };

  return (
    <textarea
      // The element is the handle: it has `focus`, which is all `TextareaHandle` asks. It is kept
      // here too, to be measured.
      ref={(element) => {
        inner.current = element;
        const outer = ref as Ref<HTMLTextAreaElement> | undefined;
        if (typeof outer === "function") {
          return outer(element);
        }
        if (outer) {
          outer.current = element;
        }
      }}
      data-slot="textarea"
      rows={grows ? minRows : rows}
      onChange={(e) => {
        onChange?.(e);
        onChangeText?.(e.target.value);
        // An uncontrolled box does not render again on a keystroke.
        refit();
        report(e.target);
      }}
      onSelect={(e) => {
        onSelect?.(e);
        report(e.currentTarget);
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        // `keydown`, not the DOM's `keypress`, which never fires for Escape. As `Input` does.
        onKeyPress?.(e);
        if (e.defaultPrevented) {
          return;
        }
        if (onSubmitEditing && isSubmitKey(e.nativeEvent)) {
          // Held back, or the Enter that sent the message would also add a line to the next.
          e.preventDefault();
          onSubmitEditing();
        } else if (e.key === "Escape") {
          onEscape?.();
        }
      }}
      {...props}
      className={cn(
        TEXTAREA_CLASS,
        // `resize-y` is the browser's own affordance and has no native
        // counterpart; `disabled:` is the DOM attribute doing what the native
        // half spells out as `disabled && "opacity-50"`.
        "resize-y disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-negative aria-invalid:focus:border-active",
        // A box that sizes itself has no corner to drag, and lets go of the class's 80px floor.
        grows && "min-h-0 resize-none",
        className,
      )}
    />
  );
}

export type { TextareaHandle, TextareaKeyPressEvent, TextareaKeyPressHandler, TextareaSelection };
export { Textarea };
