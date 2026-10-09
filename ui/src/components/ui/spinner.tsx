import { type SpinnerProps, spinnerClass } from "@/components/ui/spinner-base";
import { cn } from "@/lib/utils";
/**
 * The web spinner: shadcn's — `LoaderCircle` with `animate-spin`, a
 * `role="status"` named `Loading`. `spinner.tsx` is the native counterpart and
 * its header says why it is not `ActivityIndicator`; `spinner-base.ts` holds
 * what they share.
 *
 * It takes `label` and `className` and nothing else, as the native half does:
 * shadcn's spreads the rest of the `<svg>`'s attributes, and a call site that
 * passed one is rare enough to wrap the glyph itself.
 *
 * The glyph is `currentColor`, so it takes the colour of the text around it —
 * a button's label, a muted line — unless `className` names one.
 */
import { LoaderCircle } from "@/components/ui/icons";

export type { SpinnerProps };

/** A turning glyph that says something is loading. */
export function Spinner({ label = "Loading", className }: SpinnerProps) {
  return (
    <LoaderCircle
      data-slot="spinner"
      role="status"
      aria-label={label}
      className={cn(spinnerClass, "animate-spin", className)}
    />
  );
}
