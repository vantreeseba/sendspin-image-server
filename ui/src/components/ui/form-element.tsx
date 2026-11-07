import type { FormElementProps } from "@/components/ui/form-element-base";
import { cn } from "@/lib/utils";

/** The element a form renders as: a `<form>` on the web, a `View` on device. */
export function FormElement({ onSubmit, id, className, children }: FormElementProps) {
  return (
    <form
      id={id}
      // A column of fields 16px apart, as the native half; a caller's gap wins, and a row needs
      // `flex-row`.
      className={cn("flex flex-col gap-4", className)}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}
